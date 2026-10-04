import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => {
  const state = {
    busy: [],
    bookings: [],
    session: null,
    calls: [],
  };
  const chain = (result) => {
    const c = {
      select: () => c, gte: () => c, lte: () => c, order: () => c, eq: () => c,
      then: (res, rej) => Promise.resolve(result()).then(res, rej),
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
    from: vi.fn((table) => ({
      select: () => chain(() => ({ data: state.bookings, error: null })),
      insert: async (row) => {
        state.calls.push(['insert', table, row]);
        return { error: null };
      },
      delete: () => ({ eq: async (_c, id) => { state.calls.push(['delete', id]); return { error: null }; } }),
    })),
    auth: {
      getSession: async () => ({ data: { session: state.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(),
    },
  };
  return { state, supabase };
});

vi.mock('../src/supabase', () => ({ supabase: h.supabase }));

import App from '../src/App.jsx';
import { dayStatus } from '../src/lib/dates';

beforeEach(() => {
  window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 10, 12, 0, 0)); // 10 października 2026, 12:00
  h.state.calls.length = 0;
  h.state.busy = [
    { day: '2026-10-14', start_time: '10:00:00', end_time: '12:00:00', all_day: false },
    { day: '2026-10-16', start_time: '00:00:00', end_time: '23:59:59', all_day: true },
    { day: '2026-10-20', start_time: '00:00:00', end_time: '12:00:00', all_day: false },
    { day: '2026-10-20', start_time: '12:00:00', end_time: '24:00:00', all_day: false },
  ];
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const day = (n) => screen.getByRole('button', { name: new RegExp(`^[^,]+, ${n} października`) });

describe('dayStatus', () => {
  it('free / partial / full', () => {
    expect(dayStatus([])).toBe('free');
    expect(dayStatus([{ start: 600, end: 720 }])).toBe('partial');
    expect(dayStatus([{ start: 0, end: 1440 }])).toBe('full');
    expect(dayStatus([{ start: 0, end: 780 }, { start: 780, end: 1440 }])).toBe('full');
    expect(dayStatus([{ start: 540, end: 1320 }])).toBe('partial');
  });
});

describe('strona publiczna', () => {
  it('pokazuje kolory dni, legendę i blokuje przeszłość', async () => {
    render(<App />);
    await waitFor(() => expect(day(14).className).toContain('day--partial'));
    expect(day(15).className).toContain('day--free');
    expect(day(16).className).toContain('day--full');
    expect(day(20).className).toContain('day--full');
    expect(day(9).disabled).toBe(true);
    expect(day(10).disabled).toBe(false);
    expect(screen.getByText('Październik 2026', { exact: false })).toBeTruthy();
    const legend = screen.getByLabelText('Legenda');
    expect(within(legend).getByText(/Wolny cały dzień/)).toBeTruthy();
    expect(within(legend).getByText(/niektóre godziny/)).toBeTruthy();
    expect(within(legend).getByText(/Zajęty/)).toBeTruthy();
  });

  it('zajęte godziny i cały dzień są zablokowane na zajętym dniu', async () => {
    render(<App />);
    await waitFor(() => expect(day(14).className).toContain('day--partial'));
    fireEvent.click(day(14));
    expect(screen.getByRole('button', { name: '10:00, zajęte' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '11:30, zajęte' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '12:00' }).disabled).toBe(false);
    expect(screen.getByLabelText('Cały dzień').disabled).toBe(true);
    // nie da się wybrać zakresu przez zajęte godziny
    fireEvent.click(screen.getByRole('button', { name: '09:00' }));
    fireEvent.click(screen.getByRole('button', { name: '12:00' }));
    expect(screen.getByRole('button', { name: '09:00' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: '12:00' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('zapis na przedział godzin wywołuje book_slot i pokazuje link do anulowania', async () => {
    render(<App />);
    await waitFor(() => expect(day(15).className).toContain('day--free'));
    fireEvent.click(day(15));
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: '11:00' }));
    expect(screen.getByText(/10:00–11:30 \(1 h 30 min\)/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Imię'), { target: { value: 'Ania' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz się' }));
    await screen.findByText('Zapisane');
    const call = h.state.calls.find((c) => c[1] === 'book_slot');
    expect(call[2]).toMatchObject({
      p_day: '2026-10-15', p_start: '10:00', p_end: '11:30', p_all_day: false, p_name: 'Ania',
    });
    expect(screen.getByLabelText('Link do anulowania').value).toContain('#/anuluj/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  });

  it('cały dzień przez checkbox', async () => {
    render(<App />);
    await waitFor(() => expect(day(17).className).toContain('day--free'));
    fireEvent.click(day(17));
    fireEvent.click(screen.getByLabelText('Cały dzień'));
    expect(screen.getByRole('button', { name: '10:00' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Imię'), { target: { value: 'Bartek' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz się' }));
    await screen.findByText('Zapisane');
    const call = h.state.calls.find((c) => c[1] === 'book_slot');
    expect(call[2]).toMatchObject({ p_day: '2026-10-17', p_all_day: true, p_start: null, p_end: null });
  });

  it('dziś: godziny, które już minęły, są zablokowane', async () => {
    render(<App />);
    await waitFor(() => expect(day(10).className).toContain('day--today'));
    fireEvent.click(day(10));
    expect(screen.getByRole('button', { name: '11:30' }).disabled).toBe(true); // jest 12:00
    expect(screen.getByRole('button', { name: '12:30' }).disabled).toBe(false);
    expect(screen.getByLabelText('Cały dzień').disabled).toBe(true);
  });

  it('honeypot nie wysyła zapisu', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(day(15).className).toContain('day--free'));
    fireEvent.click(day(15));
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.change(screen.getByLabelText('Imię'), { target: { value: 'Bot' } });
    fireEvent.change(container.querySelector('input.hp'), { target: { value: 'spam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz się' }));
    await screen.findByText('Zapisane');
    expect(h.state.calls.find((c) => c[1] === 'book_slot')).toBeUndefined();
  });
});

describe('panel admina', () => {
  it('bez sesji pokazuje logowanie', async () => {
    window.location.hash = '#/admin';
    render(<App />);
    await screen.findByText('Logowanie');
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@b.pl' } });
    fireEvent.change(screen.getByLabelText('Hasło'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zaloguj się' }));
    await waitFor(() => expect(h.supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.pl', password: 'x' }));
  });

  it('adminka widzi imiona, dodaje spotkanie i usuwa', async () => {
    window.location.hash = '#/admin';
    h.state.session = { user: { id: 'u1', email: 'luna@x.pl' } };
    h.state.bookings = [
      { id: 'b1', day: '2026-10-14', start_time: '10:00:00', end_time: '12:00:00', all_day: false, name: 'Ania', contact: '123', note: 'kawa' },
    ];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    await screen.findByText('Panel', { selector: 'h1' });
    await waitFor(() => expect(day(14).className).toContain('day--partial'));
    fireEvent.click(day(14));
    expect(screen.getByText('Ania')).toBeTruthy();
    expect(screen.getByText(/Kontakt: 123/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Usuń' }));
    await waitFor(() => expect(h.state.calls.find((c) => c[0] === 'delete')[1]).toBe('b1'));

    // dodanie spotkania na całą środę 15
    fireEvent.click(day(15));
    fireEvent.click(screen.getByLabelText('Zajmij cały dzień'));
    fireEvent.change(screen.getByLabelText('Tytuł lub z kim'), { target: { value: 'Prywatne' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj spotkanie' }));
    await waitFor(() => expect(h.state.calls.find((c) => c[0] === 'insert')).toBeTruthy());
    expect(h.state.calls.find((c) => c[0] === 'insert')[2]).toMatchObject({
      day: '2026-10-15', start_time: '00:00', end_time: '23:59:59', all_day: true, name: 'Prywatne',
    });
    h.state.session = null;
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

describe('całą dobę', () => {
  it('są pola od 00:00 do 23:30, ostatnie kończy się o 24:00', async () => {
    render(<App />);
    await waitFor(() => expect(day(15).className).toContain('day--free'));
    fireEvent.click(day(15));
    expect(screen.getByRole('button', { name: '00:00' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '23:00' }));
    fireEvent.click(screen.getByRole('button', { name: '23:30' }));
    expect(screen.getByText(/23:00–24:00 \(1 h\)/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Imię'), { target: { value: 'Ola' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zapisz się' }));
    await screen.findByText('Zapisane');
    expect(h.state.calls.find((c) => c[1] === 'book_slot')[2]).toMatchObject({ p_start: '23:00', p_end: '24:00' });
  });
});
