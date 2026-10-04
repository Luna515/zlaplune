import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { formatDayLong, shortTime } from '../lib/dates';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CancelPage({ token }) {
  // state: loading | found | missing | done | error
  const [state, setState] = useState('loading');
  const [booking, setBooking] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!UUID.test(token)) {
      setState('missing');
      return;
    }
    supabase.rpc('booking_by_token', { p_token: token }).then(({ data, error }) => {
      if (error) setState('error');
      else if (!data || data.length === 0) setState('missing');
      else {
        setBooking(data[0]);
        setState('found');
      }
    });
  }, [token]);

  async function cancel() {
    setBusy(true);
    const { data, error } = await supabase.rpc('cancel_booking', { p_token: token });
    setBusy(false);
    if (error) setState('error');
    else setState(data ? 'done' : 'missing');
  }

  const when = booking
    ? booking.all_day
      ? 'cały dzień'
      : `${shortTime(booking.start_time)}–${shortTime(booking.end_time)}`
    : '';

  return (
    <>
      <header className="hero hero--small">
        <h1>Odwołanie zapisu</h1>
      </header>
      <div className="panel login">
        {state === 'loading' && <p className="muted">Wczytywanie…</p>}

        {state === 'found' && (
          <>
            <h2>{formatDayLong(booking.day)}</h2>
            <p className="panel__sub">{when}</p>
            <p>Czy na pewno chcesz odwołać ten zapis? Termin znów będzie wolny dla innych.</p>
            <button type="button" className="btn btn--danger-solid" onClick={cancel} disabled={busy}>
              {busy ? 'Odwołuję…' : 'Odwołaj zapis'}
            </button>
          </>
        )}

        {state === 'done' && (
          <>
            <h2>Odwołane</h2>
            <p>Zapis został odwołany.</p>
            <a className="btn btn--ghost" href="#/">
              Wróć do kalendarza
            </a>
          </>
        )}

        {state === 'missing' && (
          <>
            <h2>Nie ma takiego zapisu</h2>
            <p>Link jest nieprawidłowy albo zapis został już odwołany.</p>
            <a className="btn btn--ghost" href="#/">
              Wróć do kalendarza
            </a>
          </>
        )}

        {state === 'error' && (
          <p className="msg msg--error" role="alert">
            Coś poszło nie tak. Spróbuj ponownie za chwilę.
          </p>
        )}
      </div>
    </>
  );
}
