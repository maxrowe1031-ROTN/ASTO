// dom.js — the Studio's small shared helpers: escaping, money, time, day labels.
//
// One copy of each. `escape` used to exist four times across the review page's
// modules, two of them weaker than the others; everything under ui/ imports
// this one now. Pure — no document, no fetch — so every screen's string builder
// stays testable under node.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Model output goes into innerHTML; it never gets to be markup. */
export const escape = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Dollars to cents; an unknown cost is a dash, never a zero pretending. */
export const money = (usd) => (typeof usd === 'number' ? `$${usd.toFixed(2)}` : '—');

/** Stopwatch style: 58s · 3m 52s · 1h 2m. */
export function elapsed(ms) {
  if (typeof ms !== 'number') return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`.replace(/ 0(\d)s$/, ' $1s');
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** 'YYYY-MM-DD' → a UTC Date at midnight; the key is a calendar day, not an instant. */
const dayOf = (dateKey) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** Today · Wed 9 · Sat 19 — the calendar's own vocabulary. */
export function dayLabel(dateKey, todayKey) {
  if (dateKey === todayKey) return 'Today';
  const day = dayOf(dateKey);
  return `${WEEKDAYS[day.getUTCDay()]} ${day.getUTCDate()}`;
}

/** '19 Sep' from a date key or an ISO instant (its calendar day, UTC). */
export function shortDate(value) {
  if (typeof value !== 'string' || value.length < 10) return '—';
  const day = dayOf(value.slice(0, 10));
  return `${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`;
}
