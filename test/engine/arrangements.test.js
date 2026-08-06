import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acceptedOrders,
  canonicalOrder,
  crossPairings,
  deriveWords
} from '../../src/engine/arrangements.js';

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

// --- crossPairings ---
//
// The other way to group a set's own four words. `acceptedOrders` says which
// readings the engine takes; this says which readings it REFUSES while a human
// might still find them convincing — the gap board-integrity.js names in its
// own header and says only playtest eyes can close (design.md risk 1).
//
// It fired three times in Max's 2026-08-05 batch, twice as an outright
// fairness bug: a player who sees the refused reading is marked wrong.

test('crossPairings returns the two other ways to group the same four words', () => {
  assert.deepEqual(crossPairings(PAIRS), [
    ['Seed', 'Spark', 'Tree', 'Fire'], // A : C :: B : D
    ['Seed', 'Fire', 'Tree', 'Spark']  // A : D :: B : C
  ]);
});

// Two, not twenty-four. The other rearrangements of four words are the same
// two CLAIMS read backwards or with the halves swapped — and the engine already
// treats those as equivalent, so asking about them twice would just be noise in
// a checklist a model has to answer.
test('crossPairings is exactly the groupings, not every rearrangement', () => {
  const readings = crossPairings(PAIRS);
  assert.equal(readings.length, 2);
  for (const reading of readings) {
    assert.equal(new Set(reading).size, 4, 'a reading must use all four words once');
  }
});

test('no cross-pairing is ever an accepted order — they are disjoint by construction', () => {
  const accepted = new Set(acceptedOrders(PAIRS).map((o) => o.join('|')));
  for (const reading of crossPairings(PAIRS)) {
    assert.ok(!accepted.has(reading.join('|')), `${reading.join(' ')} is accepted after all`);
  }
});

// The real defects, kept as fixtures so the enumerator keeps producing the
// exact strings Max wrote out by hand.
test('it produces the reading Max found in the cars board', () => {
  // "Ignition:departure::shutdown:arrival creates a valid analogy as well,
  //  which means this puzzle needs a revision." — 2026-08-05
  const readings = crossPairings([['ignition', 'shutdown'], ['departure', 'arrival']]);
  assert.deepEqual(readings[0], ['ignition', 'departure', 'shutdown', 'arrival']);
});

test('it produces the reading Max found in the Grateful Dead board', () => {
  // "if you reordered this analogy as formation:first show::Disbandment:last
  //  show, it still works, so this puzzle is invalid." — 2026-08-05
  const readings = crossPairings([['formation', 'disbandment'], ['first show', 'last show']]);
  assert.deepEqual(readings[0], ['formation', 'first show', 'disbandment', 'last show']);
});

// The enumerator is deliberately blind to whether a reading is any GOOD — that
// judgement is 06's. This set uses the same before/after stance as the two
// above and Max loved it ("I felt especially good about this one"), because its
// cross-reading is weak, not because it has none. Enumerating is mechanical;
// only the asking is semantic.
test('it enumerates for a good set too — validity is not its question', () => {
  const readings = crossPairings([['planting', 'felling'], ['budding', 'withering']]);
  assert.equal(readings.length, 2);
  assert.deepEqual(readings[0], ['planting', 'budding', 'felling', 'withering']);
});

test('crossPairings does not mutate its input, and rejects malformed pairs', () => {
  const pairs = [['Seed', 'Tree'], ['Spark', 'Fire']];
  crossPairings(pairs);
  assert.deepEqual(pairs, [['Seed', 'Tree'], ['Spark', 'Fire']]);
  assert.throws(() => crossPairings(null), TypeError);
  assert.throws(() => crossPairings([['A', 'B']]), TypeError);
});
