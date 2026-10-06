// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { createHandler, bookingText } from '../supabase/functions/booking-bot/index.ts';

const ID = '11111111-1111-1111-1111-111111111111';
const TOKEN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CHAT = '555';

const baseBooking = {
  id: ID, day: '2026-10-15', start_time: '10:00:00', end_time: '12:00:00', all_day: false,
  name: 'Ania <b>', email: 'ania@x.pl', note: 'kawa & ciasto', cancel_token: TOKEN,
  status: 'pending', telegram_notified_at: null, notified_at: null,
};

function makeStore(rowsIn) {
  const rows = new Map(rowsIn.map((b) => [b.id, { ...b }]));
  const log = [];
  return {
    rows, log,
    claimNotification: async (token) => {
      const b = [...rows.values()].find((r) => r.cancel_token === token && r.status === 'pending' && !r.telegram_notified_at);
      if (!b) return null;
      b.telegram_notified_at = 'x'; log.push(['claim', b.id]); return { ...b };
    },
    releaseNotification: async (id) => { rows.get(id).telegram_notified_at = null; log.push(['release', id]); },
    getBooking: async (id) => (rows.has(id) ? { ...rows.get(id) } : null),
    acceptIfPending: async (id) => {
      const b = rows.get(id); if (!b || b.status !== 'pending') return null;
      b.status = 'accepted'; log.push(['accept', id]); return { ...b };
    },
    deleteIfPending: async (id) => {
      const b = rows.get(id); if (!b || b.status !== 'pending') return null;
      rows.delete(id); log.push(['delete', id]); return { ...b };
    },
    markEmailSent: async (id) => { rows.get(id).notified_at = 'x'; log.push(['emailSent', id]); },
  };
}

const ENV = {
  TELEGRAM_BOT_TOKEN: 'bot-token', TELEGRAM_CHAT_ID: CHAT, TELEGRAM_WEBHOOK_SECRET: 'sekret',
  EMAILJS_SERVICE_ID: 'svc', EMAILJS_TEMPLATE_ID: 'tpl_ok', EMAILJS_REJECT_TEMPLATE_ID: 'tpl_no',
  EMAILJS_PUBLIC_KEY: 'pub', EMAILJS_PRIVATE_KEY: 'priv', SITE_URL: 'https://strona.example/',
};

let calls, store, opts;
const fakeFetch = async (url, init) => {
  const body = init?.body ? JSON.parse(init.body) : null;
  calls.push({ url, body });
  if (url.includes('emailjs')) {
    return { ok: opts.emailOk, status: opts.emailOk ? 200 : 422, text: async () => (opts.emailOk ? 'OK' : 'The recipients address is empty') };
  }
  const ok = !(opts.telegramFail && url.includes('/sendMessage'));
  return { ok, status: ok ? 200 : 500, json: async () => ({ ok }) };
};
const make = (env = ENV) => createHandler({ env, store, fetch: fakeFetch });
const post = (handler, body, headers = {}) =>
  handler(new Request('https://f/', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }));
const tgPost = (handler, update, secret = 'sekret') => post(handler, update, { 'x-telegram-bot-api-secret-token': secret });
const click = (data, from = Number(CHAT)) => ({
  callback_query: { id: 'cb1', from: { id: from }, data, message: { message_id: 9, chat: { id: Number(CHAT) }, text: 'stara treść' } },
});
const tgCalls = (method) => calls.filter((c) => c.url.includes(`/${method}`));
const emailCalls = () => calls.filter((c) => c.url.includes('emailjs'));

beforeEach(() => {
  calls = []; opts = { emailOk: true, telegramFail: false };
  store = makeStore([baseBooking]);
});

describe('powiadomienie o nowej prośbie', () => {
  it('wysyła wiadomość z przyciskami, bez e-maila znajomego, ze znakami HTML zabezpieczonymi', async () => {
    const res = await post(make(), { action: 'notify', token: TOKEN });
    expect(res.status).toBe(200);
    const [send] = tgCalls('sendMessage');
    expect(send.body.chat_id).toBe(CHAT);
    expect(send.body.text).toContain('czwartek, 15 października');
    expect(send.body.text).toContain('10:00–12:00 (2 h)');
    expect(send.body.text).toContain('Ania &lt;b&gt;');
    expect(send.body.text).toContain('kawa &amp; ciasto');
    expect(send.body.text).not.toContain('ania@x.pl');
    const buttons = send.body.reply_markup.inline_keyboard[0];
    expect(buttons.map((b) => b.callback_data)).toEqual([`a:${ID}`, `r:${ID}`]);
  });

  it('drugie wywołanie z tym samym tokenem nie wysyła kolejnej wiadomości', async () => {
    await post(make(), { action: 'notify', token: TOKEN });
    await post(make(), { action: 'notify', token: TOKEN });
    expect(tgCalls('sendMessage')).toHaveLength(1);
  });

  it('nieznany token: nic nie wysyła i niczego nie zdradza', async () => {
    const res = await post(make(), { action: 'notify', token: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sent: false });
    expect(tgCalls('sendMessage')).toHaveLength(0);
  });

  it('błędne dane: 400', async () => {
    expect((await post(make(), { action: 'notify', token: 'zly' })).status).toBe(400);
    expect((await post(make(), { action: 'cos', token: TOKEN })).status).toBe(400);
  });

  it('awaria Telegrama: zwalnia zapis do ponowienia', async () => {
    opts.telegramFail = true;
    const res = await post(make(), { action: 'notify', token: TOKEN });
    expect(res.status).toBe(502);
    expect(store.rows.get(ID).telegram_notified_at).toBeNull();
  });

  it('brak konfiguracji bota: 503', async () => {
    const res = await post(make({ ...ENV, TELEGRAM_CHAT_ID: undefined }), { action: 'notify', token: TOKEN });
    expect(res.status).toBe(503);
  });

  it('CORS: odpowiada na zapytanie wstępne przeglądarki', async () => {
    const res = await make()(new Request('https://f/', { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('Telegram: zabezpieczenia', () => {
  it('zły sekret webhooka: 401 i nic się nie dzieje', async () => {
    const res = await tgPost(make(), click(`a:${ID}`), 'zly');
    expect(res.status).toBe(401);
    expect(store.log).toEqual([]);
  });

  it('brak ustawionego sekretu w środowisku: 401', async () => {
    const res = await tgPost(make({ ...ENV, TELEGRAM_WEBHOOK_SECRET: undefined }), click(`a:${ID}`), '');
    expect(res.status).toBe(401);
  });

  it('kliknięcie z cudzego konta: odmowa, baza nietknięta', async () => {
    await tgPost(make(), click(`a:${ID}`, 999));
    expect(store.log).toEqual([]);
    expect(tgCalls('answerCallbackQuery')[0].body.text).toBe('Brak uprawnień');
  });
});

describe('Telegram: Zaakceptuj', () => {
  it('zmienia status, wysyła e-mail, zapisuje wysyłkę i zmienia wiadomość', async () => {
    await tgPost(make(), click(`a:${ID}`));
    expect(store.rows.get(ID).status).toBe('accepted');
    expect(store.log).toContainEqual(['emailSent', ID]);
    const [mail] = emailCalls();
    expect(mail.body).toMatchObject({ service_id: 'svc', template_id: 'tpl_ok', user_id: 'pub', accessToken: 'priv' });
    expect(mail.body.template_params).toMatchObject({
      to_email: 'ania@x.pl', time: '10:00–12:00', site_title: 'Złap Lunę',
      cancel_link: `https://strona.example/#/anuluj/${TOKEN}`,
    });
    expect(mail.body.template_params.date).toBe('czwartek, 15 października');
    const [edit] = tgCalls('editMessageText');
    expect(edit.body.text).toContain('Zaakceptowano');
    expect(edit.body.reply_markup.inline_keyboard).toEqual([]);
  });

  it('błąd EmailJS: spotkanie zatwierdzone, ale bez znacznika wysyłki i z ostrzeżeniem', async () => {
    opts.emailOk = false;
    await tgPost(make(), click(`a:${ID}`));
    expect(store.rows.get(ID).status).toBe('accepted');
    expect(store.log.find((l) => l[0] === 'emailSent')).toBeUndefined();
    const text = tgCalls('editMessageText')[0].body.text;
    expect(text).toContain('Nie udało się wysłać e-maila');
    expect(text).toContain('recipients address is empty');
    expect(text).toContain('Wyślij e-mail ponownie');
  });

  it('podwójne kliknięcie: tylko jeden e-mail', async () => {
    await tgPost(make(), click(`a:${ID}`));
    await tgPost(make(), click(`a:${ID}`));
    expect(emailCalls()).toHaveLength(1);
    expect(tgCalls('answerCallbackQuery').at(-1).body.text).toBe('Już zatwierdzone');
  });

  it('prośba już usunięta (np. odwołana przez znajomego): komunikat, bez błędu', async () => {
    store.rows.delete(ID);
    const res = await tgPost(make(), click(`a:${ID}`));
    expect(res.status).toBe(200);
    expect(tgCalls('editMessageText')[0].body.text).toContain('już nie istnieje');
    expect(emailCalls()).toHaveLength(0);
  });

  it('zapis bez adresu e-mail: zatwierdza bez wysyłki', async () => {
    store = makeStore([{ ...baseBooking, email: null }]);
    await tgPost(make(), click(`a:${ID}`));
    expect(emailCalls()).toHaveLength(0);
    expect(tgCalls('editMessageText')[0].body.text).toContain('Brak adresu e-mail');
  });
});

describe('Telegram: Odrzuć (z potwierdzeniem)', () => {
  it('pierwsze kliknięcie tylko pyta o potwierdzenie i niczego nie usuwa', async () => {
    await tgPost(make(), click(`r:${ID}`));
    expect(store.rows.has(ID)).toBe(true);
    const kb = tgCalls('editMessageReplyMarkup')[0].body.reply_markup.inline_keyboard[0];
    expect(kb.map((b) => b.callback_data)).toEqual([`rc:${ID}`, `rx:${ID}`]);
  });

  it('„Wróć” przywraca przyciski', async () => {
    await tgPost(make(), click(`rx:${ID}`));
    const kb = tgCalls('editMessageReplyMarkup')[0].body.reply_markup.inline_keyboard[0];
    expect(kb.map((b) => b.callback_data)).toEqual([`a:${ID}`, `r:${ID}`]);
  });

  it('potwierdzenie usuwa prośbę i wysyła e-mail z drugim szablonem', async () => {
    await tgPost(make(), click(`rc:${ID}`));
    expect(store.rows.has(ID)).toBe(false);
    expect(emailCalls()[0].body.template_id).toBe('tpl_no');
    expect(tgCalls('editMessageText')[0].body.text).toContain('Odrzucono');
  });

  it('bez szablonu odrzucenia: usuwa bez maila i mówi o tym', async () => {
    await tgPost(make({ ...ENV, EMAILJS_REJECT_TEMPLATE_ID: undefined }), click(`rc:${ID}`));
    expect(store.rows.has(ID)).toBe(false);
    expect(emailCalls()).toHaveLength(0);
    expect(tgCalls('editMessageText')[0].body.text).toContain('Znajomy nie dostał wiadomości');
  });

  it('nie odrzuci spotkania, które zdążyło zostać zatwierdzone', async () => {
    store.rows.get(ID).status = 'accepted';
    await tgPost(make(), click(`rc:${ID}`));
    expect(store.rows.has(ID)).toBe(true);
    expect(tgCalls('editMessageText')[0].body.text).toContain('już zatwierdzone');
  });
});

describe('Telegram: wiadomości tekstowe', () => {
  it('/start zwraca ID czatu', async () => {
    await tgPost(make({ ...ENV, TELEGRAM_CHAT_ID: undefined }), { message: { text: '/start', chat: { id: 4242 } } });
    const send = tgCalls('sendMessage')[0].body;
    expect(send.chat_id).toBe(4242);
    expect(send.text).toContain('<code>4242</code>');
  });

  it('inne wiadomości są ignorowane', async () => {
    const res = await tgPost(make(), { message: { text: 'hej', chat: { id: 1 } } });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
  });
});

describe('bookingText', () => {
  it('cały dzień nie ma czasu trwania', () => {
    const t = bookingText({ ...baseBooking, all_day: true, start_time: '00:00:00', end_time: '23:59:59' });
    expect(t).toContain('cały dzień');
    expect(t).not.toContain('(');
  });
});
