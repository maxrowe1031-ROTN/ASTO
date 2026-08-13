import test from 'node:test';
import assert from 'node:assert/strict';

import { renderReport } from '../../tools/ratings-report.js';

const board = (slug, { delight = 3, fairness = 3, comments = [] } = {}) => ({
  slug,
  players: 2,
  winRate: 0.5,
  ratings: {
    difficulty: { count: 2, average: 2.5 },
    delight: { count: 2, average: delight },
    fairness: { count: 2, average: fairness }
  },
  comments
});

test('boards print highest delight first', () => {
  const text = renderReport([board('meh', { delight: 1.5 }), board('beloved', { delight: 4 })]);
  assert.ok(text.indexOf('beloved') < text.indexOf('meh'));
});

test('a board averaging under 2.5 fairness is called out', () => {
  const text = renderReport([board('suspect', { fairness: 2 })]);
  assert.match(text, /suspect[\s\S]*fairness/i);
  assert.match(text, /2\.0/);
});

test('a fair board is not flagged', () => {
  const text = renderReport([board('fine', { fairness: 3.5 })]);
  assert.doesNotMatch(text, /flag/i);
});

test('comments print under their board', () => {
  const text = renderReport([
    board('chatty', { comments: [{ note: 'lovely puzzle', won: true, createdAt: 'x' }] })
  ]);
  assert.ok(text.indexOf('chatty') < text.indexOf('lovely puzzle'));
});

test('no data says so plainly instead of printing an empty table', () => {
  assert.match(renderReport([]), /no player ratings yet/i);
});

test('a question nobody answered prints a dash, not NaN', () => {
  const empty = {
    slug: 'quiet',
    players: 0,
    winRate: null,
    ratings: {
      difficulty: { count: 0, average: null },
      delight: { count: 0, average: null },
      fairness: { count: 0, average: null }
    },
    comments: [{ note: 'only a comment', won: null, createdAt: 'x' }]
  };
  const text = renderReport([empty]);
  assert.doesNotMatch(text, /NaN/);
  assert.match(text, /only a comment/);
});
