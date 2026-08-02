// The 04a gate: deterministic, mid-pipeline, bounded.
//
// Its realistic catch is a model drifting back to the pre-v1.0 schema — a
// `words[]` array or a per-set `tier`. Those pass the Board Builder's own
// checks and are rejected only by the game's validator, which is the whole
// argument for the gate importing `src/` rather than keeping its own copy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runPipeline } from '../../../studio/pipeline.js';
import { DEFAULT_CONFIG } from '../../../studio/pipeline-config.js';
import { TERMINAL_CONTENT } from '../../../studio/failures.js';
import {
  makeStore,
  mockTransport,
  seedRun,
  fastTime,
  fixturesWith,
  fixtureBoard,
  boardReply,
} from './helpers.js';

const board = fixtureBoard();
const oldSchemaBoard = { ...board, words: board.sets.flatMap((set) => set.pairs.flat()) };

const runWith = async (builderScript, extra = {}) => {
  const { store, rootDir, cleanup: dropStore } = makeStore();
  const { dir, cleanup: dropFixtures } = fixturesWith({ '04-board-builder': builderScript });
  const transport = mockTransport(dir);
  const runId = seedRun(store);
  const result = await runPipeline({ runId, store, transport, ...fastTime(), ...extra });
  return {
    result,
    store,
    rootDir,
    runId,
    transport,
    cleanup: () => {
      dropStore();
      dropFixtures();
    },
  };
};

test('a board carrying the old schema is rejected — the agent passed it, the gate did not', async () => {
  const { result, rootDir, runId, cleanup } = await runWith([boardReply(oldSchemaBoard)]);
  try {
    assert.equal(result.status, 'failed');
    assert.equal(result.failure.stageId, '04a-integrity');
    assert.match(result.failure.message, /words\[\]/);

    const rejected = JSON.parse(
      readFileSync(
        join(rootDir, runId, 'attempts', result.attemptId, 'stages', '04a-integrity', 'integrity.rejected-1.json'),
        'utf8',
      ),
    );
    assert.equal(rejected.ok, false);
  } finally {
    cleanup();
  }
});

test('a rejected board sends the builder back with the reasons, and the run recovers', async () => {
  const { result, transport, cleanup } = await runWith([
    boardReply(oldSchemaBoard),
    boardReply(board),
  ]);
  try {
    assert.equal(result.status, 'complete', result.failure?.message);

    const builderCalls = transport.calls.filter((c) => c.stageId === '04-board-builder');
    assert.equal(builderCalls.length, 2, 'the builder was not sent back');
    assert.match(builderCalls[1].prompt, /rejected by the mechanical integrity check/);
    assert.match(builderCalls[1].prompt, /words\[\]/);
  } finally {
    cleanup();
  }
});

test('the rebuild loop is bounded — it gives up rather than looping forever', async () => {
  const { result, transport, cleanup } = await runWith([boardReply(oldSchemaBoard)]);
  try {
    assert.equal(result.status, 'failed');
    assert.equal(result.failure.category, TERMINAL_CONTENT);
    const builderCalls = transport.calls.filter((c) => c.stageId === '04-board-builder');
    assert.equal(builderCalls.length, DEFAULT_CONFIG.maxIntegrityRetries + 1);
    assert.match(result.failure.message, /after 2 rebuild\(s\)/);
  } finally {
    cleanup();
  }
});

test('a builder that refuses with insufficientSets fails the gate, not the schema check', async () => {
  const { result, cleanup } = await runWith([
    { text: JSON.stringify({ insufficientSets: 'no usable difficulty-4 set among the candidates' }) },
  ]);
  try {
    assert.equal(result.status, 'failed');
    assert.equal(result.failure.stageId, '04a-integrity');
    assert.match(result.failure.message, /no usable difficulty-4 set/);
  } finally {
    cleanup();
  }
});

test('the gate never spends a request of its own', async () => {
  const { result, transport, rootDir, runId, cleanup } = await runWith([boardReply(board)]);
  try {
    assert.equal(result.status, 'complete');
    assert.equal(transport.calls.some((c) => c.stageId === '04a-integrity'), false);
    assert.equal(
      existsSync(join(rootDir, runId, 'attempts', result.attemptId, 'stages', '04a-integrity', 'request.json')),
      false,
    );
  } finally {
    cleanup();
  }
});

test('the accepted report reaches the adversarial solver, which is who reads it next', async () => {
  const { result, transport, cleanup } = await runWith([boardReply(board)]);
  try {
    assert.equal(result.status, 'complete');
    const solverPrompt = transport.calls.find((c) => c.stageId === '06-adversarial-solver').prompt;
    assert.match(solverPrompt, /"acceptedCount": 16/);
  } finally {
    cleanup();
  }
});

test('the gate runs before the four taste stages, never after', async () => {
  const { transport, cleanup } = await runWith([boardReply(board)]);
  try {
    const order = transport.calls.map((c) => c.stageId);
    const builder = order.indexOf('04-board-builder');
    for (const later of ['05-analogy-validator', '06-adversarial-solver', '07-test-player', '08-style-guide']) {
      assert.ok(order.indexOf(later) > builder, `${later} ran before the board was gated`);
    }
  } finally {
    cleanup();
  }
});
