// The evaluators' findings, filed under the set they are about.
//
// This file exists because of a crash that survived every board ever reviewed.
// `machineNotesBySet` lived inside review.js, which touches `document` at
// module scope and therefore cannot be imported by a node test — so the one
// function on the page that reads four agents' output had no coverage at all,
// and a bug in it was invisible until a board triggered it in a browser.
//
// The bug: stage 06 answers the cross-reading checklist BY ID —
// `{ id: "set-seasons#1", valid, note }` — and this code read `reading.setId`
// and destructured `reading.reading`. Neither field has ever existed in 06's
// output. Entries answered `valid: false` were skipped before the destructure,
// so every board rendered perfectly while the check found nothing, and the
// first board where a check came back TRUE blanked the entire review page.
//
// Found 2026-08-08. The tests below are the ones that would have caught it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { machineNotesBySet } from '../../../studio/review/ui/machine-notes.js';

const BOARD = {
  sets: [
    { id: 'set-growth', pairs: [['Seed', 'Tree'], ['Spark', 'Fire']] },
    { id: 'set-seasons', pairs: [['Spring', 'Sowing'], ['Autumn', 'Harvest']] },
  ],
};

const attemptWith = (reports) => ({ board: BOARD, reports });

// --- the crash ---

test('a cross-reading answered true is filed under its set, not thrown', () => {
  // 06's real shape. `reading` and `setId` are the fields that never existed.
  const notes = machineNotesBySet(
    attemptWith({
      '06-adversarial-solver': {
        crossReadings: [
          { id: 'set-growth#1', valid: false },
          {
            id: 'set-seasons#1',
            valid: true,
            note: 'Spring is to autumn as sowing is to harvest — the opening and closing of the same growing year.',
          },
        ],
      },
    }),
  );

  assert.deepEqual(Object.keys(notes), ['set-seasons'], 'the id suffix was not stripped');
  assert.equal(notes['set-seasons'][0].source, 'also reads');
  assert.equal(notes['set-seasons'][0].level, 'high', 'the unfairest defect must be loudest');
  assert.match(notes['set-seasons'][0].text, /same growing year/);
  assert.match(notes['set-seasons'][0].text, /loses a mistake/);
});

test('a checklist that found nothing says nothing', () => {
  const notes = machineNotesBySet(
    attemptWith({
      '06-adversarial-solver': {
        crossReadings: [
          { id: 'set-growth#1', valid: false },
          { id: 'set-growth#2', valid: false },
        ],
      },
    }),
  );
  assert.deepEqual(notes, {});
});

test('a malformed cross-reading is skipped rather than crashing the page', () => {
  // Whatever a model returns, one bad entry must not cost the whole review.
  const notes = machineNotesBySet(
    attemptWith({
      '06-adversarial-solver': {
        crossReadings: [{ valid: true, note: 'no id at all' }, { id: '', valid: true }],
      },
    }),
  );
  assert.deepEqual(notes, {});
});

// --- the other reporters, so the regrouping stays honest ---

test('only failing validator verdicts become notes', () => {
  const notes = machineNotesBySet(
    attemptWith({
      '05-analogy-validator': {
        verdicts: [
          { setId: 'set-growth', pass: true, notes: 'fine' },
          { setId: 'set-seasons', pass: false, notes: 'the grain differs' },
        ],
      },
    }),
  );
  // A pass note says the set works, which is what the set already looks like.
  assert.deepEqual(Object.keys(notes), ['set-seasons']);
  assert.match(notes['set-seasons'][0].text, /grain differs/);
});

test('a solver finding spanning two sets is a board observation, not a set one', () => {
  const notes = machineNotesBySet(
    attemptWith({
      '06-adversarial-solver': {
        findings: [
          { kind: 'cross-set-association', severity: 'low', note: 'nature pull', words: ['Seed', 'Spring'] },
          { kind: 'ambiguous-order', severity: 'low', note: 'reads both ways', words: ['Seed', 'Tree'] },
        ],
      },
    }),
  );
  assert.deepEqual(Object.keys(notes), ['set-growth'], 'a cross-set finding was filed under a set');
});

test('the test player names words; they are mapped back to sets here', () => {
  const notes = machineNotesBySet(
    attemptWith({
      '07-test-player': { knowledgeGated: [{ word: 'Harvest', note: 'seasonal term' }] },
    }),
  );
  assert.equal(notes['set-seasons'][0].source, 'needs knowledge');
});

test('self-matching counts arrive from the gate with two distinct levels', () => {
  const notes = machineNotesBySet(
    attemptWith({ '04a-integrity': { lexical: { bySet: { 'set-growth': 1, 'set-seasons': 2 } } } }),
  );
  assert.equal(notes['set-growth'][0].level, 'low', 'one pair is a foothold, not a fault');
  assert.equal(notes['set-seasons'][0].level, 'medium');
  assert.match(notes['set-seasons'][0].text, /assembles itself/);
});

test('an attempt with no reports at all produces no notes and no throw', () => {
  assert.deepEqual(machineNotesBySet({ board: BOARD, reports: {} }), {});
});

// --- span sets (design.md D-13) ---

test('a span set arrives with its refused readings spelled out', () => {
  const notes = machineNotesBySet(
    attemptWith({
      '04a-integrity': {
        spanFairness: {
          enforced: false,
          count: 1,
          flagged: [
            {
              setId: 'set-growth',
              shape: 'before-after',
              difficulty: 4,
              readings: ['Seed : Spark :: Tree : Fire', 'Seed : Fire :: Tree : Spark'],
            },
          ],
        },
      },
    }),
  );

  const [note] = notes['set-growth'];
  assert.match(note.text, /marked wrong for being right/);
  assert.match(note.text, /Seed : Spark :: Tree : Fire/, 'the reading itself must be readable on the card');
  // Louder at the top tier, where the set carries the most weight — and where
  // 19 of 54 of them had been landing.
  assert.equal(note.level, 'medium');
});

test('a span set below the top tier is quieter, not silent', () => {
  const notes = machineNotesBySet(
    attemptWith({
      '04a-integrity': {
        spanFairness: { flagged: [{ setId: 'set-seasons', difficulty: 2, readings: ['a : b :: c : d'] }] },
      },
    }),
  );
  assert.equal(notes['set-seasons'][0].level, 'low');
});

test('no span flag, no note — and an absent report never throws', () => {
  assert.deepEqual(machineNotesBySet(attemptWith({ '04a-integrity': { spanFairness: { flagged: [] } } })), {});
  assert.deepEqual(machineNotesBySet(attemptWith({ '04a-integrity': {} })), {});
});
