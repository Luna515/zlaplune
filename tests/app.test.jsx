import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => {
  const state = { busy: [], bookings: [], session: null, calls: [], updateOk: true };

  const chain = (getRows) => {
    const filters = [];
    const c = {
      select: () => c, gte: () => c, lte: () => c, order: () => c,
      eq: (col, val) => { filters.push([col, val]); return c; },
      then: (res, rej) => {
        let data = getRows();
        for (const [col, val] of filters) data = data.filter((r) => r[col] === val);
        return Promise.resolve({ data, error: null }).then(res, rej);
      },
    };
    return c;
  };

  const supabase = {
    rpc: vi.fn(async (name, args) => {
      state.calls.push(['rpc', name, args]);
      if (name === 'busy_slots') return { data: state.busy, error: null };
      if (name === 'requires_code') return { data: false, error: null };
      if (name === 'book_slot') return { data: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', error: null };
      if (name === 'is_admin') return { data: true, error: null };
      if (name === 'booking_by_token')
        return { data: [{ day: '2026-10-15', start_time: '10:00:00', end_time: '11:30:00', all_day: false }], error: null };
      if (name === 'cancel_booking') return { data: true, error: null };
      return { data: null, error: null };
    }),
    from: vi.fn(() => ({
      select: () => chain(() => state.bookings),
      insert: async (row) => { state.calls.push(['insert', row]); return { error: null }; },
      update: (patch) => ({
        eq: (_c, id) => {
          state.calls.push(['update', id, patch]);
          const result = state.updateOk ? { data: [{ id }], error: null } : { data: [], error: null };
          const p = Promise.resolve(result);
          p.select = () => Promise.resolve(result);
          return p;
        },
      }),
      delete: () => ({ eq: async (_c, id) => { state.calls.push(['delete', id]); return { error: null }; } }),
    })),
    auth: {
      getSession: async () => ({ data: { session: state.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(),
    },
  };
  const emailSend = vi.fn(async () => ({ status: 200 }));
  return { state, supabase, emailSend };
});

vi.mock('../src/supabase', () => ({ supabase: h.supabase }));
vi.mock('@emailjs/browser', () => ({ default: { send: h.emailSend } }));

import App from '../src/App.jsx';
import { dayStatus, dayKey, busyMask, toInterval } from '../src/lib/dates';

beforeEach(() => {
  window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 10, 12, 0, 0)); // 10 października 2026, 12:00
  h.state.calls.length = 0;
  h.state.updateOk = true;
  h.state.bookings = [];
  h.state.busy = [
    { day: '2026-10-14', start_time: '10:00:00', end_time: '12:00:00', all_day: false, status: 'accepted' },
    { day: '2026-10-16', start_time: '00:00:00', end_time: '23:59:59', all_day: true, status: 'accepted' },
    { day: '2026-10-20', start_time: '00:00:00', end_time: '12:00:00', all_day: false, status: 'accepted' },
    { day: '2026-10-20', start_time: '12:00:00', end_time: '24:00:00', all_day: false, status: 'accepted' },
    // dzień z samymi oczekującymi
    { day: '2026-10-21', start_time: '15:00:00', end_time: '16:00:00', all_day: false, status: 'pending' },
    // dzień mieszany: zatwierdzone + oczekujące
    { day: '2026-10-22', start_time: '09:00:00', end_time: '10:00:00', all_day: false, status: 'accepted' },
    { day: '2026-10-22', start_time: '18:00:00', end_time: '19:00:00', all_day: false, status: 'pending' },
  ];
  window.location.hash = '';
  vi.stubEnv('VITE_EMAILJS_SERVICE_ID', 'service_x');
  vi.stubEnv('VITE_EMAILJS_TEMPLATE_ID', 'template_x');
  vi.stubEnv('VITE_EMAILJS_PUBLIC_KEY', 'key_x');
  h.emailSend.mockClear();
  h.emailSend.mockImplementation(async () => ({ status: 200 }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const day = (n) => {
  const re = new RegExp(`^[^,]+, ${n} października`);
  const found = screen
    .getAllByRole('button', { name: re })
    .filter((b) => b.classList.contains('day'));
  if (found.length !== 1) throw new Error(`Oczekiwano 1 dnia ${n}, jest ${found.length}`);
  return found[0];
};
const fillEmail = (v = 'ania@example.com') =>
  fireEvent.change(screen.getByLabelText(/^E-mail/), { target: { value: v } });

describe('nagłówek', () => {
  it('strona ma tytuł „Złap Lunę”', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Złap Lunę' })).toBeTruthy();
  });
});

describe('statusy dni', () => {
  it('dayStatus: free / partial / full', () => {
    expect(dayStatus([])).toBe('free');
    expect(dayStatus([{ start: 600, end: 720 }])).toBe('partial');
    expect(dayStatus([{ start: 0, end: 1440 }])).toBe('full');
    expect(dayStatus([{ start: 0, end: 780 }, { start: 780, end: 1440 }])).toBe('full');
    expect(dayStatus([{ start: 540, end: 1320 }])).toBe('partial');
  });

  it('dayKey: oczekujące => pending, zatwierdzone => zwykłe kolory', () => {
    const acc = (start, end) => ({ start, end, status: 'accepted' });
    const pen = (start, end) => ({ start, end, status: 'pending' });
    expect(dayKey([])).toBe('free');
    expect(dayKey([pen(600, 660)])).toBe('pending');
    expect(dayKey([pen(0, 1440)])).toBe('pending');
    expect(dayKey([acc(600, 660)])).toBe('partial');
    expect(dayKey([acc(600, 660), pen(900, 960)])).toBe('partial');
    expect(dayKey([acc(0, 700), pen(700, 1440)])).toBe('full');
  });

  it('busyMask: accepted wygrywa z pending', () => {
    const m = busyMask([
      toInterval({ start_time: '10:00:00', end_time: '11:00:00', all_day: false, status: 'pending' }),
      toInterval({ start_time: '10:30:00', end_time: '12:00:00', all_day: false, status: 'accepted' }),
    ]);
    expect(m[20]).toBe('pending'); // 10:00
    expect(m[21]).toBe('accepted'); // 10:30
    expect(m[24]).toBe(null); // 12:00
  });
});

describe('strona publiczna', () => {
  it('pokazuje kolory dni (w tym pomarańczowy), legendę i blokuje przeszłość', async () => {
    render(<App />);
    await waitFor(() => expect(day(14).className).toContain('day--partial'));
    expect(day(15).className).toContain('day--free');
    expect(day(16).className).toContain('day--full');
    expect(day(20).className).toContain('day--full');
    expect(day(21).className).toContain('day--pending');
    expect(day(21).getAttribute('aria-label')).toContain('oczekuje na zatwierdzenie');
    // dzień mieszany: zwykły kolor + kropka
    expect(day(22).className).toContain('day--partial');
    expect(day(22).querySelector('.day__dot')).toBeTruthy();
    expect(day(14).querySelector('.day__dot')).toBeNull();
    expect(day(9).disabled).toBe(true);
    expect(day(10).disabled).toBe(false);
    const legend = screen.getByLabelText('Legenda');
    expect(within(legend).getByText(/Wolny cały dzień/)).toBeTruthy();
    expect(within(legend).getByText(/niektóre godziny/)).toBeTruthy();
    expect(within(legend).getByText(/Oczekuje na zatwierdzenie/)).toBeTruthy();
    expect(within(legend).getByText(/Zajęty/)).toBeTruthy();
  });

  it('oczekujący termin: pomarańczowe pole i informacja, bez imion', async () => {
    render(<App />);
    await waitFor(() => expect(day(21).className).toContain('day--pending'));
    fireEvent.click(day(21));
    const pendingSlot = screen.getByRole('button', { name: '15:00, oczekuje na zatwierdzenie' });
    expect(pendingSlot.disabled).toBe(true);
    expect(pendingSlot.className).toContain('slot--pending');
    expect(screen.getByText(/czekają na moje zatwierdzenie/)).toBeTruthy();
    expect(screen.getAllByText('Oczekuje na zatwierdzenie').length).toBeGreaterThan(0);
  });

  it('zajęte godziny i cały dzień są zablokowane na zajętym dniu', async () => {
    render(<App />);
    await waitFor(() => expect(day(14).className).toContain('day--partial'));
    fireEvent.click(day(14));
    const busy = screen.getByRole('button', { name: '10:00, zajęte' });
    expect(busy.disabled).toBe(true);
    expect(busy.className).toContain('slot--busy');
    expect(screen.getByRole('button', { name: '11:30, zajęte' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '12:00' }).disabled).toBe(false);
    expect(screen.getByLabelText('Cały dzień').disabled).toBe(true);
    // 09:30 nie może być początkiem: do zajętego 10:00 jest tylko 30 min
    expect(screen.getByRole('button', { name: '09:30' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '09:00' }));
    // koniec za zajętym terminem jest niemożliwy; kliknięcie 12:00 zmienia początek
    fireEvent.click(screen.getByRole('button', { name: '12:00' }));
    expect(screen.getByRole('button', { name: '09:00' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: '12:00' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('zapis: wymaga e-maila, wysyła book_slot i mówi, że termin jest rozpatrywany', async () => {
    render(<App />);
    await waitFor(() => expect(day(15).className).toContain('day--free'));
    fireEvent.click(day(15));
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: '11:30' }));
    expect(screen.getByText(/10:00–11:30 \(1 h 30 min\)/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Imię'), { target: { value: 'Ania' } });
    const submit = screen.getByRole('button', { name: 'Wyślij prośbę o spotkanie' });
    expect(submit.disabled).toBe(true); // brak e-maila
    fillEmail();
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await screen.findByText('Wysłane');
    const call = h.state.calls.find((c) => c[1] === 'book_slot');
    expect(call[2]).toMatchObject({
      p_day: '2026-10-15', p_start: '10:00', p_end: '11:30', p_all_day: false,
      p_name: 'Ania', p_email: 'ania@example.com',
    });
    expect(screen.getByText('Czeka na zatwierdzenie')).toBeTruthy();
    expect(screen.getByText(/w trakcie rozpatrywania/)).toBeTruthy();
    expect(screen.getByText(/koniecznie\s+sprawdź folder spam/)).toBeTruthy();
    expect(screen.getByText('ania@example.com')).toBeTruthy();
    expect(screen.getByLabelText('Link do anulowania').value).toContain('#/anuluj/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  });

  it('cały dzień przez checkbox', async () => {
    render(<App />);
    await waitFor(() => expect(day(17).className).toContain('day--free'));
    fireEvent.click(day(17));
    fireEvent.click(screen.getByLabelText('Cały dzień'));
    expect(screen.getByRole('button', { name: '10:00' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Imię'), { target: { value: 'Bartek' } });
    fillEmail('b@x.pl');
    fireEvent.click(screen.getByRole('button', { name: 'Wyślij prośbę o spotkanie' }));
    await screen.findByText('Wysłane');
    const call = h.state.calls.find((c) => c[1] === 'book_slot');
    expect(call[2]).toMatchObject({ p_day: '2026-10-17', p_all_day: true, p_start: null, p_end: null });
  });

  it('dziś: godziny, które już minęły, są zablokowane', async () => {
    render(<App />);
    await waitFor(() => expect(day(10).className).toContain('day--today'));
    fireEvent.click(day(10));
    expect(screen.getByRole('button', { name: '11:30' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '12:30' }).disabled).toBe(false);
    expect(screen.getByLabelText('Cały dzień').disabled).toBe(true);
  });

  it('honeypot nie wysyła zapisu', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(day(15).className).toContain('day--free'));
    fireEvent.click(day(15));
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: '11:00' }));
    fireEvent.change(screen.getByLabelText('Imię'), { target: { value: 'Bot' } });
    fillEmail('bot@x.pl');
    fireEvent.change(container.querySelector('input.hp'), { target: { value: 'spam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Wyślij prośbę o spotkanie' }));
    await screen.findByText('Wysłane');
    expect(h.state.calls.find((c) => c[1] === 'book_slot')).toBeUndefined();
  });

  it('całą dobę: pola od 00:00, ostatnie kończy się o 24:00', async () => {
    render(<App />);
    await waitFor(() => expect(day(15).className).toContain('day--free'));
    fireEvent.click(day(15));
    expect(screen.getByRole('button', { name: '00:00' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '23:00' }));
    fireEvent.click(screen.getByRole('button', { name: '24:00' }));
    expect(screen.getByText(/23:00–24:00 \(1 h\)/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Imię'), { target: { value: 'Ola' } });
    fillEmail('ola@x.pl');
    fireEvent.click(screen.getByRole('button', { name: 'Wyślij prośbę o spotkanie' }));
    await screen.findByText('Wysłane');
    expect(h.state.calls.find((c) => c[1] === 'book_slot')[2]).toMatchObject({ p_start: '23:00', p_end: '24:00' });
  });
});

describe('panel admina', () => {
  const adminSetup = () => {
    window.location.hash = '#/admin';
    h.state.session = { user: { id: 'u1', email: 'luna@x.pl' } };
    h.state.bookings = [
      { id: 'b1', day: '2026-10-14', start_time: '10:00:00', end_time: '12:00:00', all_day: false, name: 'Ania', email: 'ania@x.pl', note: 'kawa', status: 'accepted', notified_at: '2026-10-09T10:00:00Z', cancel_token: 't1' },
      { id: 'b2', day: '2026-10-21', start_time: '15:00:00', end_time: '16:00:00', all_day: false, name: 'Bartek', email: 'bartek@x.pl', note: null, status: 'pending', notified_at: null, cancel_token: 'tok-bartek' },
      { id: 'b3', day: '2026-10-25', start_time: '10:00:00', end_time: '11:00:00', all_day: false, name: 'Celina', email: 'celina@x.pl', note: null, status: 'accepted', notified_at: null, cancel_token: 't3' },
    ];
  };
  afterEach(() => { h.state.session = null; });

  it('bez sesji pokazuje logowanie', async () => {
    window.location.hash = '#/admin';
    render(<App />);
    await screen.findByText('Logowanie');
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@b.pl' } });
    fireEvent.change(screen.getByLabelText('Hasło'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zaloguj się' }));
    await waitFor(() => expect(h.supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.pl', password: 'x' }));
  });

  it('lista „Do zatwierdzenia” pokazuje oczekujące i przenosi do dnia', async () => {
    adminSetup();
    render(<App />);
    const list = await screen.findByLabelText('Do zatwierdzenia');
    await within(list).findByText('Bartek');
    expect(within(list).queryByText('Ania')).toBeNull(); // zatwierdzone nie są na liście
    expect(within(list).getByText('1')).toBeTruthy();
    fireEvent.click(within(list).getByText('Bartek'));
    await screen.findByText('Zaakceptuj');
  });

  it('adminka widzi imiona i e-maile, usuwa spotkanie', async () => {
    adminSetup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    await screen.findByText('Panel', { selector: 'h1' });
    await waitFor(() => expect(day(14).className).toContain('day--partial'));
    fireEvent.click(day(14));
    expect(screen.getByText('Ania')).toBeTruthy();
    expect(screen.getByText('ania@x.pl').getAttribute('href')).toBe('mailto:ania@x.pl');
    expect(screen.getByText('Zatwierdzone')).toBeTruthy();
    expect(screen.getByText(/E-mail o zatwierdzeniu wysłano/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Usuń' }));
    await waitFor(() => expect(h.state.calls.find((c) => c[0] === 'delete')[1]).toBe('b1'));
  });

  it('Zaakceptuj: zmienia status na accepted i wysyła e-mail', async () => {
    adminSetup();
    render(<App />);
    await waitFor(() => expect(day(21).className).toContain('day--pending'));
    fireEvent.click(day(21));
    expect(screen.getByText('Oczekuje na zatwierdzenie', { selector: '.badge' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zaakceptuj' }));
    await screen.findByText(/E-mail wysłano na bartek@x.pl/);

    const upd = h.state.calls.filter((c) => c[0] === 'update');
    expect(upd[0].slice(1)).toEqual(['b2', { status: 'accepted' }]);
    expect(upd[1][1]).toBe('b2');
    expect(upd[1][2].notified_at).toBeTruthy();

    expect(h.emailSend).toHaveBeenCalledTimes(1);
    const [service, template, params, opts] = h.emailSend.mock.calls[0];
    expect([service, template, opts]).toEqual(['service_x', 'template_x', { publicKey: 'key_x' }]);
    expect(params).toMatchObject({
      to_email: 'bartek@x.pl', to_name: 'Bartek', time: '15:00–16:00',
    });
    expect(params.date).toContain('21 października');
    expect(params.cancel_link).toContain('#/anuluj/tok-bartek');
  });

  it('błąd wysyłki e-maila: spotkanie zatwierdzone, komunikat o błędzie, bez notified_at', async () => {
    adminSetup();
    h.emailSend.mockImplementation(async () => { throw new Error('boom'); });
    render(<App />);
    await waitFor(() => expect(day(21).className).toContain('day--pending'));
    fireEvent.click(day(21));
    fireEvent.click(screen.getByRole('button', { name: 'Zaakceptuj' }));
    await screen.findByText(/nie udało się wysłać e-maila/);
    const upd = h.state.calls.filter((c) => c[0] === 'update');
    expect(upd).toHaveLength(1); // tylko zmiana statusu, bez notified_at
  });

  it('brak konfiguracji EmailJS: zatwierdza i mówi, czego brakuje', async () => {
    adminSetup();
    vi.stubEnv('VITE_EMAILJS_PUBLIC_KEY', '');
    render(<App />);
    await waitFor(() => expect(day(21).className).toContain('day--pending'));
    fireEvent.click(day(21));
    fireEvent.click(screen.getByRole('button', { name: 'Zaakceptuj' }));
    await screen.findByText(/brakuje konfiguracji EmailJS/);
    expect(h.emailSend).not.toHaveBeenCalled();
    expect(h.state.calls.find((c) => c[0] === 'update')[2]).toEqual({ status: 'accepted' });
  });

  it('zatwierdzone bez wysłanego maila: przycisk „Wyślij e-mail ponownie”', async () => {
    adminSetup();
    render(<App />);
    await waitFor(() => expect(day(25).className).toContain('day--partial'));
    fireEvent.click(day(25));
    fireEvent.click(screen.getByRole('button', { name: 'Wyślij e-mail ponownie' }));
    await screen.findByText(/E-mail wysłano na celina@x.pl/);
    expect(h.emailSend).toHaveBeenCalledTimes(1);
  });

  it('akceptacja bez uprawnień (0 zmienionych wierszy) nie wysyła maila', async () => {
    adminSetup();
    h.state.updateOk = false;
    render(<App />);
    await waitFor(() => expect(day(21).className).toContain('day--pending'));
    fireEvent.click(day(21));
    fireEvent.click(screen.getByRole('button', { name: 'Zaakceptuj' }));
    await screen.findByText('Nie udało się zatwierdzić spotkania.');
    expect(h.emailSend).not.toHaveBeenCalled();
  });

  it('dodane przez adminkę spotkanie jest od razu zatwierdzone', async () => {
    adminSetup();
    render(<App />);
    await screen.findByText('Panel', { selector: 'h1' });
    await waitFor(() => expect(day(15).className).toContain('day--free'));
    fireEvent.click(day(15));
    fireEvent.click(screen.getByLabelText('Zajmij cały dzień'));
    fireEvent.change(screen.getByLabelText('Tytuł lub z kim'), { target: { value: 'Prywatne' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj spotkanie' }));
    await waitFor(() => expect(h.state.calls.find((c) => c[0] === 'insert')).toBeTruthy());
    expect(h.state.calls.find((c) => c[0] === 'insert')[1]).toMatchObject({
      day: '2026-10-15', start_time: '00:00', end_time: '23:59:59', all_day: true, name: 'Prywatne', status: 'accepted',
    });
  });
});

describe('strona anulowania', () => {
  it('nieprawidłowy token', async () => {
    window.location.hash = '#/anuluj/zly';
    render(<App />);
    await screen.findByText('Nie ma takiego zapisu');
  });

  it('poprawny token: pokazuje zapis i odwołuje', async () => {
    window.location.hash = '#/anuluj/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    render(<App />);
    await screen.findByText('10:00–11:30');
    fireEvent.click(screen.getByRole('button', { name: 'Odwołaj zapis' }));
    await screen.findByText('Odwołane');
    expect(h.state.calls.find((c) => c[1] === 'cancel_booking')[2]).toEqual({ p_token: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
  });
});

describe('powiadomienie Telegram po zapisie', () => {
  it('po udanym zapisie strona zgłasza go funkcji booking-bot', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
    const fetchSpy = vi.fn(() => Promise.resolve({}));
    vi.stubGlobal('fetch', fetchSpy);
    render(<App />);
    await waitFor(() => expect(day(15).className).toContain('day--free'));
    fireEvent.click(day(15));
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: '11:00' }));
    fireEvent.change(screen.getByLabelText('Imię'), { target: { value: 'Ania' } });
    fillEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Wyślij prośbę o spotkanie' }));
    await screen.findByText('Wysłane');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://proj.supabase.co/functions/v1/booking-bot');
    expect(JSON.parse(init.body)).toEqual({ action: 'notify', token: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });
    vi.unstubAllGlobals();
  });

  it('błąd sieci przy zgłoszeniu nie psuje potwierdzenia dla znajomego', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    render(<App />);
    await waitFor(() => expect(day(15).className).toContain('day--free'));
    fireEvent.click(day(15));
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: '11:00' }));
    fireEvent.change(screen.getByLabelText('Imię'), { target: { value: 'Ania' } });
    fillEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Wyślij prośbę o spotkanie' }));
    await screen.findByText('Wysłane');
    vi.unstubAllGlobals();
  });
});

describe('początek i koniec, minimum 1 godzina', () => {
  const setup = async () => {
    render(<App />);
    await waitFor(() => expect(day(15).className).toContain('day--free'));
    fireEvent.click(day(15));
    fireEvent.change(screen.getByLabelText('Imię'), { target: { value: 'Ania' } });
    fillEmail();
  };
  const submitBtn = () => screen.getByRole('button', { name: 'Wyślij prośbę o spotkanie' });

  it('bez wyboru: przycisk nieaktywny i widać komunikat', async () => {
    await setup();
    expect(submitBtn().disabled).toBe(true);
    expect(screen.getByText(/Wybierz początek i koniec \(minimum 1 h\)/)).toBeTruthy();
  });

  it('sam początek nie wystarcza: trzeba jeszcze wybrać koniec', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    expect(submitBtn().disabled).toBe(true);
    expect(screen.getByText(/Początek: 10:00\. Wybierz koniec\./)).toBeTruthy();
    expect(screen.getByText(/Teraz kliknij godzinę końca/)).toBeTruthy();
  });

  it('koniec wcześniej niż po godzinie od początku jest zablokowany', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    expect(screen.getByRole('button', { name: '10:30' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '11:00' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '10:30' })); // nic nie robi
    expect(submitBtn().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '11:00' }));
    expect(screen.getByText(/10:00–11:00 \(1 h\)/)).toBeTruthy();
    expect(submitBtn().disabled).toBe(false);
    expect(screen.queryByText(/Wybierz początek i koniec \(minimum/)).toBeNull();
  });

  it('kliknięcie początku jeszcze raz zdejmuje wybór; po wyborze można zacząć od nowa', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    expect(screen.getByRole('button', { name: '10:00' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: '12:00' }));
    expect(screen.getByText(/10:00–12:00 \(2 h\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '14:00' })); // nowy początek
    expect(screen.getByRole('button', { name: '10:00' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText(/Początek: 14:00/)).toBeTruthy();
    expect(submitBtn().disabled).toBe(true);
  });

  it('wysyła wybrany początek i koniec do bazy', async () => {
    await setup();
    fireEvent.click(screen.getByRole('button', { name: '13:00' }));
    fireEvent.click(screen.getByRole('button', { name: '15:00' }));
    fireEvent.click(submitBtn());
    await screen.findByText('Wysłane');
    expect(h.state.calls.find((c) => c[1] === 'book_slot')[2]).toMatchObject({
      p_start: '13:00', p_end: '15:00', p_all_day: false,
    });
  });

  it('cały dzień nie wymaga początku i końca', async () => {
    await setup();
    fireEvent.click(screen.getByLabelText('Cały dzień'));
    expect(screen.queryByText(/Wybierz początek i koniec \(minimum/)).toBeNull();
    expect(submitBtn().disabled).toBe(false);
  });

  it('koniec nie może wejść na zajęty termin, ale może kończyć się tuż przed nim', async () => {
    render(<App />);
    await waitFor(() => expect(day(14).className).toContain('day--partial'));
    fireEvent.click(day(14)); // zajęte 10:00-12:00
    fireEvent.click(screen.getByRole('button', { name: '08:00' }));
    expect(screen.getByRole('button', { name: '10:00' }).disabled).toBe(false); // koniec o 10:00 jest OK
    expect(screen.getByRole('button', { name: '10:30, zajęte' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '12:00' }).getAttribute('aria-pressed')).toBe('false');
  });
});
