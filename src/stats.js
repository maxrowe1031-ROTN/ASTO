// The player's record, summarised. PURE — no DOM, no fetch, no clock, no storage.
//
// It answers one question: given the manifest, the saved results and what day it
// is, what do the statistics tiles and the mistake chart say? The view renders
// the answer; this module is where the answer is tested — the same arrangement
// calendar-month.js has with Past Pours.
//
// It reads the BEST-RESULT blob (asto.results), not the play history: "Played
// 44" means 44 different boards, and a replay improves a board's row without
// adding to the count (design.md D-24's spec, 2026-08-18). Every number here
// therefore agrees with a cup on the calendar, which is the whole point — the
// two screens are the same record read two ways. asto.history keeps accruing
// for a later feature and is deliberately not read here.
//
// The manifest is both numerator and denominator: a result for a board the
// manifest no longer lists — an unlisted board on an old ?puzzle= link, or one
// cut by the hard-launch trim — is ignored. The accepted consequence and its
// reconsider-when live in the spec.

import { releasedPuzzles } from './source/release.js';

/** The mistake chart's buckets: wins by beans used, then everything lost. */
const WIN_BUCKETS = ['0', '1', '2', '3'];
const LOST = 'Lost';

/**
 * The four cups, in the calendar's own vocabulary (D-16's addendum): the POSE
 * says how the board ended, the COLOUR says how it was played. A clean board
 * gets the white cup; taking the hint earns the brown one. Order is
 * best-to-worst, which is the order the row reads in.
 */
const OUTCOMES = [
  { key: 'won-clean', status: 'won', hinted: false },
  { key: 'won-hinted', status: 'won', hinted: true },
  { key: 'lost-clean', status: 'lost', hinted: false },
  { key: 'lost-hinted', status: 'lost', hinted: true },
];

/**
 * @param {object[]} manifest  manifest entries ({slug, date, ...}); may include future dates
 * @param {object}   results   storage.allResults() — { slug: {status, mistakes, ...} }
 * @param {string}   todayKey  what day it is (release.js decides in whose midnight)
 */
export function summarize(manifest, results, todayKey) {
  // releasedPuzzles owns the release rule and hands back the list ascending by
  // date — which is exactly the order a streak walks. Gating here rather than at
  // the call site keeps one owner of "has this board come out yet".
  const released = releasedPuzzles(manifest ?? [], todayKey);
  const saved = isObject(results) ? results : {};

  const resultFor = (entry) => (isObject(saved[entry.slug]) ? saved[entry.slug] : null);
  const wasWon = (entry) => resultFor(entry)?.status === 'won';

  const winCounts = WIN_BUCKETS.map(() => 0);
  const outcomeCounts = OUTCOMES.map(() => 0);
  let played = 0;
  let won = 0;

  for (const entry of released) {
    const result = resultFor(entry);
    if (result === null) continue; // released but never finished — not played
    played += 1;
    if (result.status === 'won') {
      won += 1;
      winCounts[bucketOf(result.mistakes)] += 1;
    }
    outcomeCounts[outcomeOf(result)] += 1;
  }

  // Losses are DERIVED, never counted alongside wins: anything finished that is
  // not a win is a loss, so a status this version has never heard of cannot fall
  // between the two and leave the chart quietly short of its own denominator.
  const losses = played - won;

  return {
    played,
    totalReleased: released.length,
    won,
    losses,
    winPercent: played === 0 ? 0 : Math.round((won / played) * 100),
    currentStreak: currentStreak(released, resultFor, todayKey),
    maxStreak: maxStreak(released, wasWon),
    outcomes: OUTCOMES.map((outcome, i) => ({ ...outcome, count: outcomeCounts[i] })),
    distribution: [
      ...WIN_BUCKETS.map((label, i) => ({ label, mistakes: i, count: winCounts[i] })),
      { label: LOST, mistakes: null, count: losses },
    ],
  };
}

/**
 * The run still going: consecutive won boards, counting back from the most recent.
 *
 * TODAY IS GRACED, and the grace covers UNPLAYED, not failed. If today's board
 * has no result yet, the count starts from the one before it — otherwise every
 * player's streak reads zero each morning until they have played, which is a
 * scoreboard punishing them for the hour of the day. Today LOST is not graced:
 * that is a finished day the player did not win, and it breaks the streak like
 * any other. Neither is an unwon board OLDER than today — that day came and went.
 *
 * The walk steps through released ENTRIES, not calendar days, so a gap in the
 * schedule is spanned rather than counted as a miss — a player cannot fail a day
 * that never had a puzzle on it.
 */
function currentStreak(released, resultFor, todayKey) {
  let i = released.length - 1;
  if (i >= 0 && released[i].date === todayKey && resultFor(released[i]) === null) i -= 1;

  let streak = 0;
  while (i >= 0 && resultFor(released[i])?.status === 'won') {
    streak += 1;
    i -= 1;
  }
  return streak;
}

/** The longest such run anywhere in the catalogue — a record, so it never falls. */
function maxStreak(released, wasWon) {
  let best = 0;
  let run = 0;
  for (const entry of released) {
    run = wasWon(entry) ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/**
 * Which cup a finished board earns. Anything not won is a loss, the same rule
 * `losses` follows, so the four counts cannot fail to sum to `played`. A result
 * saved before hints existed carries no `hintsUsed` at all — that is a clean
 * board, which is what it truthfully was.
 */
function outcomeOf(result) {
  const hinted = (result.hintsUsed ?? 0) > 0;
  const status = result.status === 'won' ? 'won' : 'lost';
  return OUTCOMES.findIndex((o) => o.status === status && o.hinted === hinted);
}

/**
 * Which bar a win belongs in. Clamps rather than rejects: storage degrades to
 * "nothing remembered" everywhere else rather than throwing, and a hand-edited
 * mistake count should cost the chart its precision, never its arithmetic. The
 * invariant the tests hold is that the five buckets sum to `played`.
 */
function bucketOf(mistakes) {
  const n = Math.trunc(Number(mistakes));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(WIN_BUCKETS.length - 1, n);
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
