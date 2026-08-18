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

import { dateKeyFor, nextDay } from '../src/source/release.js';

const MANIFEST = fileURLToPath(new URL('../puzzles/index.json', import.meta.url));

/**
 * Pure analysis of the schedule. `entries` are manifest entries (dated by
 * construction); `datelessSlugs` are boards on disk with no date.
 */
export function analyzeSchedule(entries, datelessSlugs, todayKey) {
  const dates = new Set(entries.map((entry) => entry.date));
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = sorted.at(-1)?.date ?? null;

  // The runway: how many consecutive days, starting today, have a board.
  let runway = 0;
  for (let day = todayKey; dates.has(day); day = nextDay(day)) runway += 1;

  // Days between today and the last scheduled board with nothing on them —
  // a queue that resumes after a hole still leaves dark days in between.
  const gaps = [];
  if (last !== null && last > todayKey) {
    for (let day = todayKey; day <= last; day = nextDay(day)) {
      if (!dates.has(day)) gaps.push(day);
    }
  }

  return {
    today: entries.find((entry) => entry.date === todayKey) ?? null,
    lastScheduled: last,
    queuedAhead: entries.filter((entry) => entry.date > todayKey).length,
    runway,
    gaps,
    datelessSlugs,
  };
}

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
