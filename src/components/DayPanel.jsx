import { useMemo, useState } from 'react';
import { supabase } from '../supabase';
import {
  SLOTS,
  busyMask,
  formatDayLong,
  formatDuration,
  minToTime,
  shortTime,
  todayISO,
  toInterval,
} from '../lib/dates';
import { STEP } from '../config';
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

export default function DayPanel({ iso, rows, isAdmin, needsCode, onChanged }) {
  const today = todayISO();
  const isPast = iso < today;
  const isToday = iso === today;

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [rows]
  );
  const busy = useMemo(() => busyMask(sorted.map(toInterval)), [sorted]);
  const hasBusy = sorted.length > 0;

  const nowMin = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : -1;
  const blocked = SLOTS.map((s) => !isAdmin && (isPast || (isToday && s < nowMin)));

  const [range, setRange] = useState(null);
  const [allDay, setAllDay] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');
  const [code, setCode] = useState('');
  const [hp, setHp] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const dayClosed = !isAdmin && isPast;
  const allDayLocked = hasBusy || (!isAdmin && isToday);
  const canSubmit = name.trim() && (allDay || range) && !sending && !dayClosed;

  const startMin = range ? SLOTS[range.from] : null;
  const endMin = range ? SLOTS[range.to] + STEP : null;

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');

    // pole-pułapka dla botów: człowiek go nie widzi
    if (!isAdmin && hp) {
      setResult({});
      return;
    }

    setSending(true);

    if (isAdmin) {
      const { error: err } = await supabase.from('bookings').insert({
        day: iso,
        start_time: allDay ? '00:00' : minToTime(startMin),
        end_time: allDay ? '23:59:59' : minToTime(endMin),
        all_day: allDay,
        name: name.trim(),
        note: note.trim() || null,
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
      p_contact: contact.trim() || null,
      p_note: note.trim() || null,
      p_code: needsCode ? code.trim() : null,
    });
    setSending(false);
    if (err) {
      setError(errorText(err, false));
      if (err.code === '23P01') onChanged();
      return;
    }
    setResult({
      token: data,
      when: allDay ? 'Cały dzień' : `${minToTime(startMin)}–${minToTime(endMin)}`,
    });
    onChanged();
  }

  async function remove(id) {
    if (!window.confirm('Usunąć to spotkanie?')) return;
    const { error: err } = await supabase.from('bookings').delete().eq('id', id);
    if (err) setError('Nie udało się usunąć spotkania.');
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

  // ---- widok po udanym zapisie ----
  if (result) {
    const url = result.token
      ? `${window.location.origin}${window.location.pathname}#/anuluj/${result.token}`
      : '';
    return (
      <div className="panel" aria-live="polite">
        <h2>Zapisane</h2>
        <p className="panel__sub">
          {formatDayLong(iso)}
          {result.when ? `, ${result.when}` : ''}
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
    <div className="panel">
      <h2>{formatDayLong(iso)}</h2>
      <p className="panel__sub">
        {hasBusy ? (isAdmin ? 'Spotkania tego dnia' : 'Zajęte terminy tego dnia') : 'Nic jeszcze nie zaplanowano'}
      </p>

      {hasBusy && (
        <ul className="entries">
          {sorted.map((r) => (
            <li key={r.id || `${r.start_time}-${r.end_time}`} className="entry">
              <div>
                <strong>{rowLabel(r)}</strong>
                {isAdmin && (
                  <>
                    <div>{r.name}</div>
                    {r.contact && <div className="muted">Kontakt: {r.contact}</div>}
                    {r.note && <div className="muted">{r.note}</div>}
                  </>
                )}
              </div>
              {isAdmin && (
                <button type="button" className="btn btn--danger" onClick={() => remove(r.id)}>
                  Usuń
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {dayClosed ? (
        <p className="muted">Ten dzień już minął.</p>
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

          {range && !allDay && (
            <p className="summary">
              {minToTime(startMin)}–{minToTime(endMin)} ({formatDuration(endMin - startMin)})
            </p>
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
              <span>Kontakt (opcjonalnie)</span>
              <input
                value={contact}
                maxLength={100}
                placeholder="telefon, e-mail albo Instagram"
                onChange={(e) => setContact(e.target.value)}
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

          {error && (
            <p className="msg msg--error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn" disabled={!canSubmit}>
            {sending ? 'Zapisuję…' : isAdmin ? 'Dodaj spotkanie' : 'Zapisz się'}
          </button>
        </form>
      )}
    </div>
  );
}
