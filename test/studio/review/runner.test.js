// The runner: the server's only door to the pipeline.
//
// A pipeline run takes minutes, so the HTTP layer answers 202 and the run
// continues in-process. That makes three things the runner's job: knowing
// what is in flight, refusing to start the same run twice, and catching a
// crash that the pipeline itself would let escape (a StudioFailure is
// recorded by the pipeline; a bug is not).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRunner } from '../../../studio/review/runner.js';
import { makeStore, mockTransport, seedRun, fastTime } from '../pipeline/helpers.js';

const setup = ({ makeTransport } = {}) => {
  const { store, cleanup } = makeStore();
  const runner = createRunner({
    store,
    makeTransport: makeTransport ?? (() => mockTransport()),
    pipelineOptions: fastTime(),
  });
  return { store, runner, cleanup };
};

test('start runs the pipeline to completion in the background', async () => {
  const { store, runner, cleanup } = setup();
  try {
    const runId = seedRun(store);
    runner.start(runId, { mock: true });

    const result = await runner.settled(runId);
    assert.equal(result.status, 'complete', result.failure?.message);
    assert.equal(store.readManifest(runId).status, 'awaiting-review');
  } finally {
    cleanup();
  }
});

test('start returns immediately — it does not await the run', async () => {
  const { store, runner, cleanup } = setup();
  try {
    const runId = seedRun(store);
    runner.start(runId, { mock: true });
    // Nothing has been awaited yet, so the run cannot have finished.
    assert.equal(runner.stateOf(runId).running, true);
    await runner.settled(runId);
  } finally {
    cleanup();
  }
});

test('stateOf reports running, then the outcome', async () => {
  const { store, runner, cleanup } = setup();
  try {
    const runId = seedRun(store);
    assert.equal(runner.stateOf(runId), null, 'a never-started run has no in-process state');

    runner.start(runId, { mock: true });
    assert.equal(runner.stateOf(runId).running, true);

    await runner.settled(runId);
    const state = runner.stateOf(runId);
    assert.equal(state.running, false);
    assert.equal(state.status, 'complete');
    assert.equal(state.error, undefined);
  } finally {
    cleanup();
  }
});

test('starting a run that is already in flight throws — one driver at a time', async () => {
  const { store, runner, cleanup } = setup();
  try {
    const runId = seedRun(store);
    runner.start(runId, { mock: true });
    assert.throws(() => runner.start(runId, { mock: true }), /already running/);
    await runner.settled(runId);
  } finally {
    cleanup();
  }
});

test('once settled, the same run can be started again', async () => {
  const { store, runner, cleanup } = setup();
  try {
    const runId = seedRun(store);
    runner.start(runId, { mock: true });
    await runner.settled(runId);
    assert.doesNotThrow(() => runner.start(runId, { mock: true, fresh: true }));
    await runner.settled(runId);
  } finally {
    cleanup();
  }
});

test('a crash inside the pipeline is captured, not swallowed and not thrown at the caller', async () => {
  const exploding = () => {
    throw new Error('transport construction blew up');
  };
  const { store, runner, cleanup } = setup({ makeTransport: exploding });
  try {
    const runId = seedRun(store);
    // Transport construction happens up front, so this one surfaces synchronously.
    assert.throws(() => runner.start(runId, {}), /transport construction blew up/);
    assert.equal(runner.stateOf(runId), null, 'a run that never started left no state');
  } finally {
    cleanup();
  }
});

test('a failure inside the run is recorded as an outcome, not an error', async () => {
  const { store, runner, cleanup } = setup({
    makeTransport: () => async () => {
      throw Object.assign(new Error('bad request'), { status: 400 });
    },
  });
  try {
    const runId = seedRun(store);
    runner.start(runId, {});
    const result = await runner.settled(runId);

    assert.equal(result.status, 'failed');
    assert.equal(runner.stateOf(runId).status, 'failed');
    assert.equal(runner.stateOf(runId).error, undefined, 'a recorded failure is not a crash');
    assert.equal(store.readManifest(runId).status, 'failed');
  } finally {
    cleanup();
  }
});

test('an unexpected throw mid-run lands on the state as an error', async () => {
  const { store, cleanup } = makeStore();
  const runner = createRunner({
    store,
    makeTransport: () => mockTransport(),
    pipelineOptions: fastTime(),
    // A store proxy that dies on a write the pipeline does not expect to fail.
    wrapStore: (s) => ({
      ...s,
      writeAttemptArtifact() {
        throw new Error('disk went away');
      },
    }),
  });
  try {
    const runId = seedRun(store);
    runner.start(runId, { mock: true });
    await runner.settled(runId).catch(() => {});

    const state = runner.stateOf(runId);
    assert.equal(state.running, false);
    assert.match(state.error, /disk went away/);
  } finally {
    cleanup();
  }
});

test('a revision inherits the run\'s transport — a mock run stays a mock run', async () => {
  const { store, cleanup } = makeStore();
  const seen = [];
  const runner = createRunner({
    store,
    makeTransport: ({ mock }) => {
      seen.push(mock);
      if (!mock) throw new Error('ANTHROPIC_API_KEY is not set');
      return mockTransport();
    },
    pipelineOptions: fastTime(),
  });
  try {
    // A run recorded as mock — the way the API creates one.
    const { runId } = store.createRun({ slug: 'lantern', brief: { count: 8, mock: true } });
    runner.start(runId, { mock: true });
    await runner.settled(runId);

    runner.revise(runId, { fromStage: '04-board-builder', notes: 'again' });
    await runner.settled(runId);

    assert.deepEqual(seen, [true, true], 'the revision reached for the real transport');
  } finally {
    cleanup();
  }
});

test('a revision that cannot build a transport creates no child attempt', async () => {
  const { store, cleanup } = makeStore();
  let allow = true;
  const runner = createRunner({
    store,
    makeTransport: () => {
      if (!allow) throw new Error('ANTHROPIC_API_KEY is not set');
      return mockTransport();
    },
    pipelineOptions: fastTime(),
  });
  try {
    const { runId } = store.createRun({ slug: 'lantern', brief: { count: 8, mock: true } });
    runner.start(runId, { mock: true });
    await runner.settled(runId);

    allow = false;
    assert.throws(
      () => runner.revise(runId, { fromStage: '04-board-builder', notes: 'x' }),
      /ANTHROPIC_API_KEY/,
    );

    // The run must be exactly as it was: no orphan attempt, no wedged status.
    const manifest = store.readManifest(runId);
    assert.equal(manifest.attemptCount, 1, 'a child attempt was left behind');
    assert.equal(manifest.status, 'awaiting-review', `run wedged in ${manifest.status}`);
  } finally {
    cleanup();
  }
});

test('revise opens the child attempt and runs it', async () => {
  const { store, runner, cleanup } = setup();
  try {
    const runId = seedRun(store);
    runner.start(runId, { mock: true });
    await runner.settled(runId);

    const attemptId = runner.revise(runId, { fromStage: '04-board-builder', notes: 'weak red set' });
    assert.equal(attemptId, '0002');

    const result = await runner.settled(runId);
    assert.equal(result.status, 'complete', result.failure?.message);
    assert.equal(store.readAttempt(runId, '0002').parentAttemptId, '0001');
  } finally {
    cleanup();
  }
});
