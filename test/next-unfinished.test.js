// Which board comes next after a win or a loss.
//
// A pure function of the manifest and the saved results, so it is tested headlessly even
// though it lives beside the view that asks the same question. Importing select-view.js
// in node is safe: it touches the DOM only inside functions, never at module scope.

import test from 'node:test';
import assert from 'node:assert/strict';

import { nextUnfinished } from '../src/view/select-view.js';

const puzzles = ['a', 'b', 'c', 'd'].map((slug) => ({ slug, title: slug.toUpperCase() }));

const won = { status: 'won', mistakes: 1, solvedCount: 4 };
const lost = { status: 'lost', mistakes: 4, solvedCount: 2 };

const next = (results, after) => nextUnfinished(puzzles, results, after)?.slug ?? null;

test('after winning the first board, the next one is offered', () => {
  assert.equal(next({ a: won }, 'a'), 'b');
});

test('boards already won are skipped', () => {
  assert.equal(next({ a: won, b: won, c: won }, 'a'), 'd');
});

// Losing is how you find the board you want another go at, so it stays in the pool —
// but the button should still move you forward rather than hand it straight back.
test('a lost board stays unfinished, but is not what Next offers you', () => {
  assert.equal(next({ b: lost }, 'b'), 'c');
  assert.equal(next({ a: won, b: lost }, 'a'), 'b');
});

test('from the end of the list it wraps back to the first unfinished board', () => {
  assert.equal(next({ a: won, d: won }, 'd'), 'b');
});

test('nothing left unfinished returns null — the caller says "Back to puzzles"', () => {
  const all = { a: won, b: won, c: won, d: won };
  assert.equal(next(all, 'a'), null);
});

// Play again is right there for a retry; Next should not pretend to be it.
test('the only board left being the one just played returns null', () => {
  assert.equal(next({ a: won, b: won, c: won, d: lost }, 'd'), null);
});

test('an empty manifest returns null rather than throwing', () => {
  assert.equal(nextUnfinished([], {}, 'a'), null);
});

test('a slug not in the manifest still yields the first unfinished board', () => {
  assert.equal(next({ a: won }, 'not-a-board'), 'b');
  assert.equal(next({}, null), 'a');
});

test('a result for a board no longer in the manifest is simply ignored', () => {
  assert.equal(next({ retired: won }, null), 'a');
});
