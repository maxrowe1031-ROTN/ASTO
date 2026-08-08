// lexical.js — can these two words be paired without reading the relationship?
//
// Pure. Imports nothing. No I/O, no config, no randomness.
//
// Max, 2026-08-08, on a music board: *"i keep seeing puzzles that include
// something really easy like 'fade in : fade out'. It seems too easy but maybe
// that needs testing from other audiences."* He is describing a real mechanism
// and it is not "the relationship is easy" — it is that **the tiles pair
// themselves before any relationship is read**. `fade in` and `fade out` match
// the way two socks match. The player finds them by looking, not by thinking,
// and the analogy the set is built on never gets examined.
//
// His own verdicts across the corpus imply a three-tier rule, and it is about
// PLACEMENT rather than banishment:
//
//   ONE self-matching pair is an on-ramp. He loved cinema's
//   `opening credits : closing credits :: greenlight : wrap` — "This puzzle
//   should be studied" — because the second pair reaches from watching a film
//   to making one, so the relationship still has to be seen.
//
//   BOTH pairs self-matching makes the set free. Music's Yellow
//   (`load-in : load-out :: fade-in : fade-out`) assembles itself.
//
//   A self-matching BLACK is miscalibrated by construction. He said so on the
//   bbq board's `wrap : unwrap` — "way too easy for a black".
//
// So this module REPORTS and never gates. Nothing here fails a board. It gives
// 03 a fact it could not otherwise see, warns 01 off the worst shape, and puts
// a note on the review card — and where such sets belong stays Max's call, and
// an audience test's. See design.md D-12.
//
// Deliberately conservative. It answers one narrow question — do these two
// terms SHARE VISIBLE TEXT — and stays silent on semantic symmetry, which is a
// different axis with its own treatment (`isSymmetric` in vocabulary.js, D-9).
// `ignite : extinguish` is a perfectly symmetric opposite and shares nothing
// lexically, so it is not this module's business.

// Four characters. Three would catch `sunrise`/`sunset` on "sun", which is a
// shared SUBJECT rather than a shared word — the player still has to read the
// relationship to pair them, and Max has never complained about that set. The
// threshold is where "same word" starts and "same topic" stops.
const MIN_SHARED = 4;

const normalize = (term) =>
  String(term ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim();

const tokens = (term) => normalize(term).split(/[\s-]+/).filter(Boolean);

/**
 * Do these two terms pair themselves on sight?
 *
 * True in two shapes:
 *
 *   A shared whole token of at least four characters —
 *   `fade-in`/`fade-out`, `load-in`/`load-out`,
 *   `opening credits`/`closing credits`.
 *
 *   One term contained in the other, the shorter being at least four —
 *   `wrap`/`unwrap`, `seal`/`unseal`.
 *
 * Identical terms are excluded: a set cannot use the same word twice, so it is
 * a different defect entirely and the schema already refuses it.
 */
export function selfMatchingPair(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right || left === right) return false;

  const shared = tokens(a).filter(
    (token) => token.length >= MIN_SHARED && tokens(b).includes(token),
  );
  if (shared.length > 0) return true;

  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= MIN_SHARED && longer.includes(shorter);
}

/**
 * How many of a set's two pairs pair themselves: 0, 1 or 2.
 *
 * Takes anything shaped `{ pairs: [[a, b], …] }` — a puzzle set, a grouper's
 * candidate set — because this runs both before a board exists and after.
 */
export function selfMatchingCount(set) {
  return (set?.pairs ?? []).filter((pair) => selfMatchingPair(pair?.[0], pair?.[1])).length;
}

/**
 * One line per set, for a prompt or a review card. Empty when a board has
 * nothing to report, so callers can drop it like any other empty part.
 */
export function selfMatchingBySet(sets = []) {
  const bySet = {};
  for (const set of sets) {
    const count = selfMatchingCount(set);
    if (count > 0) bySet[set.id] = count;
  }
  return bySet;
}
