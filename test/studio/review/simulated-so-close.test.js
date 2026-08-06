// The test player's own so-close rate (design.md D-9, 2026-08-06).
//
// Pure arithmetic over an artifact 07 already produces, and the machine analog
// of the statistic that started all of this: across 13 recorded playthroughs
// Max has never won, and on the four boards where he reached three sets, most
// or all of his mistakes were "So close!" — right four words, wrong order. On
// Yankees it was four out of four; he never grouped the wrong words once.
//
// The number is expected to be LOW where a human's is high, because a model
// does not experience a coin flip — it picks an order and explains it. That
// gap is the point: the count is shown beside Max's real one so the model's
// clean solve can be compared rather than believed.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { simulatedSoClose } from '../../../studio/review/ui/so-close.js';

// The real published board, and its real Black.
const BOARD = {
  id: 'board-yankees-baseball',
  title: 'Yankees Baseball',
  sets: [
    { id: 'set-beforeafter', relationshipLabel: 'b', explanation: 'e', difficulty: 2,
      pairs: [['Opening Day', 'World Series'], ['Rookie season', 'retirement']] },
    { id: 'set-coordinates', relationshipLabel: 'c', explanation: 'e', difficulty: 4,
      pairs: [['Ruth', 'Gehrig'], ['Mantle', 'Maris']] },
  ],
};

const report = (submissions) => ({
  trials: [{ submissions: submissions.map((words) => ({ words, confidence: 0.6 })), mistakes: 0, solved: true, reasoning: 'r' }],
});

test('the intended order is not so-close', () => {
  const result = simulatedSoClose(BOARD, report([['Ruth', 'Gehrig', 'Mantle', 'Maris']]));
  assert.deepEqual(result, { soClose: 0, submissions: 1 });
});

test('flipping BOTH halves is accepted, so it is not so-close either', () => {
  // The engine takes [B,A,D,C]. A player who reverses consistently is never
  // punished, which is exactly why the defect is about INCONSISTENCY.
  const result = simulatedSoClose(BOARD, report([['Gehrig', 'Ruth', 'Maris', 'Mantle']]));
  assert.equal(result.soClose, 0);
});

test('flipping ONE half is so-close — the mistake charged for having the answer', () => {
  const result = simulatedSoClose(BOARD, report([['Gehrig', 'Ruth', 'Mantle', 'Maris']]));
  assert.deepEqual(result, { soClose: 1, submissions: 1 });
});

test('swapping which half leads is accepted', () => {
  const result = simulatedSoClose(BOARD, report([['Mantle', 'Maris', 'Ruth', 'Gehrig']]));
  assert.equal(result.soClose, 0);
});

test('four words that are not one set are a wrong grouping, not so-close', () => {
  // The distinction the whole statistic rests on: this is a player who does not
  // know the answer, which is a different failure from one who does.
  const result = simulatedSoClose(BOARD, report([['Ruth', 'Gehrig', 'Opening Day', 'World Series']]));
  assert.deepEqual(result, { soClose: 0, submissions: 1 });
});

test('it counts across a whole trial, and across sets', () => {
  const result = simulatedSoClose(
    BOARD,
    report([
      ['Ruth', 'Gehrig', 'Mantle', 'Maris'],
      ['Gehrig', 'Ruth', 'Mantle', 'Maris'],
      ['World Series', 'Opening Day', 'Rookie season', 'retirement'],
      ['Ruth', 'Gehrig', 'Opening Day', 'World Series'],
    ]),
  );
  assert.deepEqual(result, { soClose: 2, submissions: 4 });
});

test('a missing or empty report is zero, not a crash', () => {
  assert.deepEqual(simulatedSoClose(BOARD, undefined), { soClose: 0, submissions: 0 });
  assert.deepEqual(simulatedSoClose(BOARD, { trials: [] }), { soClose: 0, submissions: 0 });
  assert.deepEqual(simulatedSoClose(null, report([['a', 'b', 'c', 'd']])), { soClose: 0, submissions: 1 });
});

test('a malformed submission is skipped rather than counted', () => {
  const result = simulatedSoClose(BOARD, { trials: [{ submissions: [{ words: ['Ruth'] }], mistakes: 0, solved: true, reasoning: 'r' }] });
  assert.deepEqual(result, { soClose: 0, submissions: 0 });
});
