import { formatDayLong, shortTime } from '../lib/dates';

// Lista wszystkich niezatwierdzonych próśb (z każdego miesiąca) dla adminki
export default function PendingList({ items, onPick }) {
  return (
    <section className="panel pending" aria-label="Do zatwierdzenia">
      <h2>
        Do zatwierdzenia
        {items.length > 0 && <span className="pending__count">{items.length}</span>}
      </h2>
      {items.length === 0 ? (
        <p className="muted">Nic nie czeka na zatwierdzenie.</p>
      ) : (
        <ul className="pending__list">
          {items.map((r, n) => (
            <li key={r.id} style={{ '--i': n }}>
              <button type="button" onClick={() => onPick(r.day)}>
                <span className="pending__when">
                  {formatDayLong(r.day)},{' '}
                  {r.all_day ? 'cały dzień' : `${shortTime(r.start_time)}–${shortTime(r.end_time)}`}
                </span>
                <span className="pending__who">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
