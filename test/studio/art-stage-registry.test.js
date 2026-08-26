// The art pipeline's stage registry (design.md D-31) — the single source of
// stage IDs and order for art runs, exactly as stage-registry.js is for
// boards. Also the home of the pipeline's shared vocabulary: ART_STATES and
// BAND live here so the store, the gate, and the transport agree without any
// of them importing an agent.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ART_STAGES,
  ART_STATES,
  BAND,
  artStageAfter,
  artStagesFrom,
  isValidArtStageId,
} from '../../studio/art-stage-registry.js';
import * as scenePrompter from '../../studio/agents/scene-prompter.js';

test('the four stages, in pipeline order', () => {
  assert.deepEqual(
    ART_STAGES.map((s) => s.id),
    ['01-scene-prompter', '02-render', '02a-scene-check', '03-scene-critic'],
  );
});

test('stage kinds: two agents, one render transport, one deterministic gate', () => {
  const kinds = Object.fromEntries(ART_STAGES.map((s) => [s.id, s.kind]));
  assert.equal(kinds['01-scene-prompter'], 'agent');
  assert.equal(kinds['02-render'], 'render');
  assert.equal(kinds['02a-scene-check'], 'gate');
  assert.equal(kinds['03-scene-critic'], 'agent');
});

test('the registry is deeply frozen', () => {
  assert.ok(Object.isFrozen(ART_STAGES));
  assert.ok(Object.isFrozen(ART_STAGES[0]));
  assert.ok(Object.isFrozen(ART_STATES));
  assert.ok(Object.isFrozen(BAND));
});

test('derivation helpers walk the order', () => {
  assert.equal(artStageAfter('01-scene-prompter').id, '02-render');
  assert.equal(artStageAfter('03-scene-critic'), null);
  assert.deepEqual(
    artStagesFrom('02a-scene-check').map((s) => s.id),
    ['02a-scene-check', '03-scene-critic'],
  );
  assert.equal(isValidArtStageId('02-render'), true);
  assert.equal(isValidArtStageId('05-unknown'), false);
  assert.throws(() => artStageAfter('nope'), /unknown art stage/);
});

test('the band constants are the decided footprint (D-30: 150×24 @2.5× = 375×60)', () => {
  assert.equal(BAND.width, 375);
  assert.equal(BAND.height, 60);
  assert.equal(BAND.ratio, 6.25);
});

// D-31 turned the three states from sprite loops into three stills; the
// prompter and the registry must never disagree about what they are called,
// because the store files art under these names and the game loads by them.
test('ART_STATES and the scene-prompter agree on the three states', () => {
  assert.deepEqual([...ART_STATES], scenePrompter.listStates());
});
