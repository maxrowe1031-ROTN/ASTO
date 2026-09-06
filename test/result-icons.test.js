import test from 'node:test';
import assert from 'node:assert/strict';

import { BOOK, badgeFor, iconFor, CUP_STEAMING } from '../src/view/result-icons.js';

// The third mark on a cup (D-33): pose says how it ended, colour says whether
// the hint was taken, the book says definitions were looked up.
test('badgeFor returns the book only for a learning result', () => {
  assert.equal(badgeFor(null), '');
  assert.equal(badgeFor({ status: 'won', hintsUsed: 0 }), '');
  assert.equal(badgeFor({ status: 'won', hintsUsed: 1 }), '');
  assert.equal(badgeFor({ status: 'lost', learning: true }), BOOK);
});

test('the book is a hidden-from-AT svg wearing the badge class, and leaves the cup alone', () => {
  assert.match(BOOK, /class="result-badge"/);
  assert.match(BOOK, /aria-hidden="true"/);
  assert.equal(iconFor({ status: 'won', learning: true }), CUP_STEAMING);
});
