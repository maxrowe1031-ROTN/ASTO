// The pipeline, end to end over the committed fixtures.
//
// This is A3's headline claim: eight agent stages plus the deterministic 04a
// gate run in order, hand artifacts to each other through the blackboard, and
// leave a complete run directory behind — with no network touched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { runPipeline } from '../../../studio/pipeline.js';
import { STAGES } from '../../../studio/stage-registry.js';
import { validatePuzzle } from '../../../src/source/validate-puzzle.js';
import { makeStore, mockTransport, seedRun, fastTime } from './helpers.js';

const AGENT_STAGE_IDS = STAGES.filter((s) => s.kind === 'agent').map((s) => s.id);

const run = async () => {
  const { store, rootDir, cleanup } = makeStore();
  const transport = mockTransport();
  const runId = seedRun(store);
  const result = await runPipeline({ runId, store, transport, ...fastTime() });
  return { result, store, rootDir, runId, transport, cleanup };
};

test('a full mock run completes and yields a board the GAME accepts', async () => {
  const { result, cleanup } = await run();
  try {
    assert.equal(result.status, 'complete', result.failure?.message);
    assert.equal(validatePuzzle(result.board).ok, true);
    assert.equal(result.board.title, 'First Light');
  } finally {
    cleanup();
  }
});

test('every stage runs, once, in registry order', async () => {
  const { transport, cleanup } = await run();
  try {
    assert.deepEqual(
      transport.calls.map((call) => call.stageId),
      AGENT_STAGE_IDS,
    );
  } finally {
    cleanup();
  }
});

test('the run touches the network zero times', async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => {
    calls += 1;
    throw new Error('network used during a mock run');
  };
  try {
    const { result, cleanup } = await run();
    assert.equal(result.status, 'complete');
    assert.equal(calls, 0);
    cleanup();
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('each agent stage leaves its full artifact set on disk', async () => {
  const { rootDir, runId, result, cleanup } = await run();
  try {
    for (const stageId of AGENT_STAGE_IDS) {
      const dir = join(rootDir, runId, 'attempts', result.attemptId, 'stages', stageId);
      for (const filename of ['request.json', 'prompt.txt', 'response.txt', 'output.json', 'validation.json']) {
        assert.ok(existsSync(join(dir, filename)), `${stageId}/${filename} missing`);
      }
    }
  } finally {
    cleanup();
  }
});

test('prompt.txt and response.txt are readable text, not JSON-quoted strings', async () => {
  const { rootDir, runId, result, cleanup } = await run();
  try {
    const dir = join(rootDir, runId, 'attempts', result.attemptId, 'stages', '01-pair-author');
    const prompt = readFileSync(join(dir, 'prompt.txt'), 'utf8');
    assert.ok(prompt.startsWith('You are the Pair Author'), prompt.slice(0, 60));
    assert.ok(!prompt.startsWith('"'), 'prompt.txt was JSON-encoded');
  } finally {
    cleanup();
  }
});

test('the request record carries the conditions but never a secret', async () => {
  const { rootDir, runId, result, cleanup } = await run();
  try {
    const record = JSON.parse(
      readFileSync(
        join(rootDir, runId, 'attempts', result.attemptId, 'stages', '01-pair-author', 'request.json'),
        'utf8',
      ),
    );
    assert.equal(typeof record.model, 'string');
    assert.ok(record.inputTokens > 0 && record.outputTokens > 0);
    assert.equal(record.attempts, 1);
    assert.equal(JSON.stringify(record).includes('apiKey'), false);
  } finally {
    cleanup();
  }
});

test('the 04a gate runs as deterministic code and records its verdict', async () => {
  const { rootDir, runId, result, cleanup } = await run();
  try {
    const gateDir = join(rootDir, runId, 'attempts', result.attemptId, 'stages', '04a-integrity');
    const integrity = JSON.parse(readFileSync(join(gateDir, 'integrity.json'), 'utf8'));
    assert.equal(integrity.ok, true);
    assert.equal(integrity.acceptedCount, 16);
    assert.equal(integrity.expectedAccepted, 16);
    // A gate makes no request: no model was called for it.
    assert.equal(existsSync(join(gateDir, 'request.json')), false);
  } finally {
    cleanup();
  }
});

test('stage 02 receives stage 01 output — the blackboard actually carries work forward', async () => {
  const { transport, cleanup } = await run();
  try {
    const grouperPrompt = transport.calls.find((c) => c.stageId === '02-theme-grouper').prompt;
    // The fixture's pair author authors Seed : Tree; the grouper must see it.
    assert.match(grouperPrompt, /Seed/);
    assert.match(grouperPrompt, /Tree/);
  } finally {
    cleanup();
  }
});

test('the blackboard is persisted so a resumed or reviewed attempt can be rebuilt', async () => {
  const { rootDir, runId, result, cleanup } = await run();
  try {
    const snapshot = JSON.parse(
      readFileSync(join(rootDir, runId, 'attempts', result.attemptId, 'blackboard.json'), 'utf8'),
    );
    assert.deepEqual(snapshot.stageOrder, STAGES.map((s) => s.id));
    assert.equal(snapshot.stages['01-pair-author'].resolution.pairs > 0, true);
  } finally {
    cleanup();
  }
});

test('the run ends awaiting review, and the attempt is complete and immutable', async () => {
  const { store, runId, result, cleanup } = await run();
  try {
    assert.equal(store.readManifest(runId).status, 'awaiting-review');
    const attempt = store.readAttempt(runId, result.attemptId);
    assert.equal(attempt.status, 'complete');
    assert.throws(
      () => store.writeStageArtifact(runId, result.attemptId, '01-pair-author', 'x.json', {}),
      /immutable/,
    );
  } finally {
    cleanup();
  }
});

test('the attempt records what the run cost, and the prices it was costed with', async () => {
  const { store, runId, result, cleanup } = await run();
  try {
    const attempt = store.readAttempt(runId, result.attemptId);
    assert.ok(attempt.usage.attempt.requests >= AGENT_STAGE_IDS.length);
    assert.ok(attempt.usage.attempt.tokens > 0);
    assert.equal(attempt.pricingVersion, '2026-08-02');
    assert.deepEqual(attempt.usage.unpricedModels, []);
  } finally {
    cleanup();
  }
});

test('every stage status is recorded on the attempt', async () => {
  const { store, runId, result, cleanup } = await run();
  try {
    const { stageStatuses } = store.readAttempt(runId, result.attemptId);
    for (const stage of STAGES) {
      assert.equal(stageStatuses[stage.id]?.status, 'complete', stage.id);
    }
  } finally {
    cleanup();
  }
});

test('the board lands as board.json at the attempt root', async () => {
  const { rootDir, runId, result, cleanup } = await run();
  try {
    const attemptDir = join(rootDir, runId, 'attempts', result.attemptId);
    assert.ok(readdirSync(attemptDir).includes('board.json'));
    assert.deepEqual(JSON.parse(readFileSync(join(attemptDir, 'board.json'), 'utf8')), result.board);
  } finally {
    cleanup();
  }
});
