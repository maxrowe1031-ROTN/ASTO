// pipeline-config — the numbers, in one reviewable place.
//
// Mostly data, so these tests pin only the invariants that would break the
// pipeline silently: every agent stage resolves to a model, every model the
// pipeline can name has a price, and the config cannot be mutated at runtime.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CONFIG,
  effortFor,
  modelFor,
  retriesFor,
} from '../../../studio/pipeline-config.js';
import { STAGES } from '../../../studio/stage-registry.js';

const AGENT_STAGES = STAGES.filter((stage) => stage.kind === 'agent');
const SONNET = 'claude-sonnet-5';

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

test('the shakedown model tiering is what ships', () => {
  // The spec's tiering (sonnet for reasoning, haiku for narrow checkers) was
  // amended for the taxonomy shakedown, 2026-08-04 with Max: 03 has never
  // returned a 4 and now weighs stance's effect on play; 08 gained the unity
  // verdict — taste calls, not the checks Haiku was priced for. 05 stays the
  // narrow checker it always was. Revisit at the slim-down lap.
  assert.equal(modelFor('01-pair-author', DEFAULT_CONFIG), 'claude-sonnet-5');
  assert.equal(modelFor('04-board-builder', DEFAULT_CONFIG), 'claude-sonnet-5');
  assert.equal(modelFor('03-difficulty-rater', DEFAULT_CONFIG), 'claude-sonnet-5');
  assert.equal(modelFor('08-style-guide', DEFAULT_CONFIG), 'claude-sonnet-5');
  assert.equal(modelFor('05-analogy-validator', DEFAULT_CONFIG), 'claude-haiku-4-5-20251001');
});

// Adaptive thinking is on by default for the Claude 5 family and shares the
// max_tokens ceiling with the response text, so effort is how a stage's
// thinking depth is controlled. It is not universally supported: sending
// output_config.effort to Haiku 4.5 is an error, so the lookup has to be able
// to return nothing rather than fall back to a default.
test('effort is set for exactly the stages whose model accepts it', () => {
  for (const stage of AGENT_STAGES) {
    const effort = effortFor(stage.id, DEFAULT_CONFIG);
    if (modelFor(stage.id, DEFAULT_CONFIG) === SONNET) {
      assert.ok(
        ['low', 'medium', 'high', 'xhigh', 'max'].includes(effort),
        `${stage.id} runs on Sonnet but has no effort (${effort})`,
      );
    } else {
      assert.equal(effort, null, `${stage.id} runs on Haiku, which rejects output_config.effort`);
    }
  }
});

test('the gate stage has no effort — it never calls a model', () => {
  assert.equal(effortFor('04a-integrity', DEFAULT_CONFIG), null);
});

test('effort follows what a stage actually has to work out', () => {
  // The lean-2 numbers (01/02/04 at medium) were measured against the OLD
  // asks. The taxonomy shakedown (2026-08-04, with Max) returns 01 and 02 to
  // high: authoring and grouping across four stances inside one theme is the
  // hardest ask either has carried, and judging the new design at settings
  // tuned for the old jobs would confound "the design doesn't work" with "the
  // model had no room to think". 04 holds at medium — its job barely
  // hardened; the stance check is mechanical, at the gate.
  assert.equal(effortFor('01-pair-author', DEFAULT_CONFIG), 'high');
  assert.equal(effortFor('02-theme-grouper', DEFAULT_CONFIG), 'high');
  assert.equal(effortFor('04-board-builder', DEFAULT_CONFIG), 'medium');
  // The exception, and the reason there is one: 06 is the last thing between a
  // flawed board and Max's time. Cheapening it would move cost onto him.
  assert.equal(effortFor('06-adversarial-solver', DEFAULT_CONFIG), 'high');
});

test('the effort profile changes whenever the effort map does', () => {
  // Every attempt is stamped with this string, and the review corpus uses it to
  // ask "did the cheaper profile make worse boards?". Two different maps
  // sharing one label would silently merge the two populations being compared,
  // so the assertion is pinned deliberately: changing the map above without
  // changing the string fails here.
  assert.equal(DEFAULT_CONFIG.effortProfile, '2026-08-04-taxonomy-shakedown');
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

// --- the 2026-08-03 re-aim ----------------------------------------------
//
// Measured, not guessed. A complete run cost $0.52 / 347s, and 04 alone was
// $0.244 / 166s of it — 94% of its billed output was thinking, behind an
// 876-token answer. The stage had already stopped authoring sets (D-1), and
// removing its combinatorial obligation left work that does not need the
// pipeline's highest setting.

test('the board builder no longer runs at the highest effort in the pipeline', () => {
  assert.equal(effortFor('04-board-builder', DEFAULT_CONFIG), 'medium');
});

test('the adversarial solver keeps its effort — it is the last line before Max', () => {
  assert.equal(effortFor('06-adversarial-solver', DEFAULT_CONFIG), 'high');
});

test('the effort profile carries a version, like the pricing table does', () => {
  // A recorded cost is only interpretable beside the settings that produced
  // it. The review loop uses this to answer "did the cheaper profile make
  // worse boards?" from judgements Max is making anyway.
  assert.ok(typeof DEFAULT_CONFIG.effortProfile === 'string');
  assert.ok(DEFAULT_CONFIG.effortProfile.length > 0);
});
