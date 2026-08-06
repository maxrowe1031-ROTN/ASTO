// Symmetric shapes — the order-fairness vocabulary (design.md D-9, 2026-08-06).
//
// A shape is symmetric when its A→B relation IS its B→A relation, so nothing
// about the RELATIONSHIP tells a player which word the author put first. The
// engine accepts a flip only when both pairs flip together, so a symmetric set
// asks the player to guess an orientation and mirror it — and charges a mistake
// for guessing wrong. That is what cost Max all four mistakes on the Yankees
// board: every one was so-close, and he never grouped the wrong four words.
//
// The list is pinned here because it is a judgement about meaning, not a
// derivation. Growing it silently would widen a report Max reads; shrinking it
// silently would hide the defect it exists to name.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SHAPES,
  SYMMETRIC_SHAPES,
  isSymmetric,
  symmetricNote,
} from '../../../studio/corpus/vocabulary.js';

test('exactly four shapes are symmetric, and these are they', () => {
  assert.deepEqual([...SYMMETRIC_SHAPES].sort(), [
    'contiguity',
    'coordinates',
    'directional',
    'synonymity',
  ]);
});

// Each of the four, with the reason stated as the test's name — so a future
// reader disagreeing with one knows which claim to argue with.
test('coordinates is symmetric — ram : ewe reads the same as ewe : ram', () => {
  assert.equal(isSymmetric('coordinates'), true);
});

test('synonymity is symmetric — two names for one thing name it mutually', () => {
  assert.equal(isSymmetric('synonymity'), true);
});

test('directional is symmetric — an axis has two ends, not a start', () => {
  assert.equal(isSymmetric('directional'), true);
});

test('contiguity is symmetric — touching is mutual by definition', () => {
  assert.equal(isSymmetric('contiguity'), true);
});

// The near misses. Each of these was considered and rejected, and each would
// produce false flags on boards that are perfectly fair.
test('before-after is NOT symmetric — the arrow of time settles the order', () => {
  // dawn : dusk. A player never wonders which end leads, which is exactly why
  // `medicine`'s before-after set drew no flag on a board Max called his best.
  assert.equal(isSymmetric('before-after'), false);
});

test('reverse is NOT symmetric — "undoes" carries a direction', () => {
  // attack : defend. Defending answers an attack; the reverse reads as a
  // different claim, so a player has something to go on.
  assert.equal(isSymmetric('reverse'), false);
});

test('dimensional-similarity is NOT symmetric — it is explicitly smaller then larger', () => {
  assert.equal(isSymmetric('dimensional-similarity'), false);
});

test('unknown and non-string shapes are not symmetric rather than throwing', () => {
  assert.equal(isSymmetric('no-such-shape'), false);
  assert.equal(isSymmetric(null), false);
  assert.equal(isSymmetric(undefined), false);
  assert.equal(isSymmetric(42), false);
});

test('every symmetric shape carries a note, and no other shape does', () => {
  for (const shape of SHAPES) {
    const symmetric = SYMMETRIC_SHAPES.includes(shape.id);
    assert.equal(
      typeof symmetricNote(shape.id) === 'string' && symmetricNote(shape.id).length > 0,
      symmetric,
      `${shape.id} note presence should match symmetric=${symmetric}`,
    );
  }
});

test('the flag follows legacy aliases, so old boards stay countable', () => {
  // resolveShape's whole job. A board authored under the retired 13-shape list
  // must not silently lose its flag because the id was renamed.
  assert.equal(isSymmetric('COORDINATES'), true);
  assert.equal(isSymmetric('  coordinates  '), true);
});
