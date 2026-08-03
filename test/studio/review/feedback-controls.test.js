// The feedback form's per-set blocks.
//
// Max reads these while judging a board, so each block has to identify its set
// the way he is actually thinking about it: by the analogy, not only by an id
// and a relationship label. Asked for 2026-08-03.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { feedbackControls } from '../../../studio/review/ui/feedback.js';

const BOARD = {
  id: 'asto-first-light',
  title: 'First Light',
  sets: [
    {
      id: 'set-growth',
      relationshipLabel: 'Small origin becomes larger result',
      pairs: [['Seed', 'Tree'], ['Spark', 'Fire']],
      difficulty: 1,
    },
    {
      id: 'set-tools',
      relationshipLabel: 'Tool used by profession',
      pairs: [['Brush', 'Painter'], ['Chisel', 'Sculptor']],
      difficulty: 2,
    },
    {
      id: 'set-homes',
      relationshipLabel: 'Home of animal',
      pairs: [['Nest', 'Bird'], ['Den', 'Bear']],
      difficulty: 3,
    },
    {
      id: 'set-material',
      relationshipLabel: 'Material transformed into finished object',
      pairs: [['Dough', 'Bread'], ['Clay', 'Pottery']],
      difficulty: 4,
    },
  ],
};

test('every set block shows its analogy, not just its id and label', () => {
  const html = feedbackControls(BOARD);
  for (const expected of [
    'Seed : Tree :: Spark : Fire',
    'Brush : Painter :: Chisel : Sculptor',
    'Nest : Bird :: Den : Bear',
    'Dough : Bread :: Clay : Pottery',
  ]) {
    assert.ok(html.includes(expected), `missing analogy: ${expected}`);
  }
});

test('the set id and relationship label are still there', () => {
  const html = feedbackControls(BOARD);
  assert.match(html, /set-growth/);
  assert.match(html, /Small origin becomes larger result/);
});

test('blocks stay in difficulty order, easiest first', () => {
  const html = feedbackControls(BOARD);
  const order = [...html.matchAll(/data-set-id="(set-[a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['set-growth', 'set-tools', 'set-homes', 'set-material']);
});

test('the board-scoped block is still first and carries no set id', () => {
  const html = feedbackControls(BOARD);
  assert.ok(html.indexOf('The board as a whole') < html.indexOf('set-growth'));
});

test('a board with no sets renders the board block alone, without throwing', () => {
  const html = feedbackControls({ sets: [] });
  assert.match(html, /The board as a whole/);
  assert.equal(/data-set-id="set-/.test(html), false);
});
