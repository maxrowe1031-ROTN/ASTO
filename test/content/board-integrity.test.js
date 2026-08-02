import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { checkBoard } from '../../src/engine/board-integrity.js';
import { validatePuzzle } from '../../src/source/validate-puzzle.js';
import { board } from '../fixtures/board.js';

const PUZZLES = join(import.meta.dirname, '..', '..', 'puzzles');

test('a clean board accepts exactly sixteen ordered tuples and nothing else', () => {
  const report = checkBoard(board);
  assert.equal(report.tuplesChecked, 43_680); // 16 · 15 · 14 · 13
  assert.equal(report.acceptedCount, 16); // 4 orders × 4 sets
  assert.deepEqual(report.collisions, []);
  assert.deepEqual(report.duplicateWords, []);
  assert.equal(report.ok, true);
});

test('every accepted tuple is attributed to exactly one set', () => {
  const report = checkBoard(board);
  for (const entry of report.accepted) {
    assert.equal(entry.setIds.length, 1, `${entry.order.join(' ')} matched ${entry.setIds}`);
  }
  const perSet = new Map();
  for (const entry of report.accepted) {
    perSet.set(entry.setIds[0], (perSet.get(entry.setIds[0]) ?? 0) + 1);
  }
  assert.equal(perSet.size, 4);
  for (const count of perSet.values()) assert.equal(count, 4);
});

test('near-miss orderings are counted — twenty per set, each one costs a mistake', () => {
  // 4! = 24 orderings of a set's four words; 4 are accepted, so 20 land on "So close!".
  assert.equal(checkBoard(board).soCloseCount, 80);
});

test('a board whose sets share a word is reported, not quietly tolerated', () => {
  const rigged = structuredClone(board);
  rigged.sets[3].pairs[1][1] = 'Fire'; // already used by set-growth
  const report = checkBoard(rigged);
  assert.deepEqual(report.duplicateWords, ['Fire']);
  assert.equal(report.ok, false);
});

test('checkBoard measures the real engine, so a widened acceptance surface shows up', () => {
  // Not a tautology: acceptance is sampled through engine.submit(). If a future change
  // ever sorted a submission, this count would balloon far past 16 and fail here.
  const report = checkBoard(board);
  assert.equal(report.acceptedCount, report.expectedAccepted);
});

test('every shipped board in puzzles/ is valid and clean', () => {
  const files = readdirSync(PUZZLES).filter((f) => f.endsWith('.json') && f !== 'index.json');
  assert.ok(files.length > 0, 'expected at least one board in puzzles/');

  for (const file of files) {
    const puzzle = JSON.parse(readFileSync(join(PUZZLES, file), 'utf8'));

    const validation = validatePuzzle(puzzle);
    assert.equal(
      validation.ok,
      true,
      `${file} failed schema v1.0:\n${validation.errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`
    );

    const report = checkBoard(puzzle);
    assert.equal(report.acceptedCount, 16, `${file} accepts ${report.acceptedCount} tuples, expected 16`);
    assert.deepEqual(report.collisions, [], `${file} has colliding tuples`);
    assert.equal(report.ok, true, `${file} failed integrity`);
  }
});
