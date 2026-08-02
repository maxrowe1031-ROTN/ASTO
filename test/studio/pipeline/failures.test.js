// Failure handling: every category is recorded, and none of them crashes the
// run. A bad stage is an outcome the Review Studio can read, not an exception
// that escapes to the caller.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runPipeline } from '../../../studio/pipeline.js';
import { RETRYABLE_TRANSPORT, TERMINAL_CONTENT } from '../../../studio/failures.js';
import { DEFAULT_CONFIG } from '../../../studio/pipeline-config.js';
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

test('a truncated reply is never silently accepted as a finished stage', async () => {
  const { result, rootDir, runId, cleanup } = await runWith({
    '01-pair-author': { text: '{"pairs": [', stopReason: 'max_tokens' },
  });
  try {
    assert.equal(result.status, 'failed');
    // A2 classifies truncation as transport-shaped on purpose — the request was
    // cut short, not answered wrongly — so llm.js retries it rather than
    // sending the model feedback about output it never finished writing.
    assert.equal(result.failure.category, RETRYABLE_TRANSPORT);
    const stageDir = join(rootDir, runId, 'attempts', result.attemptId, 'stages', '01-pair-author');
    assert.equal(existsSync(join(stageDir, 'validation.json')), false);
  } finally {
    cleanup();
  }
});
