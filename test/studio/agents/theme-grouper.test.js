// Theme Grouper semantics.
//
// The one thing downstream cannot recover from is too few sets: the Board
// Builder needs four, and no amount of rebuilding invents a fifth candidate.
// So the shortfall is caught here, where a retry can still fix it by
// reconsidering the pairs that were set aside — rather than at the gate,
// where a retry can only re-roll (2026-08-03: a run reached the builder with
// three sets and paid for three xhigh attempts to learn it).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as themeGrouper from '../../../studio/agents/theme-grouper.js';

const set = (id, pairs) => ({
  id,
  relationshipLabel: `label ${id}`,
  shape: 'transformation',
  pairs,
});

const fourSets = () => ({
  sets: [
    set('set-a', [['Seed', 'Tree'], ['Spark', 'Fire']]),
    set('set-b', [['Brush', 'Painter'], ['Chisel', 'Sculptor']]),
    set('set-c', [['Nest', 'Bird'], ['Den', 'Bear']]),
    set('set-d', [['Dough', 'Bread'], ['Clay', 'Pottery']]),
  ],
});

test('four coherent sets validate', () => {
  assert.equal(themeGrouper.validateOutput(fourSets()).ok, true);
});

test('three sets are rejected — the board builder needs four and cannot make one up', () => {
  const output = { sets: fourSets().sets.slice(0, 3) };
  const result = themeGrouper.validateOutput(output);
  assert.equal(result.ok, false);
  const message = result.errors.map((e) => e.message).join(' ');
  assert.match(message, /3/, 'the shortfall is not quantified');
  assert.match(message, /four|4/i);
});

test('more than four sets is fine — the builder wants a choice', () => {
  const output = {
    sets: fourSets().sets.concat([set('set-e', [['Coal', 'Diamond'], ['Sand', 'Glass']])]),
  };
  assert.equal(themeGrouper.validateOutput(output).ok, true);
});

test('the rejection tells the model where to find more sets', () => {
  const prompt = themeGrouper.buildPrompt(
    { pairs: [{ a: 'Seed', b: 'Tree', relationshipLabel: 'grows into', shape: 'transformation' }] },
    {},
  );
  assert.match(prompt, /at least four/i, 'the four-set floor is not stated as a requirement');
});
