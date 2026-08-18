// Month math for Past Pours. PURE — imports nothing, touches no DOM, no clock.
//
// It answers one question: given a month, the manifest, the saved results and
// what day it is, what does the calendar page look like? The view renders the
// answer; this module is where the answer is tested, the same arrangement
// nextUnfinished had with the old select screen.
//
// All arithmetic is UTC on date KEYS (calendar days, not instants) — the one
// timezone decision was already made when `todayKey` was computed (release.js),
// and re-entering a timezone here would be making it twice.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** '2026-08-18' → '2026-08' */
export const monthOf = (dateKey) => dateKey.slice(0, 7);

/** '2026-08' → 'August 2026' */
export function monthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

/** '2026-08-18' → 'August 18, 2026' — the title card's date line. */
export function dayLabel(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

const monthShift = (monthKey, by) => {
  const [year, month] = monthKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + by, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * One month of Past Pours.
 *
 * @param {string} monthKey  'YYYY-MM' — the page being viewed
 * @param {object[]} entries  manifest entries ({slug, title, date}); may include future dates
 * @param {object} results  { slug: {status, mistakes, solvedCount, hintsUsed} } from storage
 * @param {string} todayKey  what day it is (release.js decides in whose midnight)
 * @returns {{
 *   monthKey: string, label: string,
 *   prev: string|null, next: string|null,
 *   leading: number,
 *   days: { dateKey: string, day: number, kind: 'board'|'future'|'blank',
 *           entry?: object, result?: object|null }[]
 * }}
 *
 * Kinds, and why there are exactly three:
 *   'board'  — a released board lives on this day; tappable. Carries the entry
 *              and the saved result (null when unplayed).
 *   'future' — this day has not arrived. Whether a board is scheduled is
 *              deliberately NOT distinguishable here: a future square never
 *              carries an entry, so no view built on this model can leak a
 *              title before its day (D-24).
 *   'blank'  — the day came and went with no board on it: before the first
 *              board, or a gap where the queue ran dry. Inert, unremarkable.
 *
 * Navigation is bounded on both ends: `prev` stops at the earliest released
 * month (no march into empty 2019), `next` at the current month (the future is
 * not a place to browse).
 */
export function buildMonth(monthKey, entries, results, todayKey) {
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));

  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();

  const days = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${monthKey}-${String(day).padStart(2, '0')}`;
    if (dateKey > todayKey) {
      days.push({ dateKey, day, kind: 'future' });
      continue;
    }
    const entry = byDate.get(dateKey);
    if (!entry) {
      days.push({ dateKey, day, kind: 'blank' });
      continue;
    }
    days.push({ dateKey, day, kind: 'board', entry, result: results[entry.slug] ?? null });
  }

  const released = entries.filter((entry) => entry.date <= todayKey);
  const earliestMonth = released.length > 0
    ? monthOf(released.reduce((a, b) => (a.date < b.date ? a : b)).date)
    : monthOf(todayKey);

  return {
    monthKey,
    label: monthLabel(monthKey),
    prev: monthKey > earliestMonth ? monthShift(monthKey, -1) : null,
    next: monthKey < monthOf(todayKey) ? monthShift(monthKey, +1) : null,
    leading,
    days,
  };
}
