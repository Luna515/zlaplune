import { formatDayLong } from '../lib/dates';

const DOW = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

const STATUS_LABEL = {
  free: 'wolny cały dzień',
  partial: 'wolne tylko niektóre godziny',
  full: 'zajęty',
};

function Chevron({ dir }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d={dir === 'left' ? 'M11.5 3.5 6 9l5.5 5.5' : 'M6.5 3.5 12 9l-5.5 5.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
      />
    </svg>
  );
}

export default function Calendar({
  title,
  lead,
  days,
  statusByDay,
  loading,
  selected,
  today,
  lockPast,
  onSelect,
  onPrev,
  onNext,
  canPrev,
  canNext,
}) {
  return (
    <section className="cal" aria-label="Kalendarz">
      <div className="cal__head">
        <h2 className="cal__title" aria-live="polite">
          {title}
        </h2>
        <div className="cal__nav">
          <button type="button" onClick={onPrev} disabled={!canPrev} aria-label="Poprzedni miesiąc">
            <Chevron dir="left" />
          </button>
          <button type="button" onClick={onNext} disabled={!canNext} aria-label="Następny miesiąc">
            <Chevron dir="right" />
          </button>
        </div>
      </div>

      <div className="cal__grid">
        {DOW.map((d) => (
          <div key={d} className="cal__dow" aria-hidden="true">
            {d}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`b${i}`} />
        ))}
        {days.map((iso) => {
          const past = iso < today;
          const status = statusByDay[iso] || 'free';
          const cls = [
            'day',
            loading ? 'day--loading' : `day--${status}`,
            past ? 'day--past' : '',
            iso === today ? 'day--today' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={iso}
              type="button"
              className={cls}
              disabled={past && lockPast}
              aria-pressed={selected === iso}
              aria-label={`${formatDayLong(iso)}, ${
                past && lockPast ? 'termin minął' : loading ? 'wczytywanie' : STATUS_LABEL[status]
              }`}
              onClick={() => onSelect(iso)}
            >
              <span className="day__num">{Number(iso.slice(8))}</span>
              <span className="day__bar" />
            </button>
          );
        })}
      </div>

      <ul className="legend" aria-label="Legenda">
        <li style={{ '--c': 'var(--free)' }}>
          <i /> Wolny cały dzień
        </li>
        <li style={{ '--c': 'var(--partial)' }}>
          <i /> Wolne tylko niektóre godziny
        </li>
        <li style={{ '--c': 'var(--full)' }}>
          <i /> Zajęty
        </li>
      </ul>
    </section>
  );
}
