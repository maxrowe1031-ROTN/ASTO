#!/usr/bin/env node
// The publishing queue's report card — the human-visible replacement for a
// scheduled job's low-queue alert (D-24: the release gate is client-side, so
// nothing runs at midnight; a person looks at this instead, at /warmup).
//
//   npm run check-schedule
//
// Reports: today's board, the runway (consecutive covered days from today),
// future gaps, duplicate dates, and dateless boards (deliberately unpublished,
// or a slip — this is where a slip becomes visible).
//
// Exits non-zero only when TODAY has no board — the one state a player can see.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { dateKeyFor } from '../src/source/release.js';
import { analyzeSchedule } from '../studio/schedule.js';

const MANIFEST = fileURLToPath(new URL('../puzzles/index.json', import.meta.url));

// The analysis lives in studio/schedule.js since D-35, so the Review Studio's
// runway panel and this report card cannot disagree. Re-exported for callers.
export { analyzeSchedule };

export function render(report, todayKey) {
  const lines = [];
  lines.push(
    report.today
      ? `Today (${todayKey}): "${report.today.title}" — on the board.`
      : `Today (${todayKey}): NO BOARD. The front door falls back to Past Pours.`,
  );
  lines.push(
    `Runway: ${report.runway} day${report.runway === 1 ? '' : 's'} covered from today` +
      ` · ${report.queuedAhead} queued ahead · last scheduled ${report.lastScheduled ?? 'never'}.`,
  );
  if (report.gaps.length > 0) {
    lines.push(`Gaps before the last scheduled day: ${report.gaps.join(', ')}`);
  }
  if (report.datelessSlugs.length > 0) {
    lines.push(
      `Dateless (off the calendar, files intact): ${report.datelessSlugs.join(', ')}`,
    );
  }
  return lines.join('\n');
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  const { createPuzzleStore } = await import('../studio/storage/puzzle-store.js');
  const todayKey = dateKeyFor(new Date());
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const dateless = createPuzzleStore()
    .list()
    .filter((entry) => typeof entry.date !== 'string')
    .map((entry) => entry.slug);

  const report = analyzeSchedule(manifest.puzzles, dateless, todayKey);
  console.log(render(report, todayKey));
  process.exitCode = report.today ? 0 : 1;
}
