// Stage registry: the fixed, ordered list of pipeline stages.
//
// The registry is the single source of stage IDs. Everything else — run
// directories, revision re-entry, resume — derives from this order. The
// integrity sweep (04a) is a deterministic gate, not a ninth agent.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STAGES,
  stageById,
  stageAfter,
  stagesFrom,
  isValidStageId,
} from '../../studio/stage-registry.js';

test('there are ten stages: nine agents plus the integrity gate', () => {
  assert.equal(STAGES.length, 10);
  assert.equal(STAGES.filter((s) => s.kind === 'agent').length, 9);
  assert.equal(STAGES.filter((s) => s.kind === 'gate').length, 1);
});

test('the stages run in the GDD §12.3 order with the gate after board-builder', () => {
  assert.deepEqual(
    STAGES.map((s) => s.id),
    [
      '01-pair-author',
      '02-theme-grouper',
      '03-difficulty-rater',
      '04-board-builder',
      '04a-integrity',
      '05-analogy-validator',
      '06-adversarial-solver',
      '07-test-player',
      '08-style-guide',
      '09-glossary-author',
    ],
  );
});

test('agent stages name their agent module; the gate has no agent', () => {
  assert.equal(stageById('01-pair-author').agent, 'pair-author');
  assert.equal(stageById('08-style-guide').agent, 'style-guide');
  assert.equal(stageById('04a-integrity').agent, undefined);
});

test('the registry is deeply frozen — stages cannot be mutated at runtime', () => {
  assert.ok(Object.isFrozen(STAGES));
  assert.ok(Object.isFrozen(STAGES[0]));
  assert.throws(() => {
    'use strict';
    STAGES[0].id = 'tampered';
  }, TypeError);
});

test('stageAfter walks the order and returns null at the end', () => {
  assert.equal(stageAfter('04-board-builder').id, '04a-integrity');
  assert.equal(stageAfter('04a-integrity').id, '05-analogy-validator');
  assert.equal(stageAfter('08-style-guide').id, '09-glossary-author');
  assert.equal(stageAfter('09-glossary-author'), null);
});

test('stagesFrom returns the tail of the pipeline for revision re-entry', () => {
  const ids = stagesFrom('04-board-builder').map((s) => s.id);
  assert.deepEqual(ids, [
    '04-board-builder',
    '04a-integrity',
    '05-analogy-validator',
    '06-adversarial-solver',
    '07-test-player',
    '08-style-guide',
    '09-glossary-author',
  ]);
});

test('stagesFrom the first stage is the whole pipeline', () => {
  assert.equal(stagesFrom('01-pair-author').length, STAGES.length);
});

test('unknown stage ids are rejected loudly, not returned as undefined', () => {
  assert.equal(isValidStageId('04a-integrity'), true);
  assert.equal(isValidStageId('09-nonsense'), false);
  assert.throws(() => stageById('09-nonsense'), /unknown stage/i);
  assert.throws(() => stageAfter('09-nonsense'), /unknown stage/i);
  assert.throws(() => stagesFrom('09-nonsense'), /unknown stage/i);
});
