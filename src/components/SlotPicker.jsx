import { POINTS, SLOTS, formatDuration, minToTime } from '../lib/dates';
import { MIN_DURATION, STEP } from '../config';

const MIN_STEPS = Math.ceil(MIN_DURATION / STEP);

// busy[i]    - pole godzinowe zajęte ('accepted' | 'pending' | null)
// blocked[i] - niedostępne z innego powodu (np. godzina już minęła)
// value      - null | { start: indeks punktu, end: indeks punktu | null }
export default function SlotPicker({ busy, blocked, value, onChange, disabled }) {
  const free = (k) => k >= 0 && k < SLOTS.length && !busy[k] && !blocked[k];

  // początek jest możliwy, gdy od niego jest wolne co najmniej MIN_DURATION
  const validStart = (i) => {
    for (let k = i; k < i + MIN_STEPS; k++) if (!free(k)) return false;
    return true;
  };

  const start = value ? value.start : null;
  const end = value && value.end != null ? value.end : null;
  const endMode = start !== null && end === null;

  // najdalszy możliwy koniec przy wybranym początku (do pierwszego zajętego pola)
  let maxEnd = -1;
  if (endMode) {
    let k = start;
    while (free(k)) k++;
    maxEnd = k;
  }
  const validEnd = (j) => endMode && j >= start + MIN_STEPS && j <= maxEnd;

  // pola tuż po początku (krócej niż MIN_DURATION) nie mogą być ani końcem, ani nowym początkiem
  const tooShort = (i) => endMode && i > start && i < start + MIN_STEPS;

  function click(i) {
    if (disabled) return;
    if (endMode) {
      if (validEnd(i)) {
        onChange({ start, end: i });
        return;
      }
      if (i === start) {
        onChange(null);
        return;
      }
      if (tooShort(i)) return;
    }
    if (validStart(i)) onChange({ start: i, end: null });
  }

  const minLabel = formatDuration(MIN_DURATION);
  const hint = disabled
    ? 'Zajmujesz cały dzień, godziny nie są potrzebne.'
    : endMode
    ? `Teraz kliknij godzinę końca (minimum ${minLabel} od początku). Kliknij początek jeszcze raz, żeby go zdjąć.`
    : end !== null
    ? 'Kliknij inną godzinę początku, żeby zmienić wybór.'
    : `Kliknij godzinę początku. Rezerwacja trwa minimum ${minLabel}.`;

  return (
    <div>
      <div className="slots" role="group" aria-label="Godziny" aria-disabled={disabled}>
        {POINTS.map((p, i) => {
          const showBusy = i < SLOTS.length && busy[i] && !(endMode && validEnd(i));
          const clickable =
            !disabled && (endMode ? i === start || validEnd(i) || (validStart(i) && !tooShort(i)) : validStart(i));
          const isFrom = !disabled && i === start;
          const isTo = !disabled && i === end;
          const inRange = !disabled && start !== null && end !== null && i > start && i < end;
          const cls = [
            'slot',
            showBusy ? (busy[i] === 'pending' ? 'slot--pending' : 'slot--busy') : '',
            !showBusy && i < SLOTS.length && blocked[i] ? 'slot--past' : '',
            !showBusy && !clickable && !disabled && !(i < SLOTS.length && blocked[i]) ? 'slot--na' : '',
            endMode && validEnd(i) ? 'slot--end' : '',
            isFrom || isTo ? 'slot--on' : '',
            inRange ? 'slot--range' : '',
            disabled ? 'slot--off' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={p}
              type="button"
              className={cls}
              disabled={!clickable}
              aria-pressed={isFrom || isTo || inRange}
              aria-label={`${minToTime(p)}${
                showBusy ? (busy[i] === 'pending' ? ', oczekuje na zatwierdzenie' : ', zajęte') : ''
              }`}
              onClick={() => click(i)}
            >
              {minToTime(p)}
              {(isFrom || isTo) && <small>{isFrom ? 'od' : 'do'}</small>}
            </button>
          );
        })}
      </div>
      <p className="hint">{hint}</p>
    </div>
  );
}
