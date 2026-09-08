// plays-summary.js — the play counter's arithmetic (D-34). Pure: rows in, readings out.
//
// The network lives in player-ratings.js and the words in tools/plays-report.js, so this
// is testable the way the engine is. Days are keyed in the game's one timezone
// (src/source/release.js, D-24) — a play at 21:30 in Denver is that day's play, not the
// next UTC day's.
//
// Two readings this exists for, both from the Brain's honest-feedback-sources: completion
// (finishes over starts — did people who opened a board see it through?) and return
// (browsers seen on two or more distinct days — did anyone come back?).

import { dateKeyFor } from '../src/source/release.js';

const WINDOW_DAYS = 14;

/** '2026-09-08', -3 → '2026-09-05'. UTC math on calendar keys, as everywhere. */
function shiftDay(dateKey, by) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + by)).toISOString().slice(0, 10);
}

/** A rate, capped at 1: a reload onto an end screen can post a second finish. */
function rate(finishes, starts) {
  return starts === 0 ? null : Math.min(1, finishes / starts);
}

/**
 * @param {object[]} rows  raw `plays` rows: { created_at, puzzle_slug, event, won, client_id, … }
 * @param {{ today: string, days?: number }} options  `today` is the game's date key
 * @returns {{ days, totals, boards }}
 */
export function summarizePlays(rows, { today, days = WINDOW_DAYS }) {
  const byDay = new Map();
  for (let i = days - 1; i >= 0; i -= 1) {
    byDay.set(shiftDay(today, -i), { starts: 0, finishes: 0 });
  }

  const totals = { starts: 0, finishes: 0 };
  const daysByClient = new Map();
  const boards = new Map();

  for (const row of rows) {
    const key = row.event === 'finish' ? 'finishes' : 'starts';
    totals[key] += 1;

    const day = dateKeyFor(new Date(row.created_at));
    const inWindow = byDay.get(day);
    if (inWindow) inWindow[key] += 1;

    if (row.client_id) {
      if (!daysByClient.has(row.client_id)) daysByClient.set(row.client_id, new Set());
      daysByClient.get(row.client_id).add(day);
    }

    if (!boards.has(row.puzzle_slug)) boards.set(row.puzzle_slug, { starts: 0, finishes: 0, wins: 0 });
    const board = boards.get(row.puzzle_slug);
    board[key] += 1;
    if (row.event === 'finish' && row.won === true) board.wins += 1;
  }

  return {
    days: [...byDay.entries()].map(([date, { starts, finishes }]) => ({
      date,
      starts,
      finishes,
      completionRate: rate(finishes, starts)
    })),
    totals: {
      starts: totals.starts,
      finishes: totals.finishes,
      completionRate: rate(totals.finishes, totals.starts),
      clients: daysByClient.size,
      returningClients: [...daysByClient.values()].filter((set) => set.size >= 2).length
    },
    boards: [...boards.entries()]
      .map(([slug, counts]) => ({ slug, ...counts }))
      .sort((a, b) => b.starts - a.starts || a.slug.localeCompare(b.slug))
  };
}
