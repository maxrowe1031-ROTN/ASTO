#!/usr/bin/env node
// plays-report.js — did anyone show up? The play counter, read back (D-34).
//
//   npm run plays              # the readable report
//   npm run plays -- --json    # the same readings, machine-readable
//
// A CLI over studio/player-ratings.js (the network) and studio/plays-summary.js (the
// arithmetic), the ratings-report pattern: this file owns the words. It reads and
// writes nothing on disk, and needs SUPABASE_SERVICE_KEY in .env — the missing-key
// error names the variable and nothing else.

import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { loadEnv } from '../studio/env.js';
import { createRatingsReader } from '../studio/player-ratings.js';
import { summarizePlays } from '../studio/plays-summary.js';
import { dateKeyFor } from '../src/source/release.js';

const pct = (rate) => (rate === null ? '  –' : `${String(Math.round(rate * 100)).padStart(3)}%`);
const bar = (n, max) => (max === 0 ? '' : '▇'.repeat(Math.round((n / max) * 20)));

/** Pure: a summary → the report text. */
export function renderReport(summary) {
  const { days, totals, boards } = summary;
  const lines = [];

  if (totals.starts === 0) {
    lines.push('No plays recorded yet — the counter is live, the table is empty.');
    return lines.join('\n') + '\n';
  }

  lines.push(`Plays: ${totals.starts} started · ${totals.finishes} finished · ${pct(totals.completionRate).trim()} completion`);
  lines.push(`Players: ${totals.clients} browsers seen · ${totals.returningClients} came back on another day`);
  lines.push('');
  lines.push('Last 14 days (starts, finishes, completion):');
  const max = Math.max(...days.map((d) => d.starts));
  for (const day of days) {
    lines.push(`  ${day.date}  ${String(day.starts).padStart(4)} ${String(day.finishes).padStart(4)} ${pct(day.completionRate)}  ${bar(day.starts, max)}`);
  }
  lines.push('');
  lines.push('Boards (starts · finishes · wins), most played first:');
  for (const board of boards.slice(0, 20)) {
    lines.push(`  ${board.slug.padEnd(40)} ${String(board.starts).padStart(4)} ${String(board.finishes).padStart(4)} ${String(board.wins).padStart(4)}`);
  }
  if (boards.length > 20) lines.push(`  … and ${boards.length - 20} more`);
  return lines.join('\n') + '\n';
}

async function main() {
  const { values } = parseArgs({ options: { json: { type: 'boolean', default: false } } });
  loadEnv();
  const reader = createRatingsReader();
  const rows = await reader.fetchPlays();
  const summary = summarizePlays(rows, { today: dateKeyFor(new Date()) });
  process.stdout.write(values.json ? JSON.stringify(summary, null, 2) + '\n' : renderReport(summary));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
