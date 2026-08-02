// Resume: an interrupted attempt is picked up where it stopped, because
// completed stages are paid-for work. The interruption here is produced by a
// real kill mid-write, not by hand-editing the run directory.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { runPipeline } from '../../../studio/pipeline.js';
import {
  makeStore,
  mockTransport,
  seedRun,
  fastTime,
  storeThatDiesWriting,
} from './helpers.js';

const KILL_AT = '05-analogy-validator';

/**
 * Runs until the store dies writing `KILL_AT`'s validation.json. The attempt
 * is left `running`, stages 01–04a complete, and 05 half-written.
 */
async function interruptedRun() {
  const { store, rootDir, cleanup } = makeStore();
  const runId = seedRun(store);
  const dying = storeThatDiesWriting(store, { stageId: KILL_AT, filename: 'validation.json' });

  await assert.rejects(
    runPipeline({ runId, store: dying, transport: mockTransport(), ...fastTime() }),
    /simulated kill mid-write/,
  );

  const attemptId = store.readManifest(runId).currentAttemptId;
  assert.equal(store.readAttempt(runId, attemptId).status, 'running', 'attempt was not left running');
  return { store, rootDir, runId, attemptId, cleanup };
}

const stagesDir = (rootDir, runId, attemptId) =>
  join(rootDir, runId, 'attempts', attemptId, 'stages');

test('a kill mid-write leaves the attempt running, not silently failed', async () => {
  const { store, runId, attemptId, cleanup } = await interruptedRun();
  try {
    assert.equal(store.readManifest(runId).status, 'running');
    assert.equal(store.readAttempt(runId, attemptId).status, 'running');
  } finally {
    cleanup();
  }
});

test('resuming re-enters at exactly the interrupted stage and finishes the run', async () => {
  const { store, runId, attemptId, cleanup } = await interruptedRun();
  try {
    const transport = mockTransport();
    const result = await runPipeline({ runId, store, transport, ...fastTime() });

    assert.equal(result.status, 'complete', result.failure?.message);
    assert.equal(result.attemptId, attemptId, 'resume started a new attempt');
    assert.equal(result.resumedAt, KILL_AT);
    assert.deepEqual(
      transport.calls.map((call) => call.stageId),
      [KILL_AT, '06-adversarial-solver', '07-test-player', '08-style-guide'],
    );
  } finally {
    cleanup();
  }
});

test('the half-written stage folder is quarantined, never silently deleted', async () => {
  const { store, rootDir, runId, attemptId, cleanup } = await interruptedRun();
  try {
    const dir = stagesDir(rootDir, runId, attemptId);
    // Before: the interrupted stage wrote its request and response but never
    // its validation, so it is genuinely half-written.
    assert.ok(existsSync(join(dir, KILL_AT, 'response.txt')));
    assert.equal(existsSync(join(dir, KILL_AT, 'validation.json')), false);

    await runPipeline({ runId, store, transport: mockTransport(), ...fastTime() });

    const entries = readdirSync(dir);
    assert.ok(entries.includes(`${KILL_AT}.partial-1`), `no quarantine in ${entries.join(', ')}`);
    // The partial response is still readable — nothing was thrown away.
    assert.ok(existsSync(join(dir, `${KILL_AT}.partial-1`, 'response.txt')));
    // …and the stage re-ran cleanly into a fresh folder.
    assert.ok(existsSync(join(dir, KILL_AT, 'validation.json')));
  } finally {
    cleanup();
  }
});

test('the resume is recorded on the attempt', async () => {
  const { store, runId, attemptId, cleanup } = await interruptedRun();
  try {
    await runPipeline({ runId, store, transport: mockTransport(), ...fastTime() });
    const { resumes } = store.readAttempt(runId, attemptId);
    assert.equal(resumes.length, 1);
    assert.equal(resumes[0].reenteredAt, KILL_AT);
  } finally {
    cleanup();
  }
});

test('budget accounting continues cumulatively across the interruption', async () => {
  const { store, runId, attemptId, cleanup } = await interruptedRun();
  try {
    const before = store.readAttempt(runId, attemptId).usage.attempt.requests;
    assert.ok(before > 0, 'the interrupted attempt recorded no spend');

    const result = await runPipeline({ runId, store, transport: mockTransport(), ...fastTime() });
    // Four stages re-ran; the total must include what the first pass spent.
    assert.ok(
      result.usage.attempt.requests > before,
      `resumed spend ${result.usage.attempt.requests} did not build on ${before}`,
    );
  } finally {
    cleanup();
  }
});

test('completed stages are not re-run — that is the whole point', async () => {
  const { store, runId, cleanup } = await interruptedRun();
  try {
    const transport = mockTransport();
    await runPipeline({ runId, store, transport, ...fastTime() });
    for (const done of ['01-pair-author', '02-theme-grouper', '03-difficulty-rater', '04-board-builder']) {
      assert.equal(
        transport.calls.some((call) => call.stageId === done),
        false,
        `${done} was re-run`,
      );
    }
  } finally {
    cleanup();
  }
});

test('fresh: true abandons the interrupted attempt and starts a new one', async () => {
  const { store, runId, attemptId, cleanup } = await interruptedRun();
  try {
    // A running attempt blocks a new one — the interrupted attempt has to be
    // closed out first, which is the honest precondition for --fresh.
    store.completeAttempt(runId, attemptId, { status: 'failed', failureReason: 'abandoned' });
    store.updateStatus(runId, 'failed');

    const transport = mockTransport();
    const result = await runPipeline({ runId, store, transport, fresh: true, ...fastTime() });

    assert.equal(result.status, 'complete', result.failure?.message);
    assert.notEqual(result.attemptId, attemptId);
    assert.equal(transport.calls[0].stageId, '01-pair-author', 'fresh run did not start from stage 01');
  } finally {
    cleanup();
  }
});
