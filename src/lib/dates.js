import { DAY_START, DAY_END, STEP } from '../config';

export const pad = (n) => String(n).padStart(2, '0');

export const toISO = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayISO = () => toISO(new Date());

// "10:30:00" -> 630 (minuty od północy)
export const timeToMin = (t) => {
  const [h, m, s] = t.split(':').map(Number);
  return h * 60 + m + (s || 0) / 60;
};

// 630 -> "10:30"
export const minToTime = (m) => {
  const r = Math.round(m);
  return `${pad(Math.floor(r / 60))}:${pad(r % 60)}`;
};

export const shortTime = (t) => t.slice(0, 5);

export const formatDuration = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
};

const dayLong = new Intl.DateTimeFormat('pl-PL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
export const formatDayLong = (iso) => dayLong.format(parseISO(iso));

const monthLong = new Intl.DateTimeFormat('pl-PL', {
  month: 'long',
  year: 'numeric',
});
export const monthTitle = (y, m) => monthLong.format(new Date(y, m, 1));

export const monthDays = (y, m) => {
  const count = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => toISO(new Date(y, m, i + 1)));
};

// Ile pustych pól przed 1. dniem miesiąca (tydzień zaczyna się w poniedziałek)
export const monthLead = (y, m) => (new Date(y, m, 1).getDay() + 6) % 7;

export const monthRange = (y, m) => {
  const days = monthDays(y, m);
  return [days[0], days[days.length - 1]];
};

// ---- sloty godzinowe ----

export const SLOTS = Array.from(
  { length: ((DAY_END - DAY_START) * 60) / STEP },
  (_, i) => DAY_START * 60 + i * STEP
);

// wiersz z bazy -> przedział w minutach
export const toInterval = (row) =>
  row.all_day
    ? { start: 0, end: 1440 }
    : { start: timeToMin(row.start_time), end: timeToMin(row.end_time) };

export const busyMask = (intervals) =>
  SLOTS.map((s) => intervals.some((iv) => iv.start < s + STEP && iv.end > s));

// 'free' = wolny cały dzień, 'partial' = część godzin, 'full' = zajęty
export const dayStatus = (intervals) => {
  const lo = DAY_START * 60;
  const hi = DAY_END * 60;
  const clipped = intervals
    .map((iv) => [Math.max(iv.start, lo), Math.min(iv.end, hi)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);

  let covered = 0;
  let curEnd = lo;
  for (const [a, b] of clipped) {
    const s = Math.max(a, curEnd);
    if (b > s) {
      covered += b - s;
      curEnd = b;
    }
  }
  if (covered <= 0) return 'free';
  if (covered >= hi - lo - 0.5) return 'full';
  return 'partial';
};
