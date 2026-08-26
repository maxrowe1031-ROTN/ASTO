// The motion module's pure half, tested headlessly. Importing it in node is itself an
// assertion (no DOM at import time — the confetti bar), and the entrance math must hold
// its two promises without a browser: reading order, and a total under the cap.

import test from 'node:test';
import assert from 'node:assert/strict';

import { entranceDelays, prefersReducedMotion, staggerStep } from '../src/view/motion.js';
import { isFreshBoard } from '../src/view/board-view.js';

// The node fallbacks for the two dials in tokens.css. The real values are read from
// the stylesheet in a browser; headless tests pin the fallbacks so a drift between the
// two files fails loudly here.
const FAST_MS = 187;
const ENTRANCE_TOTAL_MS = 400;
const ENTRANCE_CAP_MS = 600; // the polish brief's hard ceiling

test('the module is import-safe with no DOM', () => {
  assert.equal(prefersReducedMotion(), false);
  assert.ok(staggerStep() > 0);
});

test('entranceDelays: reading order, first tile immediate', () => {
  const delays = entranceDelays(16);
  assert.equal(delays.length, 16);
  assert.equal(delays[0], 0);
  for (let i = 1; i < delays.length; i += 1) {
    assert.ok(delays[i] >= delays[i - 1], `delay ${i} keeps reading order`);
  }
});

test('entranceDelays: the last tile finishes inside the target, under the cap', () => {
  const delays = entranceDelays(16);
  const lastFinish = delays.at(-1) + FAST_MS;
  assert.ok(lastFinish <= ENTRANCE_TOTAL_MS + 1, `~400ms target (got ${lastFinish})`);
  assert.ok(lastFinish < ENTRANCE_CAP_MS, 'the 600ms ceiling holds');
});

test('entranceDelays: degenerate counts never divide by zero', () => {
  assert.deepEqual(entranceDelays(0), []);
  assert.deepEqual(entranceDelays(1), [0]);
  assert.deepEqual(entranceDelays(-3), []);
});

test('entranceDelays: a tile slower than the budget still starts everyone at 0, never negative', () => {
  const delays = entranceDelays(4, { tileMs: 500, totalMs: 400 });
  for (const delay of delays) assert.ok(delay >= 0);
});

test('isFreshBoard: entrance plays exactly when the whole board was born this pass', () => {
  const scenarios = [
    { created: 16, board: 16, fresh: true, why: 'first load / loadPuzzle swap / post-win restart' },
    { created: 0, board: 16, fresh: false, why: 'resume-repaint — nodes persisted' },
    { created: 8, board: 16, fresh: false, why: 'post-loss restart recreates only solved tiles' },
    { created: 0, board: 0, fresh: false, why: 'empty board is never an entrance' },
    { created: 12, board: 12, fresh: true, why: 'the predicate follows the board, not the number 16' }
  ];
  for (const { created, board, fresh, why } of scenarios) {
    assert.equal(isFreshBoard(created, board), fresh, why);
  }
});
