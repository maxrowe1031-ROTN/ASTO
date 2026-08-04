// The Review Studio's route handlers, exercised without a socket.
//
// api.js is deliberately free of node:http so the whole surface — validation,
// status mapping, guard rails — can be tested as plain function calls. The
// server tests cover the wire; these cover the rules.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createApi } from '../../../studio/review/api.js';
import { makeStore } from '../pipeline/helpers.js';

// Deliberately not the real profile strings: the route must report whatever
// the runner holds, and a test that used the live values would still pass if
// api.js reached for pipeline-config.js itself — which is the bug this whole
// endpoint exists to make impossible.
const STUB_CONFIG = { effortProfile: 'stub-profile', pricingVersion: 'stub-pricing' };

// A stub runner: records what it was asked to do, runs nothing.
function stubRunner({ reviseThrows = null, config = STUB_CONFIG } = {}) {
  const calls = { start: [], revise: [] };
  return {
    calls,
    state: new Map(),
    configOf() {
      return config;
    },
    start(runId, options = {}) {
      calls.start.push({ runId, ...options });
    },
    revise(runId, options) {
      if (reviseThrows) throw reviseThrows;
      calls.revise.push({ runId, ...options });
      return '0002';
    },
    stateOf(runId) {
      return this.state.get(runId) ?? null;
    },
  };
}

const BOARD = {
  id: 'asto-lantern',
  title: 'Lantern',
  sets: [
    { id: 'set-a', relationshipLabel: 'A', explanation: 'e', pairs: [['Seed', 'Tree'], ['Spark', 'Fire']], difficulty: 1 },
    { id: 'set-b', relationshipLabel: 'B', explanation: 'e', pairs: [['Brush', 'Painter'], ['Chisel', 'Sculptor']], difficulty: 2 },
    { id: 'set-c', relationshipLabel: 'C', explanation: 'e', pairs: [['Nest', 'Bird'], ['Den', 'Bear']], difficulty: 3 },
    { id: 'set-d', relationshipLabel: 'D', explanation: 'e', pairs: [['Dough', 'Bread'], ['Clay', 'Pottery']], difficulty: 4 },
  ],
};

/** A run parked in awaiting-review with a board — the state Max reviews. */
function seedReviewable(store, { slug = 'lantern', theme = 'Lantern light' } = {}) {
  const { runId } = store.createRun({ slug, theme, brief: { count: 8 } });
  const attemptId = store.createAttempt(runId);
  store.updateStatus(runId, 'running');
  store.writeAttemptArtifact(runId, attemptId, 'board.json', BOARD);
  store.writeStageArtifact(runId, attemptId, '03-difficulty-rater', 'output.json', {
    grades: [{ setId: 'set-a', difficulty: 1, rationale: 'immediate' }],
  });
  store.writeStageArtifact(runId, attemptId, '04a-integrity', 'integrity.json', {
    ok: true,
    acceptedCount: 16,
  });
  store.completeAttempt(runId, attemptId, { status: 'complete' });
  store.updateStatus(runId, 'awaiting-review');
  return { runId, attemptId };
}

const setup = (runnerOptions, apiOptions = {}) => {
  const { store, cleanup } = makeStore();
  const runner = stubRunner(runnerOptions);
  return { store, runner, api: createApi({ store, runner, ...apiOptions }), cleanup };
};

const feedbackEvent = (overrides = {}) => ({
  schemaVersion: '1.0',
  id: 'fb-1',
  attemptId: '0001',
  action: 'reject-set',
  scope: { type: 'set', setId: 'set-c' },
  tags: ['relationship-does-not-click'],
  note: 'Category, not a relationship.',
  ...overrides,
});

// --- reads ---

test('GET /api/config reports the settings the runner is holding', async () => {
  const { api, cleanup } = setup({
    config: { effortProfile: 'held-by-this-server', pricingVersion: '1999-01-01' },
  });
  try {
    const { status, body } = await api.handle({ method: 'GET', path: '/api/config' });
    assert.equal(status, 200);
    // The runner's values, not pipeline-config.js's — a server that started
    // before a config change must keep reporting what it will actually run at.
    assert.deepEqual(body, { effortProfile: 'held-by-this-server', pricingVersion: '1999-01-01' });
  } finally {
    cleanup();
  }
});

test('POST /api/config is not a route — settings are read-only here', async () => {
  const { api, cleanup } = setup();
  try {
    const { status, body } = await api.handle({ method: 'POST', path: '/api/config', body: {} });
    assert.equal(status, 405);
    assert.match(body.error, /not allowed/);
  } finally {
    cleanup();
  }
});

test('GET /api/runs summarises every run, newest first', async () => {
  const { store, api, cleanup } = setup();
  try {
    seedReviewable(store, { slug: 'first' });
    seedReviewable(store, { slug: 'second' });

    const { status, body } = await api.handle({ method: 'GET', path: '/api/runs' });
    assert.equal(status, 200);
    assert.equal(body.runs.length, 2);
    assert.deepEqual(Object.keys(body.runs[0]).sort(), [
      'attemptCount', 'createdAt', 'currentAttemptId', 'revisionCount', 'runId', 'status', 'theme',
    ]);
    assert.ok(body.runs[0].runId > body.runs[1].runId, 'not newest-first');
  } finally {
    cleanup();
  }
});

test('GET /api/runs/:runId returns the manifest, attempts, decisions and feedback', async () => {
  const { store, api, cleanup } = setup();
  try {
    const { runId, attemptId } = seedReviewable(store);
    store.appendDecision(runId, { type: 'attempt-completed', attemptId });

    const { status, body } = await api.handle({ method: 'GET', path: `/api/runs/${runId}` });
    assert.equal(status, 200);
    assert.equal(body.manifest.status, 'awaiting-review');
    assert.equal(body.attempts[0].attemptId, attemptId);
    assert.equal(body.decisions.length, 1);
    assert.deepEqual(body.feedback, []);
  } finally {
    cleanup();
  }
});

test('GET an attempt returns the board and the agent reports the UI shows', async () => {
  const { store, api, cleanup } = setup();
  try {
    const { runId, attemptId } = seedReviewable(store);

    const { status, body } = await api.handle({
      method: 'GET',
      path: `/api/runs/${runId}/attempts/${attemptId}`,
    });
    assert.equal(status, 200);
    assert.equal(body.board.title, 'Lantern');
    assert.equal(body.reports['03-difficulty-rater'].grades.length, 1);
    assert.equal(body.reports['04a-integrity'].acceptedCount, 16);
    // Absent artifacts are absent, not errors — most runs have no failure.
    assert.equal(body.failure, undefined);
  } finally {
    cleanup();
  }
});

test('an unknown run is 404, not 500', async () => {
  const { api, cleanup } = setup();
  try {
    const missing = '2026-08-02T12-00-00.000Z-nope';
    assert.equal((await api.handle({ method: 'GET', path: `/api/runs/${missing}` })).status, 404);
    assert.equal(
      (await api.handle({ method: 'GET', path: `/api/runs/${missing}/attempts/0001` })).status,
      404,
    );
  } finally {
    cleanup();
  }
});

test('a malformed run id is 400 and never reaches the store', async () => {
  const { api, cleanup } = setup();
  try {
    for (const bad of ['../../etc/passwd', 'not-a-run-id', 'x'.repeat(300)]) {
      const { status } = await api.handle({ method: 'GET', path: `/api/runs/${encodeURIComponent(bad)}` });
      assert.equal(status, 400, bad);
    }
  } finally {
    cleanup();
  }
});

test('an unknown route is 404', async () => {
  const { api, cleanup } = setup();
  try {
    assert.equal((await api.handle({ method: 'GET', path: '/api/nope' })).status, 404);
    assert.equal((await api.handle({ method: 'DELETE', path: '/api/runs' })).status, 405);
  } finally {
    cleanup();
  }
});

// --- starting runs ---

test('POST /api/runs creates the run and starts it, answering 202 immediately', async () => {
  const { api, runner, cleanup } = setup();
  try {
    const { status, body } = await api.handle({
      method: 'POST',
      path: '/api/runs',
      body: { theme: 'Lantern light', mock: true },
    });
    assert.equal(status, 202);
    assert.match(body.runId, /-lantern-light$/);
    assert.deepEqual(runner.calls.start, [{ runId: body.runId, mock: true }]);
  } finally {
    cleanup();
  }
});

// Surprise-me picks a SUBJECT as well as a shape brief. Both surprise-me
// boards Max judged were rejected for the same reason — "no overall theme here.
// goes from money to animals to geology" — while every themed board was
// approved. Shape variety was never the missing ingredient.
test('a themeless run picks a subject, and still slugs as surprise-me', async () => {
  const { store, api, cleanup } = setup({}, { chooseSubject: () => 'clocks and time' });
  try {
    const { status, body } = await api.handle({ method: 'POST', path: '/api/runs', body: { mock: true } });
    assert.equal(status, 202);
    // The slug stays surprise-me: it is how the run was STARTED, and the run
    // list still reads as a surprise-me run in the id.
    assert.match(body.runId, /-surprise-me$/);
    const manifest = store.readManifest(body.runId);
    assert.equal(manifest.theme, 'clocks and time');
    // ...and it keeps the shape steering it already had. Subject AND variety.
    assert.ok(Array.isArray(manifest.brief.relationshipShapes));
    assert.ok(manifest.brief.relationshipShapes.length > 0);
  } finally {
    cleanup();
  }
});

test('a run with an explicit theme is left alone — no subject is picked over it', async () => {
  const { store, api, cleanup } = setup({}, { chooseSubject: () => 'should not be used' });
  try {
    const { body } = await api.handle({
      method: 'POST',
      path: '/api/runs',
      body: { theme: 'Lantern light', mock: true },
    });
    assert.equal(store.readManifest(body.runId).theme, 'Lantern light');
  } finally {
    cleanup();
  }
});

test('every subject in the list is usable as a theme', async () => {
  const { SUBJECTS } = await import('../../../studio/corpus/subjects.js');
  assert.ok(SUBJECTS.length >= 20, 'too few subjects to feel like a surprise');
  assert.equal(new Set(SUBJECTS).size, SUBJECTS.length, 'duplicate subject');
  for (const subject of SUBJECTS) {
    assert.equal(typeof subject, 'string');
    assert.ok(subject.trim().length > 0);
  }
});

test('a themeless run is surprise-me, and still gets a slug', async () => {
  const { api, cleanup } = setup();
  try {
    const { status, body } = await api.handle({ method: 'POST', path: '/api/runs', body: { mock: true } });
    assert.equal(status, 202);
    assert.match(body.runId, /-surprise-me$/);
  } finally {
    cleanup();
  }
});

test('POST /api/runs rejects a bad body without creating anything', async () => {
  const { store, api, cleanup } = setup();
  try {
    for (const body of [
      { theme: 42 },
      { count: 1 },
      { count: 99 },
      // A board is four sets of two pairs. Anything under the floor cannot
      // produce one: the grouper always sets some pairs aside, and a run that
      // was arithmetically doomed at the brief still pays for the rater and
      // every board-builder attempt before anyone finds out (2026-08-03, a
      // real run — 8 pairs, 2 set aside, 3 sets, $0.16).
      { count: 8 },
      { count: 11 },
      { slug: '../escape' },
      { surprise: true },
      'not an object',
    ]) {
      const { status } = await api.handle({ method: 'POST', path: '/api/runs', body });
      assert.equal(status, 400, JSON.stringify(body));
    }
    assert.deepEqual(store.listRuns(), []);
  } finally {
    cleanup();
  }
});

test('resume restarts an existing run through the same machinery', async () => {
  const { store, api, runner, cleanup } = setup();
  try {
    const { runId } = seedReviewable(store);
    const { status } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}`,
      body: { action: 'resume', fresh: true },
    });
    assert.equal(status, 202);
    assert.deepEqual(runner.calls.start, [{ runId, fresh: true }]);
  } finally {
    cleanup();
  }
});

// --- revisions ---

test('POST a revision re-enters at the requested stage', async () => {
  const { store, api, runner, cleanup } = setup();
  try {
    const { runId } = seedReviewable(store);
    const { status, body } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/revisions`,
      body: { fromStage: '04-board-builder', notes: 'Red set is weak' },
    });
    assert.equal(status, 202);
    assert.equal(body.attemptId, '0002');
    assert.equal(runner.calls.revise[0].fromStage, '04-board-builder');
  } finally {
    cleanup();
  }
});

test('a revision from an unknown stage is 400', async () => {
  const { store, api, cleanup } = setup();
  try {
    const { runId } = seedReviewable(store);
    const { status } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/revisions`,
      body: { fromStage: 'nope', notes: '' },
    });
    assert.equal(status, 400);
  } finally {
    cleanup();
  }
});

test('a revision scoped to a set that is not on the board is 400', async () => {
  const { store, api, cleanup } = setup();
  try {
    const { runId } = seedReviewable(store);
    const { status } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/revisions`,
      body: { fromStage: '04-board-builder', scope: { type: 'set', setId: 'set-invented' } },
    });
    assert.equal(status, 400);
  } finally {
    cleanup();
  }
});

test('the revision limit surfaces as 409, not 500', async () => {
  const { StudioFailure } = await import('../../../studio/failures.js');
  const { store, api, cleanup } = setup({
    reviseThrows: new StudioFailure('terminal-content', 'revision limit reached: 3 of 3'),
  });
  try {
    const { runId } = seedReviewable(store);
    const { status, body } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/revisions`,
      body: { fromStage: '04-board-builder' },
    });
    assert.equal(status, 409);
    assert.match(body.error, /revision limit/);
  } finally {
    cleanup();
  }
});

// --- feedback ---

test('POST feedback validates every event and appends them', async () => {
  const { store, api, cleanup } = setup();
  try {
    const { runId } = seedReviewable(store);
    const { status, body } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/feedback`,
      body: { events: [feedbackEvent(), feedbackEvent({ id: 'fb-2', scope: { type: 'board' }, action: 'approve-board' })] },
    });
    assert.equal(status, 200);
    assert.equal(body.count, 2);
    assert.equal(store.readFeedback(runId).length, 2);
  } finally {
    cleanup();
  }
});

test('an invalid event rejects the whole batch — no partial writes', async () => {
  const { store, api, cleanup } = setup();
  try {
    const { runId } = seedReviewable(store);
    const { status, body } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/feedback`,
      body: { events: [feedbackEvent(), feedbackEvent({ id: 'fb-2', tags: ['invented-tag'] })] },
    });
    assert.equal(status, 400);
    assert.ok(body.errors.length > 0);
    assert.deepEqual(store.readFeedback(runId), [], 'the valid event was written anyway');
  } finally {
    cleanup();
  }
});

test('feedback naming a set that is not on the board is 400', async () => {
  const { store, api, cleanup } = setup();
  try {
    const { runId } = seedReviewable(store);
    const { status } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/feedback`,
      body: { events: [feedbackEvent({ scope: { type: 'set', setId: 'set-ghost' } })] },
    });
    assert.equal(status, 400);
  } finally {
    cleanup();
  }
});

test('feedback for a superseded attempt is 409 — the stale-tab guard', async () => {
  const { store, api, cleanup } = setup();
  try {
    const { runId } = seedReviewable(store);
    const { status, body } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/feedback`,
      body: { events: [feedbackEvent({ attemptId: '0007' })] },
    });
    assert.equal(status, 409);
    assert.match(body.error, /0007/);
  } finally {
    cleanup();
  }
});

// --- decisions ---

test('approve records the decision and moves the run', async () => {
  const { store, api, cleanup } = setup();
  try {
    const { runId, attemptId } = seedReviewable(store);
    const { status, body } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/approve`,
      body: { feedback: [feedbackEvent({ action: 'approve-board', scope: { type: 'board' } })] },
    });

    assert.equal(status, 200);
    assert.equal(body.status, 'approved');
    assert.equal(store.readManifest(runId).status, 'approved');
    const decision = store.readDecisions(runId).find((d) => d.type === 'approve');
    assert.equal(decision.attemptId, attemptId);
    assert.equal(store.readFeedback(runId).length, 1);
  } finally {
    cleanup();
  }
});

test('approving twice is 409 — the transition map is the guard', async () => {
  const { store, api, cleanup } = setup();
  try {
    const { runId } = seedReviewable(store);
    await api.handle({ method: 'POST', path: `/api/runs/${runId}/approve`, body: {} });
    const { status } = await api.handle({ method: 'POST', path: `/api/runs/${runId}/approve`, body: {} });
    assert.equal(status, 409);
  } finally {
    cleanup();
  }
});

test('reject works the same way and lands a rejected status', async () => {
  const { store, api, cleanup } = setup();
  try {
    const { runId } = seedReviewable(store);
    const { status } = await api.handle({ method: 'POST', path: `/api/runs/${runId}/reject`, body: {} });
    assert.equal(status, 200);
    assert.equal(store.readManifest(runId).status, 'rejected');
  } finally {
    cleanup();
  }
});

test('a decision on a run that is still running is 409', async () => {
  const { store, api, cleanup } = setup();
  try {
    const { runId } = store.createRun({ slug: 'busy' });
    store.updateStatus(runId, 'running');
    const { status } = await api.handle({ method: 'POST', path: `/api/runs/${runId}/approve`, body: {} });
    assert.equal(status, 409);
  } finally {
    cleanup();
  }
});

test('no response ever carries a secret-shaped field', async () => {
  const { store, api, cleanup } = setup();
  try {
    const { runId, attemptId } = seedReviewable(store);
    for (const path of ['/api/runs', `/api/runs/${runId}`, `/api/runs/${runId}/attempts/${attemptId}`]) {
      const { body } = await api.handle({ method: 'GET', path });
      const text = JSON.stringify(body);
      assert.equal(/apiKey|api_key|ANTHROPIC/i.test(text), false, path);
    }
  } finally {
    cleanup();
  }
});

test('POST /api/runs accepts a count with slack for pairs the grouper discards', async () => {
  const { api, cleanup } = setup();
  try {
    const { status } = await api.handle({ method: 'POST', path: '/api/runs', body: { count: 12 } });
    assert.equal(status, 202);
  } finally {
    cleanup();
  }
});
