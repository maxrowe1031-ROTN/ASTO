// budget — request, token, cost and duration enforcement.
//
// The cap lives at the orchestration layer, never inside an agent: agents are
// pure and have no idea what they cost. Two rules the spec is explicit about
// and these tests pin down: failed calls count, and a resumed attempt keeps
// counting against the same caps rather than starting over.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBudget } from '../../../studio/budget.js';
import { TERMINAL_CONTENT } from '../../../studio/failures.js';

const RATES = {
  'mock-model': { inputPerMTok: 3, outputPerMTok: 15 },
};

const budgetWith = (limits, options = {}) =>
  createBudget({ limits, rates: RATES, ...options });

test('a fresh budget has spent nothing at every scope', () => {
  const budget = budgetWith({});

  const usage = budget.usage();
  assert.equal(usage.attempt.requests, 0);
  assert.equal(usage.attempt.tokens, 0);
  assert.equal(usage.attempt.costUsd, 0);
  assert.equal(usage.run.requests, 0);
});

test('a charge accumulates at stage, attempt and run scope at once', () => {
  const budget = budgetWith({});
  budget.beginStage('01-pair-author');
  budget.charge({ model: 'mock-model', requests: 2, inputTokens: 100, outputTokens: 50, ms: 900 });

  const usage = budget.usage();
  assert.deepEqual(
    [usage.stage.requests, usage.attempt.requests, usage.run.requests],
    [2, 2, 2],
  );
  assert.deepEqual([usage.stage.tokens, usage.attempt.tokens, usage.run.tokens], [150, 150, 150]);
  assert.deepEqual([usage.stage.ms, usage.attempt.ms, usage.run.ms], [900, 900, 900]);
});

test('cost comes from per-model rates, priced per million tokens', () => {
  const budget = budgetWith({});
  budget.beginStage('01-pair-author');
  budget.charge({ model: 'mock-model', requests: 1, inputTokens: 1_000_000, outputTokens: 1_000_000 });

  assert.equal(budget.usage().attempt.costUsd, 18);
});

test('an unpriced model costs zero but is named — silent under-counting is the bug', () => {
  const budget = budgetWith({});
  budget.beginStage('01-pair-author');
  budget.charge({ model: 'some-new-model', requests: 1, inputTokens: 1000, outputTokens: 1000 });

  assert.equal(budget.usage().attempt.costUsd, 0);
  assert.deepEqual(budget.usage().unpricedModels, ['some-new-model']);
});

test('a failed call still counts — the spend happened either way', () => {
  const budget = budgetWith({});
  budget.beginStage('01-pair-author');
  budget.charge({ model: 'mock-model', requests: 3, inputTokens: 400, outputTokens: 0, outcome: 'failed' });

  assert.equal(budget.usage().attempt.requests, 3);
  assert.equal(budget.usage().attempt.tokens, 400);
});

test('beginStage resets the stage scope and leaves attempt and run alone', () => {
  const budget = budgetWith({});
  budget.beginStage('01-pair-author');
  budget.charge({ model: 'mock-model', requests: 1, inputTokens: 100, outputTokens: 0 });
  budget.beginStage('02-theme-grouper');
  budget.charge({ model: 'mock-model', requests: 1, inputTokens: 50, outputTokens: 0 });

  const usage = budget.usage();
  assert.equal(usage.stage.tokens, 50);
  assert.equal(usage.attempt.tokens, 150);
  assert.equal(usage.run.tokens, 150);
});

test('breaching a per-stage cap throws a terminal-content failure naming the scope', () => {
  const budget = budgetWith({ perStage: { tokens: 100 } });
  budget.beginStage('01-pair-author');

  let error;
  try {
    budget.charge({ model: 'mock-model', requests: 1, inputTokens: 200, outputTokens: 0 });
  } catch (thrown) {
    error = thrown;
  }
  assert.ok(error, 'the charge was expected to throw');
  assert.equal(error.name, 'StudioFailure');
  assert.equal(error.category, TERMINAL_CONTENT);
  assert.match(error.message, /stage .*tokens/);
});

test('breaching a per-attempt cap throws even when every single stage was within its own', () => {
  const budget = budgetWith({ perStage: { tokens: 100 }, perAttempt: { tokens: 150 } });
  budget.beginStage('01-pair-author');
  budget.charge({ model: 'mock-model', requests: 1, inputTokens: 100, outputTokens: 0 });
  budget.beginStage('02-theme-grouper');

  assert.throws(
    () => budget.charge({ model: 'mock-model', requests: 1, inputTokens: 100, outputTokens: 0 }),
    /attempt .*tokens/,
  );
});

test('breaching a per-run cap throws — this is what bounds a run across its attempts', () => {
  const budget = budgetWith(
    { perRun: { costUsd: 1 } },
    { priorUsage: { requests: 5, tokens: 100, costUsd: 0.9, ms: 0 } },
  );
  budget.beginStage('01-pair-author');

  assert.throws(
    () => budget.charge({ model: 'mock-model', requests: 1, inputTokens: 1_000_000, outputTokens: 0 }),
    /run .*costUsd/,
  );
});

test('prior usage seeds the run scope — a resumed attempt continues, it does not restart', () => {
  const budget = budgetWith({}, { priorUsage: { requests: 7, tokens: 2000, costUsd: 0.5, ms: 1200 } });

  assert.equal(budget.usage().run.requests, 7);
  assert.equal(budget.usage().run.tokens, 2000);
  // The attempt scope is this attempt's own spend, so it starts clean.
  assert.equal(budget.usage().attempt.requests, 0);
});

test('a limit that is not set is not enforced — an absent cap is never a cap of zero', () => {
  const budget = budgetWith({ perStage: { requests: 2 } });
  budget.beginStage('01-pair-author');

  assert.doesNotThrow(() =>
    budget.charge({ model: 'mock-model', requests: 1, inputTokens: 10_000_000, outputTokens: 0 }),
  );
});

test('check refuses to start a stage whose caps are already spent, before any call is made', () => {
  const budget = budgetWith({ perAttempt: { requests: 2 } });
  budget.beginStage('01-pair-author');
  budget.charge({ model: 'mock-model', requests: 2, inputTokens: 10, outputTokens: 0 });
  budget.beginStage('02-theme-grouper');

  assert.throws(() => budget.check(), /attempt .*requests/);
});

test('wall-clock is a cap like any other', () => {
  const budget = budgetWith({ perAttempt: { ms: 1000 } });
  budget.beginStage('01-pair-author');

  assert.throws(
    () => budget.charge({ model: 'mock-model', requests: 1, inputTokens: 1, outputTokens: 0, ms: 1500 }),
    /attempt .*ms/,
  );
});
