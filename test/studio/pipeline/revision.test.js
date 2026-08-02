// Revisions: a child attempt re-enters at a chosen stage, references the
// parent's earlier work instead of re-running it, and leaves the parent
// untouched. The complete editorial path A → B has to stay readable.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runPipeline, requestRevision } from '../../../studio/pipeline.js';
import { DEFAULT_CONFIG } from '../../../studio/pipeline-config.js';
import { makeStore, mockTransport, seedRun, fastTime, hashTree } from './helpers.js';

const FROM = '04-board-builder';

// A completed run, ready to be revised.
async function completedRun() {
  const { store, rootDir, cleanup } = makeStore();
  const runId = seedRun(store);
  const first = await runPipeline({
    runId,
    store,
    transport: mockTransport(),
    ...fastTime(),
  });
  assert.equal(first.status, 'complete', first.failure?.message);
  return { store, rootDir, runId, first, cleanup };
}

const attemptDir = (rootDir, runId, attemptId) => join(rootDir, runId, 'attempts', attemptId);

test('a revision creates a child attempt that re-enters at the requested stage', async () => {
  const { store, runId, first, cleanup } = await completedRun();
  try {
    const childId = requestRevision(store, runId, { fromStage: FROM, notes: 'Red set is weak' });
    assert.notEqual(childId, first.attemptId);

    const child = store.readAttempt(runId, childId);
    assert.equal(child.parentAttemptId, first.attemptId);
    assert.equal(child.startingStage, FROM);
    assert.equal(store.readManifest(runId).revisionCount, 1);
  } finally {
    cleanup();
  }
});

test('a revision refuses a stage the registry does not know', async () => {
  const { store, runId, cleanup } = await completedRun();
  try {
    assert.throws(() => requestRevision(store, runId, { fromStage: 'nope' }), /unknown stage id/);
  } finally {
    cleanup();
  }
});

test('running a revision re-runs from the entry stage forward and nothing before it', async () => {
  const { store, runId, cleanup } = await completedRun();
  try {
    requestRevision(store, runId, { fromStage: FROM, notes: 'try a warmer black set' });
    const transport = mockTransport();
    const result = await runPipeline({ runId, store, transport, ...fastTime() });

    assert.equal(result.status, 'complete', result.failure?.message);
    assert.deepEqual(
      transport.calls.map((call) => call.stageId),
      ['04-board-builder', '05-analogy-validator', '06-adversarial-solver', '07-test-player', '08-style-guide'],
    );
  } finally {
    cleanup();
  }
});

test('the revision sees the parent\'s earlier outputs — reused, never re-derived', async () => {
  const { store, rootDir, runId, first, cleanup } = await completedRun();
  try {
    const childId = requestRevision(store, runId, { fromStage: FROM });
    const transport = mockTransport();
    await runPipeline({ runId, store, transport, ...fastTime() });

    // The builder's prompt is assembled from stages 02 and 03, which only the
    // parent ran — so their content must have been read back.
    const builderPrompt = transport.calls.find((c) => c.stageId === FROM).prompt;
    assert.match(builderPrompt, /Seed/);

    // Reused stages are referenced, not copied into the child.
    for (const stageId of ['01-pair-author', '02-theme-grouper', '03-difficulty-rater']) {
      assert.equal(
        existsSync(join(attemptDir(rootDir, runId, childId), 'stages', stageId)),
        false,
        `${stageId} was copied into the child`,
      );
    }
    const reused = JSON.parse(
      readFileSync(join(attemptDir(rootDir, runId, childId), 'parent-attempt.json'), 'utf8'),
    );
    assert.equal(reused.parentAttemptId, first.attemptId);
    assert.deepEqual(reused.reusedStages, [
      '01-pair-author',
      '02-theme-grouper',
      '03-difficulty-rater',
    ]);
  } finally {
    cleanup();
  }
});

test('the parent attempt is byte-identical after the revision runs', async () => {
  const { store, rootDir, runId, first, cleanup } = await completedRun();
  try {
    const parentDir = attemptDir(rootDir, runId, first.attemptId);
    const before = hashTree(parentDir);

    requestRevision(store, runId, { fromStage: FROM });
    await runPipeline({ runId, store, transport: mockTransport(), ...fastTime() });

    assert.equal(hashTree(parentDir), before, 'the parent attempt was modified');
  } finally {
    cleanup();
  }
});

test('the revision records why it was asked for', async () => {
  const { store, rootDir, runId, cleanup } = await completedRun();
  try {
    const childId = requestRevision(store, runId, {
      fromStage: FROM,
      notes: 'The Red set reads as a category, not a relationship.',
      scope: 'sets',
    });
    const revision = JSON.parse(
      readFileSync(join(attemptDir(rootDir, runId, childId), 'revision.json'), 'utf8'),
    );
    assert.equal(revision.fromStage, FROM);
    assert.match(revision.notes, /reads as a category/);
    assert.equal(revision.scope, 'sets');

    const logged = store.readDecisions(runId).find((d) => d.type === 'revision-requested');
    assert.equal(logged.fromStage, FROM);
  } finally {
    cleanup();
  }
});

test('revisions are bounded — the limit stops the loop', async () => {
  const { store, runId, cleanup } = await completedRun();
  try {
    for (let i = 0; i < DEFAULT_CONFIG.maxRevisions; i += 1) {
      requestRevision(store, runId, { fromStage: FROM });
      await runPipeline({ runId, store, transport: mockTransport(), ...fastTime() });
    }
    assert.throws(
      () => requestRevision(store, runId, { fromStage: FROM }),
      /revision limit reached: 3 of 3/,
    );
  } finally {
    cleanup();
  }
});

test('the run\'s spend accumulates across attempts rather than resetting', async () => {
  const { store, runId, first, cleanup } = await completedRun();
  try {
    const parentSpend = store.readAttempt(runId, first.attemptId).usage.attempt.requests;
    requestRevision(store, runId, { fromStage: FROM });
    const result = await runPipeline({ runId, store, transport: mockTransport(), ...fastTime() });

    assert.ok(result.usage.run.requests > parentSpend, 'run scope restarted');
    assert.ok(result.usage.attempt.requests < result.usage.run.requests, 'attempt scope did not restart');
  } finally {
    cleanup();
  }
});
