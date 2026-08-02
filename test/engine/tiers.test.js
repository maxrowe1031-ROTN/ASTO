import test from 'node:test';
import assert from 'node:assert/strict';

import { TIERS, difficultyToTier } from '../../src/engine/tiers.js';

test('difficulty 1-4 maps onto the four tiers in order', () => {
  assert.equal(difficultyToTier(1), 'green');
  assert.equal(difficultyToTier(2), 'yellow');
  assert.equal(difficultyToTier(3), 'red');
  assert.equal(difficultyToTier(4), 'black');
});

test('TIERS is the canonical tier order', () => {
  assert.deepEqual(TIERS, ['green', 'yellow', 'red', 'black']);
});

test('difficultyToTier rejects anything outside 1-4', () => {
  assert.throws(() => difficultyToTier(0), RangeError);
  assert.throws(() => difficultyToTier(5), RangeError);
  assert.throws(() => difficultyToTier(2.5), RangeError);
  assert.throws(() => difficultyToTier('1'), RangeError);
  assert.throws(() => difficultyToTier(undefined), RangeError);
});
