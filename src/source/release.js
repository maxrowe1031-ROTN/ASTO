// The release rule. PURE — imports nothing, throws nothing.
//
// A daily game asks the manifest exactly one new question: which boards exist
// YET? Every entry carries a `date` (YYYY-MM-DD), and a board is released once
// today's date reaches it. "Today" is decided ONCE, in one timezone, for every
// player on earth — a shared daily puzzle is only shared if two people on a
// link agree which board is today's (design.md D-24, the NYT convention).
//
// The gate is client-side by decision, not oversight: every board is committed
// and Pages serves the repo verbatim, so a reader of index.json can see what is
// coming. Wordle shipped every future answer in its bundle and it never
// mattered — the reconsider-when lives in D-24.
//
// Dates compare as STRINGS. ISO 8601 dates are zero-padded and ordered
// year-month-day precisely so that lexicographic order IS chronological order;
// no Date parsing, no timezone re-entry, nothing to get wrong twice.
//
// `dateKeyFor` takes `now` as a parameter rather than reaching for the clock —
// the same law as the engine's injected RNG. The impure edge (app.js) passes
// `new Date()`; tests pass midnight minus a minute.

export const TIME_ZONE = 'America/Denver';

// en-CA is the locale whose short date format is already YYYY-MM-DD — the
// platform formats AND zone-shifts in one step, DST handled by the tz database
// rather than by arithmetic here.
const KEY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The date key for an instant: what day it is in the game's one timezone. */
export function dateKeyFor(now) {
  return KEY_FORMAT.format(now);
}

/** Released = dated today or earlier. A dateless entry is never released. */
export function isReleased(entry, todayKey) {
  return typeof entry?.date === 'string' && entry.date <= todayKey;
}

/** The gated list, ordered by date — what Past Pours and the calendar read. */
export function releasedPuzzles(manifest, todayKey) {
  return manifest
    .filter((entry) => isReleased(entry, todayKey))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * The key one calendar day after this one. UTC arithmetic on purpose: a date
 * key is a CALENDAR day, not an instant, so day math must never re-enter a
 * timezone (adding 24 hours across a DST fall-back lands on the same day).
 */
export function nextDay(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

/** The front door's board: the entry dated exactly today, or null (dry queue). */
export function todaysPuzzle(manifest, todayKey) {
  return manifest.find((entry) => entry?.date === todayKey) ?? null;
}
