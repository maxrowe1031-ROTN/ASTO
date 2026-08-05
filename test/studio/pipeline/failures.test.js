// Failure handling: every category is recorded, and none of them crashes the
// run. A bad stage is an outcome the Review Studio can read, not an exception
// that escapes to the caller.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runPipeline } from '../../../studio/pipeline.js';
import { RETRYABLE_TRANSPORT, TERMINAL_CONTENT } from '../../../studio/failures.js';
import { DEFAULT_CONFIG, effortFor } from '../../../studio/pipeline-config.js';
import { makeStore, mockTransport, seedRun, fastTime, fixturesWith } from './helpers.js';

const runWith = async (overrides, extra = {}) => {
  const { store, rootDir, cleanup: dropStore } = makeStore();
  const { dir, cleanup: dropFixtures } = fixturesWith(overrides);
  const runId = seedRun(store);
  const result = await runPipeline({
    runId,
    store,
    transport: mockTransport(dir),
    ...fastTime(),
    ...extra,
  });
  return {
    result,
    store,
    rootDir,
    runId,
    cleanup: () => {
      dropStore();
      dropFixtures();
    },
  };
};

const failureJson = (rootDir, runId, attemptId) =>
  JSON.parse(readFileSync(join(rootDir, runId, 'attempts', attemptId, 'failure.json'), 'utf8'));

test('an exhausted transport failure is recorded, and runPipeline still returns', async () => {
  // 529 is retryable; llm.js exhausts its attempts and gives up.
  const { result, store, rootDir, runId, cleanup } = await runWith({
    '01-pair-author': { status: 529, error: 'overloaded' },
  });
  try {
    assert.equal(result.status, 'failed');
    assert.equal(result.failure.category, RETRYABLE_TRANSPORT);
    assert.equal(store.readManifest(runId).status, 'failed');
    assert.equal(store.readAttempt(runId, result.attemptId).status, 'failed');
    assert.match(failureJson(rootDir, runId, result.attemptId).message, /HTTP 529/);
  } finally {
    cleanup();
  }
});

test('a non-retryable HTTP status fails immediately as terminal content', async () => {
  const { result, cleanup } = await runWith({
    '01-pair-author': { status: 400, error: 'bad request' },
  });
  try {
    assert.equal(result.status, 'failed');
    assert.equal(result.failure.category, TERMINAL_CONTENT);
  } finally {
    cleanup();
  }
});

test('unparseable output is retried with feedback, then recorded as terminal', async () => {
  const { result, rootDir, runId, cleanup } = await runWith({
    '01-pair-author': { text: 'I am afraid I cannot do that.' },
  });
  try {
    assert.equal(result.status, 'failed');
    assert.equal(result.failure.category, TERMINAL_CONTENT);
    assert.equal(result.failure.stageId, '01-pair-author');

    // Every rejected round is kept — the response is never erased.
    const stageDir = join(rootDir, runId, 'attempts', result.attemptId, 'stages', '01-pair-author');
    for (let round = 1; round <= DEFAULT_CONFIG.retries.validation + 1; round += 1) {
      assert.ok(existsSync(join(stageDir, `response.rejected-${round}.txt`)), `round ${round}`);
      assert.ok(existsSync(join(stageDir, `validation.rejected-${round}.json`)), `round ${round}`);
    }
    // …and the stage never claims to have finished.
    assert.equal(existsSync(join(stageDir, 'validation.json')), false);
  } finally {
    cleanup();
  }
});

test('a stage that fails validation once and recovers completes the run', async () => {
  const good = JSON.parse(readFileSync(new URL('../../../studio/fixtures/responses/01-pair-author.json', import.meta.url), 'utf8'));
  const { result, rootDir, runId, cleanup } = await runWith({
    '01-pair-author': [{ text: '{"pairs": []}' }, good],
  });
  try {
    assert.equal(result.status, 'complete', result.failure?.message);
    const stageDir = join(rootDir, runId, 'attempts', result.attemptId, 'stages', '01-pair-author');
    assert.ok(existsSync(join(stageDir, 'validation.rejected-1.json')), 'round 1 not preserved');
    assert.ok(existsSync(join(stageDir, 'validation.json')), 'stage never finished');
  } finally {
    cleanup();
  }
});

test('the retry actually carries feedback back to the model', async () => {
  const { store, cleanup: dropStore } = makeStore();
  const { dir, cleanup: dropFixtures } = fixturesWith({
    '01-pair-author': [{ text: '{"pairs": []}' }, { text: '{"pairs": []}' }, { text: '{"pairs": []}' }],
  });
  const transport = mockTransport(dir);
  try {
    await runPipeline({ runId: seedRun(store), store, transport, ...fastTime() });
    const retried = transport.calls.filter((c) => c.stageId === '01-pair-author');
    assert.ok(retried.length > 1, 'stage was not retried');
    assert.match(retried[1].prompt, /rejected by the output schema/);
  } finally {
    dropStore();
    dropFixtures();
  }
});

test('budget exhaustion is terminal, and the failure names the cap it hit', async () => {
  const tightBudget = {
    ...DEFAULT_CONFIG,
    limits: { ...DEFAULT_CONFIG.limits, perRun: { requests: 2 } },
  };
  const { result, cleanup } = await runWith({}, { config: tightBudget });
  try {
    assert.equal(result.status, 'failed');
    assert.equal(result.failure.category, TERMINAL_CONTENT);
    assert.equal(result.failure.scope, 'run');
    assert.equal(result.failure.metric, 'requests');
    assert.equal(result.failure.cap, 2);
    assert.match(result.failure.message, /budget exhausted/);
  } finally {
    cleanup();
  }
});

test('a failed run still leaves the partial blackboard and the spend on disk', async () => {
  const { result, store, rootDir, runId, cleanup } = await runWith({
    '05-analogy-validator': { status: 400, error: 'bad request' },
  });
  try {
    assert.equal(result.status, 'failed');
    const snapshot = JSON.parse(
      readFileSync(join(rootDir, runId, 'attempts', result.attemptId, 'blackboard.json'), 'utf8'),
    );
    // Everything up to the failing stage survives for review.
    assert.ok(snapshot.stages['04-board-builder'], 'earlier work was lost');
    assert.ok(store.readAttempt(runId, result.attemptId).usage.attempt.requests > 0);
  } finally {
    cleanup();
  }
});

test('the failure is appended to the run decision log', async () => {
  const { result, store, runId, cleanup } = await runWith({
    '01-pair-author': { status: 400, error: 'nope' },
  });
  try {
    const decisions = store.readDecisions(runId);
    const failed = decisions.find((d) => d.type === 'attempt-failed');
    assert.ok(failed, 'no attempt-failed decision recorded');
    assert.equal(failed.attemptId, result.attemptId);
  } finally {
    cleanup();
  }
});

// The 2026-08-02 incident, replayed. A real run died in transport at stage
// 02 and left no stage folder at all, because the request record is written
// only after a reply arrives. Which stage failed, and under which ceiling,
// had to be reconstructed by dividing token totals by request counts. These
// assert that never being necessary again.
test('a stage that dies in transport still leaves its prompt and request on disk', async () => {
  const { result, rootDir, runId, cleanup } = await runWith({
    '02-theme-grouper': { text: '{"sets": [', stopReason: 'max_tokens' },
  });
  try {
    assert.equal(result.status, 'failed');
    const stageDir = join(rootDir, runId, 'attempts', result.attemptId, 'stages', '02-theme-grouper');

    assert.ok(existsSync(join(stageDir, 'prompt.txt')), 'the prompt is known before any call');
    const failed = JSON.parse(readFileSync(join(stageDir, 'request.failed.json'), 'utf8'));
    assert.equal(failed.stageId, '02-theme-grouper');
    assert.equal(failed.model, 'claude-sonnet-5');
    // Both ceilings, because truncation raises it once before giving up. The
    // point is that neither has to be worked out from token arithmetic.
    assert.equal(failed.maxTokensConfigured, 16_000);
    assert.equal(failed.maxTokens, 24_000, 'the ceiling the last attempt actually used');
    assert.equal(failed.effort, effortFor('02-theme-grouper'));
    assert.equal(failed.category, TERMINAL_CONTENT);
    assert.ok(Array.isArray(failed.requests) && failed.requests.length > 0);

    // …and it must not read as finished to resume.
    assert.equal(existsSync(join(stageDir, 'validation.json')), false);
  } finally {
    cleanup();
  }
});

test('the failed stage is named in failure.json and in the attempt status map', async () => {
  const { result, store, rootDir, runId, cleanup } = await runWith({
    '02-theme-grouper': { status: 529, error: 'overloaded' },
  });
  try {
    assert.equal(failureJson(rootDir, runId, result.attemptId).stageId, '02-theme-grouper');

    const { stageStatuses } = store.readAttempt(runId, result.attemptId);
    assert.equal(stageStatuses['01-pair-author'].status, 'complete');
    assert.equal(stageStatuses['02-theme-grouper'].status, 'failed');
    assert.equal(stageStatuses['02-theme-grouper'].category, RETRYABLE_TRANSPORT);
  } finally {
    cleanup();
  }
});

test('a completed stage records the ceiling and effort it ran under', async () => {
  const { result, rootDir, runId, cleanup } = await runWith({});
  try {
    assert.equal(result.status, 'complete');
    const stageDir = join(rootDir, runId, 'attempts', result.attemptId, 'stages');
    const sonnet = JSON.parse(readFileSync(join(stageDir, '04-board-builder', 'request.json'), 'utf8'));
    const haiku = JSON.parse(readFileSync(join(stageDir, '05-analogy-validator', 'request.json'), 'utf8'));

    assert.equal(sonnet.effort, effortFor('04-board-builder'));
    assert.equal(sonnet.maxTokens, 16_000);
    assert.equal(haiku.effort, null, 'the checker stages send no effort at all');
  } finally {
    cleanup();
  }
});

test('a truncated reply is never silently accepted as a finished stage', async () => {
  const { result, rootDir, runId, cleanup } = await runWith({
    '01-pair-author': { text: '{"pairs": [', stopReason: 'max_tokens' },
  });
  try {
    assert.equal(result.status, 'failed');
    // Truncation is classified transport-shaped — the request was cut short,
    // not answered wrongly — so llm.js retries it rather than sending the
    // model feedback about output it never finished writing. But it retries
    // with a raised ceiling exactly once: a stage that truncates at both is
    // terminal, because a third identical attempt only costs money.
    assert.equal(result.failure.category, TERMINAL_CONTENT);
    assert.match(result.failure.message, /truncated at max_tokens \d+, and again/);
    assert.equal(result.failure.stageId, '01-pair-author', 'the failure must name its stage');
    const stageDir = join(rootDir, runId, 'attempts', result.attemptId, 'stages', '01-pair-author');
    assert.equal(existsSync(join(stageDir, 'validation.json')), false);
  } finally {
    cleanup();
  }
});
