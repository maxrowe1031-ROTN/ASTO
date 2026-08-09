// Pair Author semantics — above all, that the pool it emits can become a board.
//
// A set is two pairs sharing ONE relationship. A stance is a CATEGORY of
// relationships, so a pool can satisfy a stance quota completely and still be
// ungroupable — which is not hypothetical: it killed the `paris` run on
// 2026-08-05. The pools below are the real ones from three real runs, and the
// check has to sort them the way the pipeline actually experienced them.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as pairAuthor from '../../../studio/agents/pair-author.js';
import { stanceOf } from '../../../studio/corpus/vocabulary.js';

const pair = (a, b, shape) => ({ a, b, relationshipLabel: `${a} to ${b}`, shape });

// --- the three real pools, as authored ------------------------------------

// Grouped in 18s. Seven relationships, every one carried by two pairs.
const A_TREE = [
  pair('wood', 'hardwood', 'taxonomic'),
  pair('root', 'taproot', 'taxonomic'),
  pair('forest', 'tree', 'collection-member'),
  pair('plantation', 'grove', 'collection-member'),
  pair('spring', 'blossom', 'time-activity'),
  pair('autumn', 'leaf-fall', 'time-activity'),
  pair('planting', 'felling', 'before-after'),
  pair('budding', 'withering', 'before-after'),
  pair('lumberjack', 'axe', 'agent-instrument'),
  pair('arborist', 'shears', 'agent-instrument'),
  pair('carpenter', 'furniture', 'agent-object'),
  pair('papermaker', 'paper', 'agent-object'),
  pair('trunk', 'rings', 'object-component'),
  pair('leaf', 'vein', 'object-component'),
];

// Truncated the grouper at 40,000 tokens. Four stances — it passed the old
// check — but eleven relationships used exactly once, so nothing pairs up.
const PARIS = [
  pair('monument', 'Eiffel Tower', 'class-individual'),
  pair('museum', 'Louvre', 'class-individual'),
  pair('river', 'Seine', 'class-individual'),
  pair('Left Bank', 'Right Bank', 'coordinates'),
  pair('Storming of the Bastille', 'French Revolution', 'sequence'),
  pair("Napoleon's coronation", "Napoleon's exile", 'before-after'),
  pair('Bastille Day', 'fireworks', 'time-activity'),
  pair('baker', 'baguette', 'agent-object'),
  pair('painter', 'easel', 'agent-instrument'),
  pair('Moulin Rouge', 'cabaret', 'location-activity'),
  pair('guillotine', 'execute', 'instrument-action'),
  pair('Eiffel Tower', 'iron', 'object-stuff'),
  pair('Notre-Dame', 'gargoyle', 'object-component'),
  pair('beret', 'head', 'attachment'),
];

test('the a-tree pool passes — seven relationships, each carried by two pairs', () => {
  assert.equal(pairAuthor.validateOutput({ pairs: A_TREE }).ok, true);
});

test('the paris pool is rejected — four stances, but nothing pairs up', () => {
  const result = pairAuthor.validateOutput({ pairs: PARIS });
  assert.equal(result.ok, false, 'the pool that truncated the grouper was accepted');
  const message = result.errors.map((e) => e.message).join(' ');
  // Both numbers, so the retry knows which one it missed.
  assert.match(message, /only 1 relationship/);
  assert.match(message, /spanning 1 stance/);
  // And the orphans by name — each is one partner pair away from a set.
  assert.match(message, /coordinates/);
  assert.match(message, /attachment/);
});

test('spanning four stances is not enough on its own — the old check passed paris', () => {
  // The regression this whole check exists for: PARIS spans inclusion, time,
  // event and possession. Counting stances across all pairs says "fine";
  // counting them across MATCHED shapes says "ungroupable".
  const stancesAcrossAllPairs = new Set(PARIS.map((p) => stanceOf(p.shape)));
  assert.equal(stancesAcrossAllPairs.size, 4, 'paris really did span four stances');
  assert.equal(pairAuthor.validateOutput({ pairs: PARIS }).ok, false);
});

test('four matched relationships across four stances is the floor, and it passes', () => {
  const minimal = [
    pair('forest', 'tree', 'collection-member'), // inclusion
    pair('fleet', 'ship', 'collection-member'),
    pair('spring', 'sowing', 'time-activity'), // time
    pair('autumn', 'harvest', 'time-activity'),
    pair('baker', 'bread', 'agent-object'), // event
    pair('tailor', 'suit', 'agent-object'),
    pair('moon', 'crater', 'object-component'), // possession
    pair('comet', 'tail', 'object-component'),
  ];
  assert.equal(pairAuthor.validateOutput({ pairs: minimal }).ok, true);
});

test('four matched relationships in too few stances is rejected', () => {
  // Groupable, but every set would ask the same kind of question — the
  // all-arrowed board Max rejected, caught one stage earlier than the gate.
  const monostance = [
    pair('grape', 'wine', 'conversion'),
    pair('milk', 'cheese', 'conversion'),
    pair('joke', 'laughter', 'cause-effect'),
    pair('foul', 'free throw', 'cause-effect'),
    pair('match', 'candle', 'enabling-agent'),
    pair('key', 'engine', 'enabling-agent'),
    pair('bakery', 'bread', 'location-product'),
    pair('quarry', 'rock', 'location-product'),
  ];
  const result = pairAuthor.validateOutput({ pairs: monostance });
  assert.equal(result.ok, false);
  assert.match(result.errors.map((e) => e.message).join(' '), /spanning 1 stance/);
});

test('the prompt asks for matched twos, not just a stance spread', () => {
  const prompt = pairAuthor.buildPrompt(
    { brief: { count: 14, stanceQuotas: ['inclusion', 'time', 'event', 'possession'] }, theme: 'a tree' },
    {},
  );
  assert.match(prompt, /MATCHED TWOS/);
  assert.match(prompt, /at least two pairs/i);
  assert.match(prompt, /same "shape"/i);
});

// The range requirement runs BOTH ways since 2026-08-09: D-8's arrangement-hard
// floor on the hard end, and the green door on the easy end — added when the
// scout-subject batches measurably stopped producing easy sets (grade-1
// candidates 12 → 4, knowledge-gated words doubled, every playthrough lost).
test('the prompt requires a way in as well as a way up', () => {
  const prompt = pairAuthor.buildPrompt({ brief: { count: 14 }, theme: 'the old apothecary' }, {});
  assert.match(prompt, /hard through its ARRANGEMENT ALONE/);
  assert.match(prompt, /OPEN to a general player on sight/);
  assert.match(prompt, /never reaches the easiest one/);
});

test('a free-text shape is still rejected by the schema', () => {
  const result = pairAuthor.validateOutput({
    pairs: [...A_TREE.slice(0, 13), pair('x', 'y', 'something invented')],
  });
  assert.equal(result.ok, false);
});
