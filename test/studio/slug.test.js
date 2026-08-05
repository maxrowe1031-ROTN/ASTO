// The one derivation of a puzzle's slug, and therefore of its id.
//
// This matters more than its size: the id a board is published under becomes
// the key Phase 5 persists per-puzzle results against. Renaming one later
// orphans saved progress, so what this function returns is effectively
// permanent from the moment Max presses Publish.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { slugify, SLUG } from '../../studio/slug.js';

test('a board title becomes a readable slug', () => {
  assert.equal(slugify('Trees, Tools, and Time'), 'trees-tools-and-time');
  assert.equal(slugify('For the Birds'), 'for-the-birds');
  assert.equal(slugify('By the Shore'), 'by-the-shore');
  assert.equal(slugify('Gotham Connections'), 'gotham-connections');
  // The precedent every published board joins.
  assert.equal(slugify('First Light'), 'first-light');
});

test('accents survive as letters rather than being dropped', () => {
  assert.equal(slugify('Café Terrace'), 'cafe-terrace');
  assert.equal(slugify('Paris, Pièce by Pièce'), 'paris-piece-by-piece');
});

test('punctuation and spacing never leak into a filename', () => {
  assert.equal(slugify('  Spaced   Out  '), 'spaced-out');
  assert.equal(slugify('Rock & Roll!'), 'rock-roll');
  assert.equal(slugify('A/B: the sequel'), 'a-b-the-sequel');
});

// A slug is joined onto a path and put into a `?puzzle=` query. Anything this
// returns has to be safe in both, which is what SLUG guarantees.
test('every slug it returns satisfies the pattern the publisher enforces', () => {
  for (const title of ['Trees, Tools, and Time', 'Café Terrace', '99 Red Balloons', 'A/B: the sequel']) {
    assert.match(slugify(title), SLUG, title);
  }
});

test('a title that slugs to nothing returns null rather than a guess', () => {
  for (const title of ['', '   ', '!!!', '---', null, undefined]) {
    assert.equal(slugify(title), null, JSON.stringify(title));
  }
});

test('a leading digit is fine, a leading hyphen is not', () => {
  assert.equal(slugify('99 Red Balloons'), '99-red-balloons');
  assert.equal(slugify('- Dash first'), 'dash-first');
});

test('a very long title is truncated without leaving a trailing hyphen', () => {
  const slug = slugify(`${'word '.repeat(40)}end`);
  assert.ok(slug.length <= 64, `${slug.length} characters`);
  assert.match(slug, SLUG);
  assert.ok(!slug.endsWith('-'), slug);
});
