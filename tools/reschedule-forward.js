#!/usr/bin/env node
// Move a month of boards into the publishing queue (2026-08-19, Max's call).
//
//   node tools/reschedule-forward.js --from=2026-07              # plan only
//   node tools/reschedule-forward.js --from=2026-07 --commit     # write it
//   node tools/reschedule-forward.js --from=2026-07 --seed=42    # reshuffle
//
// July's 29 boards were never really published in July — D-24 backdated every
// listed board to build an archive out of work that already existed. So this
// re-dates boards whose dates were synthetic to begin with, turning a static
// archive into runway: the queue has hit zero twice, and the calendar's first
// month becomes August because `calendar-month.js` bounds its navigation by the
// earliest RELEASED entry, not the earliest file.
//
// Order is SHUFFLED (Max's call) and seeded, so a run he likes is reproducible
// and one he dislikes is one `--seed` away from being different. A spread pass
// then separates boards whose titles share a word, so two "Tools" boards do not
// land on consecutive days.
//
// Plan by default and NO writes, like schedule-launch.js — re-dating the whole
// calendar is exactly the kind of hard-to-reverse action that deserves a dry run
// you read first. Every write goes through puzzle-store.reschedule, the only
// door into puzzles/.
//
// One deliberate difference from schedule-launch: that tool clears every date
// first because it backdates INTO occupied days. Here the targets are in the
// future and provably free, so this verifies they are unoccupied and then
// assigns directly — no window in which boards sit dateless and unpublished.

import { fileURLToPath } from 'node:url';

import { fisherYates, mulberry32 } from '../src/engine/rng.js';
import { nextDay } from '../src/source/release.js';
import { significantWords } from '../studio/subject.js';

const MONTH = /^\d{4}-\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Words a title shares with its neighbour — reuses the echo guard's notion of significant. */
const titleWords = (title) => significantWords(String(title ?? ''));

/**
 * Reorder so no board sits next to one sharing a title word.
 *
 * A single bounded pass, never a retry loop: at each position, if the candidate
 * clashes with the board before it, swap in the next later board that does not.
 * If nothing suitable remains the clash simply stands — a schedule that cannot
 * be perfectly spread must still be produced, and a tool that loops forever
 * looking for perfection is worse than one adjacent pair.
 */
export function spreadByTitle(boards) {
  const out = [...boards];
  for (let i = 1; i < out.length; i += 1) {
    const previous = titleWords(out[i - 1].title);
    const clashes = (board) => [...titleWords(board.title)].some((word) => previous.has(word));
    if (!clashes(out[i])) continue;

    const swap = out.findIndex((board, j) => j > i && !clashes(board));
    if (swap !== -1) [out[i], out[swap]] = [out[swap], out[i]];
  }
  return out;
}

/**
 * Pure plan: which board of the source month lands on which future day.
 *
 * @param {{slug: string, title: string, date: string}[]} entries  the manifest
 * @param {string} fromMonth  'YYYY-MM' — the month being emptied into the queue
 * @param {string} startDate  'YYYY-MM-DD' — the first day of the new run
 * @param {number} seed       replayable shuffle
 */
export function planForward({ entries = [], fromMonth, startDate, seed = 1 } = {}) {
  const errors = [];
  if (!MONTH.test(String(fromMonth))) errors.push(`--from must be a YYYY-MM month, got "${fromMonth}"`);
  if (!DATE.test(String(startDate))) errors.push(`--start must be a YYYY-MM-DD date, got "${startDate}"`);
  if (errors.length > 0) return { errors, assignments: [] };

  const moving = entries.filter((entry) => String(entry.date).startsWith(`${fromMonth}-`));
  if (moving.length === 0) {
    return { errors: [`no boards are dated ${fromMonth} — nothing to move`], assignments: [] };
  }

  // Dates the boards that AREN'T moving already hold. A collision must refuse the
  // whole plan rather than let reschedule fail halfway through a 29-board write.
  const staying = new Set(
    entries.filter((entry) => !moving.includes(entry)).map((entry) => entry.date),
  );

  const ordered = spreadByTitle(fisherYates(moving, mulberry32(seed)));

  const assignments = [];
  let date = startDate;
  for (const board of ordered) {
    if (staying.has(date)) {
      const taken = entries.find((entry) => entry.date === date);
      errors.push(`${date} already belongs to "${taken.slug}" — one board per day`);
      return { errors, assignments: [] };
    }
    assignments.push({ slug: board.slug, title: board.title, from: board.date, date });
    date = nextDay(date);
  }
  return { errors, assignments };
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, '').split('=');
      return [key, value ?? true];
    }),
  );

  const { createPuzzleStore } = await import('../studio/storage/puzzle-store.js');
  const store = createPuzzleStore({
    rootDir: fileURLToPath(new URL('../puzzles/', import.meta.url)),
  });

  const entries = store.list().filter((entry) => typeof entry.date === 'string');
  const scheduled = entries.map((entry) => entry.date).sort();
  const start = args.start ?? nextDay(scheduled.at(-1));

  const { errors, assignments } = planForward({
    entries,
    fromMonth: args.from,
    startDate: start,
    seed: Number(args.seed ?? 1),
  });

  if (errors.length > 0) {
    for (const error of errors) console.error(`  ✗ ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Moving ${assignments.length} board(s) from ${args.from} into the queue:\n`);
    for (const a of assignments) console.log(`  ${a.from} → ${a.date}   ${a.title}`);
    console.log(`\nRuns ${assignments[0].date} → ${assignments.at(-1).date}.`);

    if (args.commit) {
      for (const a of assignments) store.reschedule(a.slug, a.date);
      console.log(`\n✓ written — ${assignments.length} board(s) rescheduled, manifest regenerated.`);
    } else {
      console.log('\nPlan only. Nothing was written. Re-run with --commit to apply.');
    }
  }
}
