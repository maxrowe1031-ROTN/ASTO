// The revision block, and which agents render it.
//
// `renderRevision` is one shared block rather than three copies because the
// WORDING is the fix: it is what stops a revision returning an entirely new
// board. Three copies would drift, and the drift would be silent — a prompt
// that quietly stopped saying "leave the approved sets alone" looks exactly
// like one that still does.
//
// `revision.test.js` proves the block reaches a real prompt through the
// pipeline. This proves the agents render what they are handed, without a
// store or a run.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderRevision } from '../../../studio/agents/agent-kit.js';
import * as pairAuthor from '../../../studio/agents/pair-author.js';
import * as themeGrouper from '../../../studio/agents/theme-grouper.js';
import * as boardBuilder from '../../../studio/agents/board-builder.js';

const PARENT_BOARD = {
  id: 'asto-bbq',
  title: 'Smoke & Craft',
  sets: [
    { id: 'set-tool-action', relationshipLabel: 'a tool and its action', difficulty: 1, pairs: [['tongs', 'flip'], ['brush', 'baste']] },
    { id: 'set-action-undo', relationshipLabel: 'an act and its undoing', difficulty: 4, pairs: [['wrap', 'unwrap'], ['ignite', 'extinguish']] },
  ],
};

const REVISION = {
  notes: 'set-action-undo is too easy — wrap:unwrap is a fully symmetric opposite pair.\nDo not change: set-tool-action.',
  fromStage: '01-pair-author',
  scope: null,
  parentBoard: PARENT_BOARD,
};

// The three generative stages, with enough input to build a prompt at all.
const GENERATIVE = [
  ['pair-author', pairAuthor, { brief: { count: 8 }, theme: 'BBQ' }],
  ['theme-grouper', themeGrouper, { pairs: [{ a: 'tongs', b: 'flip', relationshipLabel: 'x', shape: 'instrument-action' }] }],
  ['board-builder', boardBuilder, { gradedSets: [] }],
];

// --- the block itself ---

test('nothing to say produces nothing — an absent revision renders empty', () => {
  assert.equal(renderRevision(null), '');
  assert.equal(renderRevision(undefined), '');
});

test('a revision with neither notes nor a parent board renders empty', () => {
  // Better silent than a header announcing a revision it cannot describe.
  assert.equal(renderRevision({ notes: '   ', parentBoard: null }), '');
});

test('notes travel even when the parent never finished a board', () => {
  // The parent failing is exactly when the notes matter most: they are the
  // part that cannot be re-derived from artifacts.
  const block = renderRevision({ notes: 'the Red set reads as a category', parentBoard: null });
  assert.match(block, /THIS IS A REVISION/);
  assert.match(block, /reads as a category/);
  assert.doesNotMatch(block, /The board being revised/);
});

test('the block carries the three things a revision needs to not churn', () => {
  const block = renderRevision(REVISION);
  assert.match(block, /THIS IS A REVISION, NOT A NEW BOARD/);
  assert.match(block, /wrap:unwrap is a fully symmetric opposite pair/);
  assert.match(block, /"Smoke & Craft"|Smoke & Craft/);
  assert.match(block, /SURVIVE UNCHANGED/);
  assert.match(block, /Do not re-theme, re-title or re-author/);
});

// --- who renders it ---

for (const [id, agent, input] of GENERATIVE) {
  test(`${id}: renders the revision when it is given one`, () => {
    const prompt = agent.buildPrompt({ ...input, revision: REVISION }, {});
    assert.match(prompt, /THIS IS A REVISION, NOT A NEW BOARD/);
    assert.match(prompt, /wrap:unwrap/);
  });

  test(`${id}: renders nothing when there is no revision`, () => {
    const prompt = agent.buildPrompt(input, {});
    assert.doesNotMatch(prompt, /THIS IS A REVISION/);
  });

  test(`${id}: the revision leads the prompt, ahead of the standing instruction`, () => {
    // Position is load-bearing. "Author 8 candidate pairs" reads as "author a
    // fresh pool" unless the model has already been told it is repairing a
    // board it is about to be shown.
    const prompt = agent.buildPrompt({ ...input, revision: REVISION }, {});
    const revisionAt = prompt.indexOf('THIS IS A REVISION');
    const rulesAt = prompt.indexOf('Rules for this revision');
    assert.ok(revisionAt >= 0 && rulesAt > revisionAt);
    assert.ok(
      revisionAt < prompt.length / 2,
      'the revision block was buried in the back half of the prompt',
    );
  });
}
