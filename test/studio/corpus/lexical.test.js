// Self-matching pairs: the property Max spotted and the pipeline could not see.
//
// Every example here is from the real corpus, and the boundary cases are the
// point. The detector is conservative on purpose: it answers "do these share
// visible text", never "is this relationship symmetric" — that is D-9's axis,
// and conflating them would flag half the good boards.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  selfMatchingBySet,
  selfMatchingCount,
  selfMatchingPair,
} from '../../../studio/corpus/lexical.js';

// --- what it catches ---

test('a shared word makes a pair match itself — the case Max named', () => {
  // "i keep seeing puzzles that include something really easy like
  // 'fade in : fade out'" — 2026-08-08, on the music board.
  assert.equal(selfMatchingPair('fade in', 'fade out'), true);
  assert.equal(selfMatchingPair('fade-in', 'fade-out'), true);
  assert.equal(selfMatchingPair('load-in', 'load-out'), true);
});

test('containment counts too — the black he called out on bbq', () => {
  // "This puzzle is way to easy for a black… wrap and unwrap are even more
  // easily recognizable as opposites."
  assert.equal(selfMatchingPair('wrap', 'unwrap'), true);
  assert.equal(selfMatchingPair('seal', 'unseal'), true);
});

test('a shared word inside a longer phrase still matches', () => {
  assert.equal(selfMatchingPair('opening credits', 'closing credits'), true);
  assert.equal(selfMatchingPair('Chunin Exam Prelims', 'Chunin Exam Finals'), true);
});

test('case and punctuation do not hide it', () => {
  assert.equal(selfMatchingPair('Fade In', 'FADE OUT'), true);
  assert.equal(selfMatchingPair("fade in,", 'fade out.'), true);
});

// --- what it deliberately leaves alone ---

test('a shared three-letter stem is a shared SUBJECT, not a shared word', () => {
  // sunrise/sunset is on two published boards and Max has never once
  // complained about it: the player still has to read the relationship. Four
  // characters is where "same word" starts and "same topic" stops.
  assert.equal(selfMatchingPair('sunrise', 'sunset'), false);
});

test('semantic opposites that share no text are not this module\'s business', () => {
  // Perfectly symmetric, and invisible to a player scanning tiles. D-9 owns
  // this axis; flagging it here would double-count and flag good boards.
  assert.equal(selfMatchingPair('ignite', 'extinguish'), false);
  assert.equal(selfMatchingPair('kindling', 'embers'), false);
  assert.equal(selfMatchingPair('enrollment', 'graduation'), false);
});

test('ordinary strong pairs stay silent', () => {
  assert.equal(selfMatchingPair('Seed', 'Tree'), false);
  assert.equal(selfMatchingPair('poppy', 'remembrance'), false);
  assert.equal(selfMatchingPair('greenlight', 'wrap'), false);
  assert.equal(selfMatchingPair('stunt double', 'injury'), false);
});

test('short shared fragments do not trip it', () => {
  // "on" is shared and meaningless; a three-letter containment likewise.
  assert.equal(selfMatchingPair('on stage', 'on call'), false);
  assert.equal(selfMatchingPair('ear', 'earth'), false);
});

test('empty and identical terms are not self-matching', () => {
  // A set cannot use the same word twice — that is a different defect, and
  // the schema already refuses it.
  assert.equal(selfMatchingPair('wrap', 'wrap'), false);
  assert.equal(selfMatchingPair('', 'wrap'), false);
  assert.equal(selfMatchingPair(null, undefined), false);
});

// --- counting a set: the three tiers Max's verdicts imply ---

const set = (id, pairs) => ({ id, pairs });

test('one self-matching pair is an on-ramp — the cinema set he praised', () => {
  // "This puzzle should be studied." The second pair reaches from watching a
  // film to making one, so the relationship still has to be seen.
  const cinema = set('set-before-after', [
    ['opening credits', 'closing credits'],
    ['greenlight', 'wrap'],
  ]);
  assert.equal(selfMatchingCount(cinema), 1);
});

test('both pairs self-matching makes the set free — the music Yellow', () => {
  const music = set('set-bookend-live', [
    ['load-in', 'load-out'],
    ['fade-in', 'fade-out'],
  ]);
  assert.equal(selfMatchingCount(music), 2);
});

test('a set with nothing lexical to see counts zero', () => {
  assert.equal(selfMatchingCount(set('set-growth', [['Seed', 'Tree'], ['Spark', 'Fire']])), 0);
  assert.equal(selfMatchingCount({}), 0);
  assert.equal(selfMatchingCount(undefined), 0);
});

test('a board reports only the sets with something to say', () => {
  const bySet = selfMatchingBySet([
    set('set-growth', [['Seed', 'Tree'], ['Spark', 'Fire']]),
    set('set-bookend-live', [['load-in', 'load-out'], ['fade-in', 'fade-out']]),
    set('set-before-after', [['opening credits', 'closing credits'], ['greenlight', 'wrap']]),
  ]);
  // Silence for the clean set: a card annotated on every row teaches nothing.
  assert.deepEqual(bySet, { 'set-bookend-live': 2, 'set-before-after': 1 });
});
