#!/usr/bin/env node
// ratings-report.js — what players think of the boards, read from the survey (D-21).
//
//   npm run ratings              # the readable report
//   npm run ratings -- --json    # the same readings, machine-readable
//
// A CLI over studio/player-ratings.js, the evaluator-report pattern: the reader owns
// the network and the dedupe, this file owns the words. It reads and writes nothing
// on disk, and needs SUPABASE_SERVICE_KEY in .env — the missing-key error names the
// variable and nothing else.

import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { loadEnv } from '../studio/env.js';
import { createRatingsReader } from '../studio/player-ratings.js';

const FAIRNESS_FLAG_BELOW = 2.5;

const avg = (reading) => (reading.average === null ? '  – ' : reading.average.toFixed(1));
const pct = (rate) => (rate === null ? '–' : `${Math.round(rate * 100)}%`);

/** Pure: per-board readings → the report text. Sorted by delight, best first. */
export function renderReport(boards) {
  if (boards.length === 0) {
    return 'No player ratings yet — the survey is live, the table is empty.\n';
  }

  const sorted = [...boards].sort(
    (a, b) => (b.ratings.delight.average ?? -1) - (a.ratings.delight.average ?? -1)
  );

  const lines = [];
  lines.push('Player ratings — 1 to 4, averaged over each player’s latest answer\n');
  const slugWidth = Math.max(...sorted.map((b) => b.slug.length), 'board'.length);
  lines.push(
    `  ${'board'.padEnd(slugWidth)}  players  win   difficulty  delight  fairness`
  );
  for (const board of sorted) {
    lines.push(
      `  ${board.slug.padEnd(slugWidth)}  ${String(board.players).padStart(7)}  ${pct(
        board.winRate
      ).padStart(4)}  ${avg(board.ratings.difficulty).padStart(10)}  ${avg(
        board.ratings.delight
      ).padStart(7)}  ${avg(board.ratings.fairness).padStart(8)}`
    );
  }

  const flagged = sorted.filter(
    (b) => b.ratings.fairness.average !== null && b.ratings.fairness.average < FAIRNESS_FLAG_BELOW
  );
  if (flagged.length > 0) {
    lines.push('');
    lines.push(`Flagged — fairness averaging under ${FAIRNESS_FLAG_BELOW}:`);
    for (const board of flagged) {
      lines.push(
        `  ${board.slug} — fairness ${board.ratings.fairness.average.toFixed(1)} from ${
          board.ratings.fairness.count
        } answer${board.ratings.fairness.count === 1 ? '' : 's'}`
      );
    }
  }

  const chatty = sorted.filter((b) => b.comments.length > 0);
  if (chatty.length > 0) {
    lines.push('');
    lines.push('Comments, newest first:');
    for (const board of chatty) {
      lines.push(`  ${board.slug}`);
      for (const comment of board.comments) {
        const outcome = comment.won === true ? 'won' : comment.won === false ? 'lost' : '—';
        lines.push(`    [${outcome}] ${comment.note}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

async function main() {
  const { values } = parseArgs({ options: { json: { type: 'boolean', default: false } } });

  loadEnv();
  const boards = await createRatingsReader().fetchBoards();

  if (values.json) console.log(JSON.stringify(boards, null, 2));
  else console.log(renderReport(boards));
}

// Only runs as a script, so importing renderReport in a test costs nothing.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
