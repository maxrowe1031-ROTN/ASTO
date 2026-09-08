// schedule.js — the publishing queue's arithmetic, shared by the check-schedule
// CLI and the Review Studio's runway panel (D-35). Pure: manifest entries and
// the dateless slugs in, a report out. Nothing here reads a file or a clock.

import { nextDay } from '../src/source/release.js';

/**
 * @param {{slug, title?, id?, date}[]} entries  manifest entries (dated by construction)
 * @param {string[]} datelessSlugs  boards on disk with no date
 * @param {string} todayKey  the game's date key for today
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
    entries: sorted,
  };
}
