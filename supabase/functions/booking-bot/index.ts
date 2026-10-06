// Bot Telegram do moderacji spotkań (Supabase Edge Function, jeden plik).
//
//  1. Strona po zapisie wywołuje tę funkcję ({ action: 'notify', token }).
//     Bot wysyła Ci wiadomość z przyciskami „Zaakceptuj” i „Odrzuć”.
//  2. Telegram po kliknięciu przycisku wywołuje tę samą funkcję (webhook).
//     Funkcja zmienia status w bazie i wysyła e-mail do znajomego przez EmailJS.
//
// WAŻNE: w ustawieniach funkcji wyłącz „Verify JWT” (Telegram nie wysyła tokena Supabase).
// Sekrety i instrukcja: README.md, sekcja „Powiadomienia na Telegramie”.

export type Booking = {
  id: string;
  day: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  name: string;
  email: string | null;
  note: string | null;
  cancel_token: string;
  status: string;
};

export interface Store {
  claimNotification(token: string): Promise<Booking | null>;
  releaseNotification(id: string): Promise<void>;
  getBooking(id: string): Promise<Booking | null>;
  acceptIfPending(id: string): Promise<Booking | null>;
  deleteIfPending(id: string): Promise<Booking | null>;
  markEmailSent(id: string): Promise<void>;
}

type Env = Record<string, string | undefined>;
type Deps = { env: Env; store: Store; fetch: typeof fetch };
type Mail = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hhmm = (t: string) => t.slice(0, 5);
const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const dayLong = (day: string) =>
  new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${day}T12:00:00Z`)
  );

const whenText = (b: Booking) => (b.all_day ? 'cały dzień' : `${hhmm(b.start_time)}–${hhmm(b.end_time)}`);

function durationText(b: Booking) {
  if (b.all_day) return '';
  const min = toMin(b.end_time) - toMin(b.start_time);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return ` (${h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`})`;
}

export function bookingText(b: Booking, statusLine?: string) {
  const lines = [
    '🔔 <b>Nowa prośba o spotkanie</b>',
    '',
    `📅 ${esc(dayLong(b.day))}`,
    `🕐 ${esc(whenText(b))}${durationText(b)}`,
    `👤 ${esc(b.name)}`,
  ];
  if (b.note) lines.push(`📝 ${esc(b.note)}`);
  if (statusLine) lines.push('', statusLine);
  return lines.join('\n');
}

const mainKeyboard = (id: string) => ({
  inline_keyboard: [
    [
      { text: '✅ Zaakceptuj', callback_data: `a:${id}` },
      { text: '❌ Odrzuć', callback_data: `r:${id}` },
    ],
  ],
});

const confirmKeyboard = (id: string) => ({
  inline_keyboard: [
    [
      { text: 'Tak, odrzuć', callback_data: `rc:${id}` },
      { text: 'Wróć', callback_data: `rx:${id}` },
    ],
  ],
});

export function createHandler({ env, store, fetch: doFetch }: Deps) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  };
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  async function tg(method: string, payload: Record<string, unknown>) {
    const res = await doFetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && data?.ok !== false;
  }

  async function sendEmail(templateId: string | undefined, b: Booking): Promise<Mail> {
    if (!env.EMAILJS_SERVICE_ID || !templateId || !env.EMAILJS_PUBLIC_KEY || !env.EMAILJS_PRIVATE_KEY) {
      return { ok: false, error: 'brak konfiguracji EmailJS' };
    }
    const site = (env.SITE_URL || '').replace(/\/$/, '');
    try {
      const res = await doFetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: env.EMAILJS_SERVICE_ID,
          template_id: templateId,
          user_id: env.EMAILJS_PUBLIC_KEY,
          accessToken: env.EMAILJS_PRIVATE_KEY,
          template_params: {
            to_email: b.email,
            to_name: b.name,
            date: dayLong(b.day),
            time: whenText(b),
            cancel_link: `${site}/#/anuluj/${b.cancel_token}`,
            site_title: env.SITE_TITLE || 'Złap Lunę',
          },
        }),
      });
      if (res.ok) return { ok: true };
      const text = await res.text().catch(() => '');
      return { ok: false, error: `${res.status}: ${text}`.slice(0, 140) };
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message || e).slice(0, 140) };
    }
  }

  // ---------- 1. Strona zgłasza nową prośbę ----------

  async function handleNotify(req: Request) {
    let body: { action?: string; token?: string } = {};
    try {
      body = await req.json();
    } catch {
      return reply(400, { ok: false });
    }
    if (body.action !== 'notify' || !body.token || !UUID.test(body.token)) return reply(400, { ok: false });
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return reply(503, { ok: false, error: 'not configured' });

    // jedno powiadomienie na zapis, nawet przy wielokrotnym wywołaniu
    const booking = await store.claimNotification(body.token);
    if (!booking) return reply(200, { ok: true, sent: false });

    const sent = await tg('sendMessage', {
      chat_id: env.TELEGRAM_CHAT_ID,
      text: bookingText(booking),
      parse_mode: 'HTML',
      reply_markup: mainKeyboard(booking.id),
    });
    if (!sent) {
      await store.releaseNotification(booking.id);
      return reply(502, { ok: false });
    }
    return reply(200, { ok: true, sent: true });
  }

  // ---------- 2. Telegram: kliknięcia przycisków i wiadomości ----------

  async function handleTelegram(req: Request) {
    if (!env.TELEGRAM_WEBHOOK_SECRET || req.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_WEBHOOK_SECRET) {
      return reply(401, { ok: false });
    }
    // zawsze 200 do Telegrama, inaczej będzie ponawiał
    const update = await req.json().catch(() => ({}));

    // /start albo /id: bot podaje ID czatu (do konfiguracji TELEGRAM_CHAT_ID)
    const msg = update?.message;
    if (msg?.text && /^\/(start|id)\b/.test(msg.text)) {
      await tg('sendMessage', {
        chat_id: msg.chat.id,
        parse_mode: 'HTML',
        text: `Twoje ID czatu: <code>${esc(String(msg.chat.id))}</code>\nWpisz je jako sekret TELEGRAM_CHAT_ID w Supabase.`,
      });
      return reply(200, { ok: true });
    }

    const cq = update?.callback_query;
    if (!cq) return reply(200, { ok: true });

    const answer = (text: string, alert = false) =>
      tg('answerCallbackQuery', { callback_query_id: cq.id, text, show_alert: alert });

    if (!env.TELEGRAM_CHAT_ID || String(cq.from?.id) !== String(env.TELEGRAM_CHAT_ID)) {
      await answer('Brak uprawnień', true);
      return reply(200, { ok: true });
    }

    const chatId = cq.message?.chat?.id;
    const messageId = cq.message?.message_id;
    const edit = (text: string) =>
      chatId && messageId
        ? tg('editMessageText', {
            chat_id: chatId,
            message_id: messageId,
            text,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [] },
          })
        : Promise.resolve(false);
    const setKeyboard = (kb: unknown) =>
      chatId && messageId
        ? tg('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: kb })
        : Promise.resolve(false);
    const gone = async () => {
      const original = esc(String(cq.message?.text || ''));
      await edit(`${original}\n\n⚠️ Ta prośba już nie istnieje (odwołana lub usunięta).`);
      await answer('Ta prośba już nie istnieje');
    };

    const [action, id] = String(cq.data || '').split(':');
    if (!id || !UUID.test(id)) {
      await answer('Nieznana akcja');
      return reply(200, { ok: true });
    }

    if (action === 'r') {
      await setKeyboard(confirmKeyboard(id));
      await answer('Na pewno odrzucić?');
    } else if (action === 'rx') {
      await setKeyboard(mainKeyboard(id));
      await answer('Wrócono');
    } else if (action === 'a') {
      const b = await store.acceptIfPending(id);
      if (!b) {
        const cur = await store.getBooking(id);
        if (cur?.status === 'accepted') {
          await edit(bookingText(cur, '✅ To spotkanie jest już zatwierdzone.'));
          await answer('Już zatwierdzone');
        } else await gone();
      } else {
        let line = '✅ <b>Zaakceptowano.</b>';
        if (!b.email) line += '\nBrak adresu e-mail, więc nic nie wysłano.';
        else {
          const mail = await sendEmail(env.EMAILJS_TEMPLATE_ID, b);
          if (mail.ok) {
            await store.markEmailSent(b.id);
            line += '\nE-mail z potwierdzeniem wysłano.';
          } else {
            line += `\n⚠️ Nie udało się wysłać e-maila (${esc(mail.error)}). Wyślij go z panelu przyciskiem „Wyślij e-mail ponownie”.`;
          }
        }
        await edit(bookingText(b, line));
        await answer('Zaakceptowano');
      }
    } else if (action === 'rc') {
      const b = await store.deleteIfPending(id);
      if (!b) {
        const cur = await store.getBooking(id);
        if (cur?.status === 'accepted') {
          await edit(bookingText(cur, '✅ To spotkanie jest już zatwierdzone, więc go nie odrzucono.'));
          await answer('Już zatwierdzone');
        } else await gone();
      } else {
        let line = '❌ <b>Odrzucono.</b> Termin znów jest wolny.';
        if (b.email && env.EMAILJS_REJECT_TEMPLATE_ID) {
          const mail = await sendEmail(env.EMAILJS_REJECT_TEMPLATE_ID, b);
          line += mail.ok ? '\nE-mail z informacją wysłano.' : `\n⚠️ Nie udało się wysłać e-maila (${esc(mail.error)}).`;
        } else {
          line += '\nZnajomy nie dostał wiadomości.';
        }
        await edit(bookingText(b, line));
        await answer('Odrzucono');
      }
    } else {
      await answer('Nieznana akcja');
    }
    return reply(200, { ok: true });
  }

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return reply(405, { ok: false });
    try {
      // Telegram zawsze dodaje nagłówek z sekretem; zapytania ze strony go nie mają
      if (req.headers.get('x-telegram-bot-api-secret-token') !== null) return await handleTelegram(req);
      return await handleNotify(req);
    } catch (e) {
      console.error('booking-bot error', e);
      return reply(500, { ok: false });
    }
  };
}

// ---------- uruchomienie w Supabase (Deno); w testach ta część się pomija ----------

const D = (globalThis as any).Deno;
if (D && typeof D.serve === 'function') {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const db = createClient(D.env.get('SUPABASE_URL'), D.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
  const now = () => new Date().toISOString();

  const store: Store = {
    async claimNotification(token) {
      const { data } = await db
        .from('bookings')
        .update({ telegram_notified_at: now() })
        .eq('cancel_token', token)
        .eq('status', 'pending')
        .is('telegram_notified_at', null)
        .select('*')
        .maybeSingle();
      return data ?? null;
    },
    async releaseNotification(id) {
      await db.from('bookings').update({ telegram_notified_at: null }).eq('id', id);
    },
    async getBooking(id) {
      const { data } = await db.from('bookings').select('*').eq('id', id).maybeSingle();
      return data ?? null;
    },
    async acceptIfPending(id) {
      const { data } = await db
        .from('bookings')
        .update({ status: 'accepted' })
        .eq('id', id)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle();
      return data ?? null;
    },
    async deleteIfPending(id) {
      const { data } = await db.from('bookings').delete().eq('id', id).eq('status', 'pending').select('*').maybeSingle();
      return data ?? null;
    },
    async markEmailSent(id) {
      await db.from('bookings').update({ notified_at: now() }).eq('id', id);
    },
  };

  D.serve(createHandler({ env: D.env.toObject(), store, fetch }));
}
