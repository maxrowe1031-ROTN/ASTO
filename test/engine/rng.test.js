import test from 'node:test';
import assert from 'node:assert/strict';

import { fisherYates, mulberry32 } from '../../src/engine/rng.js';

const ITEMS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

test('fisherYates returns a true permutation — same members, new array', () => {
  const shuffled = fisherYates(ITEMS, mulberry32(1));
  assert.equal(shuffled.length, ITEMS.length);
  assert.deepEqual([...shuffled].sort(), [...ITEMS].sort());
  assert.notEqual(shuffled, ITEMS);
});

test('fisherYates does not mutate its input', () => {
  const items = [...ITEMS];
  fisherYates(items, mulberry32(7));
  assert.deepEqual(items, ITEMS);
});

test('the same seed produces the same shuffle', () => {
  assert.deepEqual(fisherYates(ITEMS, mulberry32(42)), fisherYates(ITEMS, mulberry32(42)));
});

test('different seeds produce different shuffles', () => {
  const a = fisherYates(ITEMS, mulberry32(1));
  const b = fisherYates(ITEMS, mulberry32(2));
  assert.notDeepEqual(a, b);
});

test('fisherYates requires an injected rand — no hidden Math.random', () => {
  assert.throws(() => fisherYates(ITEMS), TypeError);
  assert.throws(() => fisherYates(ITEMS, 0.5), TypeError);
});

test('fisherYates handles empty and single-item arrays', () => {
  assert.deepEqual(fisherYates([], mulberry32(1)), []);
  assert.deepEqual(fisherYates(['only'], mulberry32(1)), ['only']);
});

test('mulberry32 yields deterministic values in [0, 1)', () => {
  const rand = mulberry32(123);
  const values = Array.from({ length: 200 }, () => rand());
  for (const v of values) {
    assert.ok(v >= 0 && v < 1, `${v} out of range`);
  }
  const again = mulberry32(123);
  assert.deepEqual(values, Array.from({ length: 200 }, () => again()));
});
