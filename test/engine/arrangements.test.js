import test from 'node:test';
import assert from 'node:assert/strict';

import { acceptedOrders, canonicalOrder, deriveWords } from '../../src/engine/arrangements.js';

const PAIRS = [['Seed', 'Tree'], ['Spark', 'Fire']];

test('acceptedOrders returns exactly the four documented orders, in order', () => {
  assert.deepEqual(acceptedOrders(PAIRS), [
    ['Seed', 'Tree', 'Spark', 'Fire'],
    ['Spark', 'Fire', 'Seed', 'Tree'],
    ['Tree', 'Seed', 'Fire', 'Spark'],
    ['Fire', 'Spark', 'Tree', 'Seed']
  ]);
});

test('acceptedOrders returns four distinct orders of four terms', () => {
  const orders = acceptedOrders(PAIRS);
  assert.equal(orders.length, 4);
  for (const order of orders) assert.equal(order.length, 4);
  assert.equal(new Set(orders.map((o) => o.join('|'))).size, 4);
});

test('acceptedOrders does NOT accept cross-pair arrangements', () => {
  const keys = acceptedOrders(PAIRS).map((o) => o.join('|'));
  // A : C :: B : D — the classic wrong reading. GDD §7.3 says never accept it.
  assert.ok(!keys.includes(['Seed', 'Spark', 'Tree', 'Fire'].join('|')));
  // A few more rearrangements of the same four words that must stay rejected.
  assert.ok(!keys.includes(['Tree', 'Fire', 'Seed', 'Spark'].join('|')));
  assert.ok(!keys.includes(['Seed', 'Tree', 'Fire', 'Spark'].join('|')));
});

test('acceptedOrders does not mutate its input', () => {
  const pairs = [['Seed', 'Tree'], ['Spark', 'Fire']];
  acceptedOrders(pairs);
  assert.deepEqual(pairs, [['Seed', 'Tree'], ['Spark', 'Fire']]);
});

test('acceptedOrders rejects malformed pairs', () => {
  assert.throws(() => acceptedOrders(null), TypeError);
  assert.throws(() => acceptedOrders([['A', 'B']]), TypeError);
  assert.throws(() => acceptedOrders([['A', 'B'], ['C', 'D'], ['E', 'F']]), TypeError);
  assert.throws(() => acceptedOrders([['A', 'B'], ['C']]), TypeError);
});

test('canonicalOrder is the stored order — what the solved card displays', () => {
  assert.deepEqual(canonicalOrder(PAIRS), ['Seed', 'Tree', 'Spark', 'Fire']);
  assert.deepEqual(canonicalOrder(PAIRS), acceptedOrders(PAIRS)[0]);
});

test('deriveWords flattens every set in set order, pair order', () => {
  const sets = [
    { pairs: [['Seed', 'Tree'], ['Spark', 'Fire']] },
    { pairs: [['Brush', 'Painter'], ['Chisel', 'Sculptor']] }
  ];
  assert.deepEqual(deriveWords(sets), [
    'Seed', 'Tree', 'Spark', 'Fire',
    'Brush', 'Painter', 'Chisel', 'Sculptor'
  ]);
});

test('deriveWords on a full board yields 16 words', () => {
  const sets = [
    { pairs: [['Seed', 'Tree'], ['Spark', 'Fire']] },
    { pairs: [['Brush', 'Painter'], ['Chisel', 'Sculptor']] },
    { pairs: [['Nest', 'Bird'], ['Den', 'Bear']] },
    { pairs: [['Dough', 'Bread'], ['Clay', 'Pottery']] }
  ];
  const words = deriveWords(sets);
  assert.equal(words.length, 16);
  assert.equal(new Set(words).size, 16);
});
