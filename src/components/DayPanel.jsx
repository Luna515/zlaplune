import { useMemo, useState } from 'react';
import { supabase } from '../supabase';
import {
  POINTS,
  SLOTS,
  busyMask,
  formatDayLong,
  formatDuration,
  minToTime,
  shortTime,
  todayISO,
  toInterval,
} from '../lib/dates';
import { MIN_DURATION } from '../config';
import { notifyNewBooking } from '../lib/bot';
import { NOT_CONFIGURED, sendAcceptedEmail } from '../lib/email';
import SlotPicker from './SlotPicker';

function errorText(err, isAdmin) {
  if (!err) return '';
  if (err.code === '23P01') {
    return isAdmin
      ? 'W tym czasie jest już inne spotkanie.'
      : 'Ten termin został przed chwilą zajęty. Wybierz inne godziny.';
  }
  if (err.code === 'P0001' && err.message) return err.message;
  return 'Coś poszło nie tak. Spróbuj ponownie za chwilę.';
}

function rowLabel(r) {
  return r.all_day ? 'Cały dzień' : `${shortTime(r.start_time)}–${shortTime(r.end_time)}`;
}

export default function DayPanel({ iso, rows, isAdmin, closed = false, needsCode, onChanged }) {
  const today = todayISO();
  const isPast = iso < today;
  const isToday = iso === today;

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [rows]
  );
  const busy = useMemo(() => busyMask(sorted.map(toInterval)), [sorted]);
  const hasBusy = sorted.length > 0;
  const hasPending = sorted.some((r) => r.status === 'pending');

  const nowMin = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : -1;
  const blocked = SLOTS.map((s) => !isAdmin && (isPast || (isToday && s < nowMin)));

  const [range, setRange] = useState(null);
  const [allDay, setAllDay] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [code, setCode] = useState('');
  const [hp, setHp] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [closing, setClosing] = useState(false);

  const dayClosed = !isAdmin && isPast;
  const allDayLocked = hasBusy || (!isAdmin && isToday);
  const complete = Boolean(range && range.end != null);
  const canSubmit =
    name.trim() && (isAdmin || email.trim()) && (allDay || complete) && !sending && !dayClosed;

  const startMin = range ? POINTS[range.start] : null;
  const endMin = complete ? POINTS[range.end] : null;

  // ---------- zapis (znajomy) / dodanie spotkania (admin) ----------

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setActionError('');
    setNotice('');

    if (!allDay && (!complete || endMin - startMin < MIN_DURATION)) {
      setError(`Wybierz początek i koniec: minimum ${formatDuration(MIN_DURATION)}.`);
      return;
    }

    // pole-pułapka dla botów: człowiek go nie widzi
    if (!isAdmin && hp) {
      setResult({ email: email.trim() });
      return;
    }

    setSending(true);

    if (isAdmin) {
      // spotkania dodane przez adminkę są od razu zatwierdzone
      const { error: err } = await supabase.from('bookings').insert({
        day: iso,
        start_time: allDay ? '00:00' : minToTime(startMin),
        end_time: allDay ? '23:59:59' : minToTime(endMin),
        all_day: allDay,
        name: name.trim(),
        note: note.trim() || null,
        status: 'accepted',
      });
      setSending(false);
      if (err) {
        setError(errorText(err, true));
        return;
      }
      setName('');
      setNote('');
      setRange(null);
      setAllDay(false);
      onChanged();
      return;
    }

    const { data, error: err } = await supabase.rpc('book_slot', {
      p_day: iso,
      p_start: allDay ? null : minToTime(startMin),
      p_end: allDay ? null : minToTime(endMin),
      p_all_day: allDay,
      p_name: name.trim(),
      p_email: email.trim(),
      p_note: note.trim() || null,
      p_code: needsCode ? code.trim() : null,
    });
    setSending(false);
    if (err) {
      setError(errorText(err, false));
      if (err.code === '23P01') onChanged();
      return;
    }
    notifyNewBooking(data);
    setResult({
      token: data,
      email: email.trim(),
      when: allDay ? 'Cały dzień' : `${minToTime(startMin)}–${minToTime(endMin)}`,
    });
    onChanged();
  }

  // ---------- moderacja (admin) ----------

  async function notify(r) {
    if (!r.email) {
      setNotice('Zatwierdzone. Ten zapis nie ma adresu e-mail, więc nic nie wysłano.');
      return;
    }
    try {
      await sendAcceptedEmail(r);
    } catch (e) {
      if (e?.message === NOT_CONFIGURED) {
        setActionError(
          'Zatwierdzone, ale e-mail nie został wysłany: brakuje konfiguracji EmailJS (zobacz README).'
        );
      } else {
        // EmailJS zwraca { status, text } - pokazujemy to, żeby wiadomo było, co poszło nie tak
        const detail = [e?.status, e?.text || e?.message].filter(Boolean).join(': ');
        console.error('EmailJS:', e);
        setActionError(
          `Zatwierdzone, ale nie udało się wysłać e-maila${detail ? ` (${detail})` : ''}. ` +
            'Popraw przyczynę i użyj przycisku „Wyślij e-mail ponownie”.'
        );
      }
      return;
    }
    await supabase.from('bookings').update({ notified_at: new Date().toISOString() }).eq('id', r.id);
    setNotice(`Zatwierdzone. E-mail wysłano na ${r.email}.`);
  }

  async function accept(r) {
    setWorkingId(r.id);
    setActionError('');
    setNotice('');
    const { data, error: err } = await supabase
      .from('bookings')
      .update({ status: 'accepted' })
      .eq('id', r.id)
      .select();
    if (err || !data || data.length === 0) {
      setWorkingId(null);
      setActionError('Nie udało się zatwierdzić spotkania.');
      return;
    }
    await notify(r);
    setWorkingId(null);
    onChanged();
  }

  async function resend(r) {
    setWorkingId(r.id);
    setActionError('');
    setNotice('');
    await notify(r);
    setWorkingId(null);
    onChanged();
  }

  async function remove(id) {
    if (!window.confirm('Usunąć to spotkanie? Znajomy nie dostanie o tym wiadomości.')) return;
    setActionError('');
    setNotice('');
    const { error: err } = await supabase.from('bookings').delete().eq('id', id);
    if (err) setActionError('Nie udało się usunąć spotkania.');
    else onChanged();
  }

  // admin: zamknięcie / otwarcie dnia
  async function toggleClosed(next) {
    setClosing(true);
    setActionError('');
    const res = next
      ? await supabase.from('closed_days').insert({ day: iso })
      : await supabase.from('closed_days').delete().eq('day', iso);
    setClosing(false);
    if (res.error) setActionError('Nie udało się zmienić statusu dnia.');
    else onChanged();
  }

  async function copyLink(url) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  // ---------- widok po wysłaniu formularza ----------
  if (result) {
    const url = result.token
      ? `${window.location.origin}${window.location.pathname}#/anuluj/${result.token}`
      : '';
    return (
      <div key="done" className="panel panel--done" aria-live="polite">
        <svg className="tick" viewBox="0 0 52 52" aria-hidden="true">
          <circle cx="26" cy="26" r="24" fill="none" pathLength="1" />
          <path d="M14 27l8 8 16-17" fill="none" pathLength="1" />
        </svg>
        <h2>Wysłane</h2>
        <p className="badge badge--pending">Czeka na zatwierdzenie</p>
        <p className="panel__sub">
          {formatDayLong(iso)}
          {result.when ? `, ${result.when}` : ''}
        </p>
        <p>
          Twój termin jest w trakcie rozpatrywania. Gdy go zatwierdzę, dostaniesz wiadomość
          na adres <strong>{result.email}</strong>. Jeżeli nie widzisz wiadomości, koniecznie
          sprawdź folder spam. Do tego czasu termin jest zarezerwowany dla Ciebie.
        </p>
        {url && (
          <>
            <p>
              Jeśli plany się zmienią, odwołasz zapis tym linkiem. Skopiuj go teraz, bo
              nie pokażę go drugi raz.
            </p>
            <div className="linkbox">
              <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link do anulowania" />
              <button type="button" className="btn btn--ghost" onClick={() => copyLink(url)}>
                {copied ? 'Skopiowano' : 'Kopiuj link'}
              </button>
            </div>
          </>
        )}
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setResult(null);
            setRange(null);
            setAllDay(false);
            setCopied(false);
          }}
        >
          Zapisz się na kolejny termin
        </button>
      </div>
    );
  }

  return (
    <div key="form" className="panel">
      <h2>{formatDayLong(iso)}</h2>
      <p className="panel__sub">
        {closed && !isAdmin
          ? 'Dzień zamknięty dla nowych zapisów'
          : hasBusy
          ? isAdmin
            ? 'Spotkania tego dnia'
            : 'Zajęte terminy tego dnia'
          : 'Nic jeszcze nie zaplanowano'}
      </p>

      {isAdmin && (
        <>
          <label className="check check--closed">
            <input
              type="checkbox"
              checked={closed}
              disabled={closing}
              onChange={(e) => toggleClosed(e.target.checked)}
            />
            <span>Oznacz dzień jako zajęty</span>
          </label>
          <p className="hint hint--closed-admin">
            {closed
              ? 'Dzień jest zamknięty: znajomi widzą tylko umówione spotkania, a resztę godzin jako niedostępną. Ty nadal możesz dodawać spotkania.'
              : 'Zaznacz, jeśli reszta dnia ma być niedostępna dla znajomych, nawet gdy zostały wolne godziny.'}
          </p>
        </>
      )}

      {hasPending && !isAdmin && (
        <p className="hint hint--pending">
          Terminy oznaczone na pomarańczowo czekają na moje zatwierdzenie i są na razie zajęte.
        </p>
      )}

      {hasBusy && (
        <ul className="entries">
          {sorted.map((r) => {
            const pending = r.status === 'pending';
            return (
              <li key={r.id || `${r.start_time}-${r.end_time}`} className={`entry ${pending ? 'entry--pending' : ''}`}>
                <div>
                  <strong>{rowLabel(r)}</strong>{' '}
                  <span className={`badge ${pending ? 'badge--pending' : 'badge--accepted'}`}>
                    {pending ? 'Oczekuje na zatwierdzenie' : isAdmin ? 'Zatwierdzone' : 'Zajęte'}
                  </span>
                  {isAdmin && (
                    <>
                      <div>{r.name}</div>
                      {r.email && (
                        <div className="muted">
                          E-mail: <a href={`mailto:${r.email}`}>{r.email}</a>
                        </div>
                      )}
                      {r.note && <div className="muted">{r.note}</div>}
                      {!pending && r.email && r.notified_at && (
                        <div className="muted">E-mail o zatwierdzeniu wysłano</div>
                      )}
                    </>
                  )}
                </div>
                {isAdmin && (
                  <div className="entry__actions">
                    {pending && (
                      <button
                        type="button"
                        className="btn btn--accept"
                        disabled={workingId === r.id}
                        onClick={() => accept(r)}
                      >
                        {workingId === r.id ? 'Zatwierdzam…' : 'Zaakceptuj'}
                      </button>
                    )}
                    {!pending && r.email && !r.notified_at && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        disabled={workingId === r.id}
                        onClick={() => resend(r)}
                      >
                        Wyślij e-mail ponownie
                      </button>
                    )}
                    <button type="button" className="btn btn--danger" onClick={() => remove(r.id)}>
                      Usuń
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {notice && (
        <p className="msg msg--ok" role="status">
          {notice}
        </p>
      )}
      {actionError && (
        <p className="msg msg--error" role="alert">
          {actionError}
        </p>
      )}

      {dayClosed ? (
        <p className="muted">Ten dzień już minął.</p>
      ) : closed && !isAdmin ? (
        <>
          <p className="hint hint--closed">
            Ten dzień jest zamknięty dla nowych zapisów. Poniżej widać, które godziny są już umówione.
          </p>
          <SlotPicker busy={busy} blocked={blocked} value={null} onChange={() => {}} closed />
        </>
      ) : (
        <form onSubmit={submit} className="form">
          <h3>{isAdmin ? 'Dodaj spotkanie' : 'Wybierz godziny'}</h3>

          <label className="check">
            <input
              type="checkbox"
              checked={allDay}
              disabled={allDayLocked}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            <span>{isAdmin ? 'Zajmij cały dzień' : 'Cały dzień'}</span>
          </label>
          {allDayLocked && (
            <p className="hint">
              {hasBusy
                ? 'Cały dzień można zająć tylko wtedy, gdy nic innego go nie zajmuje.'
                : 'Na dzisiaj można zapisać się tylko na wybrane godziny.'}
            </p>
          )}

          <SlotPicker
            busy={busy}
            blocked={blocked}
            value={range}
            onChange={setRange}
            disabled={allDay}
          />

          {complete && !allDay && (
            <p className="summary">
              {minToTime(startMin)}–{minToTime(endMin)} ({formatDuration(endMin - startMin)})
            </p>
          )}
          {range && !complete && !allDay && (
            <p className="summary summary--partial">Początek: {minToTime(startMin)}. Wybierz koniec.</p>
          )}

          <label className="field">
            <span>{isAdmin ? 'Tytuł lub z kim' : 'Imię'}</span>
            <input
              value={name}
              maxLength={60}
              required
              autoComplete={isAdmin ? 'off' : 'given-name'}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          {!isAdmin && (
            <label className="field">
              <span>E-mail (wyślę tu potwierdzenie)</span>
              <input
                type="email"
                value={email}
                maxLength={200}
                required
                autoComplete="email"
                placeholder="twoj@email.pl"
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}

          <label className="field">
            <span>Notatka (opcjonalnie)</span>
            <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </label>

          {!isAdmin && needsCode && (
            <label className="field">
              <span>Kod zaproszenia</span>
              <input value={code} required autoComplete="off" onChange={(e) => setCode(e.target.value)} />
            </label>
          )}

          {!isAdmin && (
            <input
              className="hp"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              name="website"
              value={hp}
              onChange={(e) => setHp(e.target.value)}
            />
          )}

          {!allDay && !complete && !error && (
            <p className="hint hint--required">
              Wybierz początek i koniec (minimum {formatDuration(MIN_DURATION)}) albo zaznacz cały dzień.
            </p>
          )}

          {error && (
            <p className="msg msg--error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn" disabled={!canSubmit}>
            {sending ? 'Wysyłam…' : isAdmin ? 'Dodaj spotkanie' : 'Wyślij prośbę o spotkanie'}
          </button>
        </form>
      )}
    </div>
  );
}
