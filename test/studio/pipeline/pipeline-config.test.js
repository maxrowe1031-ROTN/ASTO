// pipeline-config — the numbers, in one reviewable place.
//
// Mostly data, so these tests pin only the invariants that would break the
// pipeline silently: every agent stage resolves to a model, every model the
// pipeline can name has a price, and the config cannot be mutated at runtime.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONFIG, modelFor, retriesFor } from '../../../studio/pipeline-config.js';
import { STAGES } from '../../../studio/stage-registry.js';

const AGENT_STAGES = STAGES.filter((stage) => stage.kind === 'agent');

test('every agent stage resolves to a model', () => {
  for (const stage of AGENT_STAGES) {
    const model = modelFor(stage.id, DEFAULT_CONFIG);
    assert.ok(typeof model === 'string' && model.length > 0, `${stage.id} has no model`);
  }
});

test('the gate stage has no model — it never calls a model', () => {
  assert.equal(modelFor('04a-integrity', DEFAULT_CONFIG), null);
});

test('every model the config can name is priced — an unpriced model under-counts spend', () => {
  for (const stage of AGENT_STAGES) {
    const model = modelFor(stage.id, DEFAULT_CONFIG);
    assert.ok(DEFAULT_CONFIG.rates[model], `no rate for ${model} (used by ${stage.id})`);
  }
});

test('the approved spec\'s model tiering is what ships', () => {
  // docs/superpowers/specs/2026-08-02-asto-studio-design.md, "Budget and
  // execution limits": sonnet for reasoning agents, haiku for narrow checkers.
  assert.equal(modelFor('01-pair-author', DEFAULT_CONFIG), 'claude-sonnet-5');
  assert.equal(modelFor('04-board-builder', DEFAULT_CONFIG), 'claude-sonnet-5');
  assert.equal(modelFor('03-difficulty-rater', DEFAULT_CONFIG), 'claude-haiku-4-5-20251001');
  assert.equal(modelFor('08-style-guide', DEFAULT_CONFIG), 'claude-haiku-4-5-20251001');
});

test('every stage has small explicit retry limits for both failure classes', () => {
  for (const stage of AGENT_STAGES) {
    const { transport, validation } = retriesFor(stage.id, DEFAULT_CONFIG);
    for (const [name, limit] of [['transport', transport], ['validation', validation]]) {
      assert.ok(
        Number.isInteger(limit) && limit >= 1 && limit <= 5,
        `${stage.id} ${name}: ${limit}`,
      );
    }
  }
});

test('the bounded loops are bounded — no unbounded self-repair', () => {
  assert.ok(DEFAULT_CONFIG.maxIntegrityRetries >= 1);
  assert.ok(DEFAULT_CONFIG.maxRevisions >= 1);
  // The spec's default: max 3 AI revision attempts per run.
  assert.equal(DEFAULT_CONFIG.maxRevisions, 3);
});

test('the config is deeply frozen — a run cannot rewrite its own limits', () => {
  assert.throws(() => {
    DEFAULT_CONFIG.limits.perRun.costUsd = 1000;
  }, TypeError);
  assert.throws(() => {
    DEFAULT_CONFIG.maxRevisions = 99;
  }, TypeError);
});

test('the pricing table carries a version — a recorded cost is only meaningful with one', () => {
  assert.ok(typeof DEFAULT_CONFIG.pricingVersion === 'string');
  assert.ok(DEFAULT_CONFIG.pricingVersion.length > 0);
});

test('caps exist at all three scopes', () => {
  for (const scope of ['perStage', 'perAttempt', 'perRun']) {
    assert.ok(DEFAULT_CONFIG.limits[scope], `no ${scope} limits`);
  }
});
