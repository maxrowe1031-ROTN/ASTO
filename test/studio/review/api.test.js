// The Review Studio's route handlers, exercised without a socket.
//
// api.js is deliberately free of node:http so the whole surface — validation,
// status mapping, guard rails — can be tested as plain function calls. The
// server tests cover the wire; these cover the rules.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApi } from '../../../studio/review/api.js';
import { proposalFailureFile, proposalFile } from '../../../studio/review/proposer.js';
import { createPuzzleStore } from '../../../studio/storage/puzzle-store.js';
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
test('a themeless run picks a subject, and the run id is named after it', async () => {
  const { store, api, cleanup } = setup({}, { chooseSubject: () => 'clocks and time' });
  try {
    const { status, body } = await api.handle({ method: 'POST', path: '/api/runs', body: { mock: true } });
    assert.equal(status, 202);
    // The id follows the SUBJECT, not the door the run came in through. It
    // said 'surprise-me' for a few hours on 2026-08-04 and Max caught it: the
    // run id is the folder on disk and the line you scan in the run list, and
    // "surprise-me" says nothing once a subject has been drawn.
    assert.match(body.runId, /-clocks-and-time$/);
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

test('a themeless run still gets a filesystem-safe slug, whatever was drawn', async () => {
  // Every subject in the list has to survive slugification into a run id the
  // store will accept — a subject with a slash or a quote in it would create a
  // run nobody can open.
  const { SUBJECTS } = await import('../../../studio/corpus/subjects.js');
  for (const subject of SUBJECTS) {
    const { api, cleanup } = setup({}, { chooseSubject: () => subject });
    try {
      const { status, body } = await api.handle({
        method: 'POST',
        path: '/api/runs',
        body: { mock: true },
      });
      assert.equal(status, 202, subject);
      assert.match(body.runId, /^\d{4}-\d{2}-\d{2}T[\d-]+\.\d{3}Z-[a-z0-9][a-z0-9-]*$/, subject);
    } finally {
      cleanup();
    }
  }
});

test('an explicit slug still wins over the drawn subject', async () => {
  const { api, cleanup } = setup({}, { chooseSubject: () => 'clocks and time' });
  try {
    const { body } = await api.handle({
      method: 'POST',
      path: '/api/runs',
      body: { slug: 'my-own-name', mock: true },
    });
    assert.match(body.runId, /-my-own-name$/);
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

// --- publishing ---
//
// Approval used to be the end of the line: a board Max liked stayed in its run
// directory and never reached the game. Publishing is the step that closes
// that loop, and the rules it has to keep are that only an approved board can
// take it, that publication is recorded rather than transitioned, and that the
// puzzle store's refusals are honoured rather than reinterpreted here.

const withPuzzles = (runnerOptions) => {
  const puzzlesDir = mkdtempSync(join(tmpdir(), 'asto-api-puzzles-'));
  const base = setup(runnerOptions, { puzzles: createPuzzleStore({ rootDir: puzzlesDir }) });
  return {
    ...base,
    puzzlesDir,
    cleanup: () => {
      rmSync(puzzlesDir, { recursive: true, force: true });
      base.cleanup();
    },
  };
};

const approve = (api, runId) =>
  api.handle({ method: 'POST', path: `/api/runs/${runId}/approve`, body: {} });

// The board's TITLE, not the run's slug. A run slug is a lifecycle name —
// `beach-retry` records that the first beach run truncated — and publishing
// under it would make the game's permanent content ids remember the Studio's
// accidents.
test('an approved board is published under its title, not the run slug', async () => {
  const { store, api, puzzlesDir, cleanup } = withPuzzles();
  try {
    const { runId } = seedReviewable(store, { slug: 'beach-retry' }); // board title: "Lantern"
    await approve(api, runId);

    const { status, body } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/publish`,
      body: {},
    });

    assert.equal(status, 200);
    assert.equal(body.published.filename, 'lantern.json');
    assert.equal(body.published.id, 'asto-lantern');
    assert.ok(existsSync(join(puzzlesDir, 'lantern.json')), 'nothing was written');
    assert.ok(!existsSync(join(puzzlesDir, 'beach-retry.json')), 'the run slug reached the game');
  } finally {
    cleanup();
  }
});

test('an explicit slug overrides the title', async () => {
  const { store, api, cleanup } = withPuzzles();
  try {
    const { runId } = seedReviewable(store, { slug: 'beach-retry' });
    await approve(api, runId);
    const { status, body } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/publish`,
      body: { slug: 'by-the-shore' },
    });
    assert.equal(status, 200);
    assert.equal(body.published.id, 'asto-by-the-shore');
  } finally {
    cleanup();
  }
});

test('publication is recorded in decisions.jsonl, and the run stays approved', async () => {
  const { store, api, cleanup } = withPuzzles();
  try {
    const { runId } = seedReviewable(store, { slug: 'batman' });
    await approve(api, runId);
    await api.handle({ method: 'POST', path: `/api/runs/${runId}/publish`, body: {} });

    // No new status: `approved → archived` is still the only move out.
    assert.equal(store.readManifest(runId).status, 'approved');

    const record = store.readDecisions(runId).find((event) => event.type === 'publish');
    assert.ok(record, 'publication left no record');
    assert.equal(record.publishedAs, 'lantern.json');
    assert.equal(record.publishedId, 'asto-lantern');
    // Provenance the puzzle file deliberately does not carry.
    assert.equal(record.boardId, 'asto-lantern');
    assert.equal(record.attemptId, '0001');
    assert.equal(record.republished, false);
  } finally {
    cleanup();
  }
});

test('a run that has not been approved cannot be published', async () => {
  const { store, api, puzzlesDir, cleanup } = withPuzzles();
  try {
    const { runId } = seedReviewable(store, { slug: 'batman' }); // awaiting-review
    const { status, body } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/publish`,
      body: {},
    });

    assert.equal(status, 409);
    assert.match(body.error, /only an approved run/);
    assert.deepEqual(readdirSync(puzzlesDir), [], 'an unapproved board reached puzzles/');
  } finally {
    cleanup();
  }
});

test('a rejected run cannot be published either', async () => {
  const { store, api, cleanup } = withPuzzles();
  try {
    const { runId } = seedReviewable(store, { slug: 'spy' });
    await api.handle({ method: 'POST', path: `/api/runs/${runId}/reject`, body: {} });
    const { status } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/publish`,
      body: {},
    });
    assert.equal(status, 409);
  } finally {
    cleanup();
  }
});

// The republish signal is the run's own publish record, not a flag from the
// page: a tab that has been open a while must not be able to claim a slug it
// never published.
test('a run republishing its own slug replaces; another run claiming it is 409', async () => {
  const { store, api, cleanup } = withPuzzles();
  try {
    const { runId: first } = seedReviewable(store, { slug: 'batman' });
    await approve(api, first);
    await api.handle({ method: 'POST', path: `/api/runs/${first}/publish`, body: {} });

    const again = await api.handle({ method: 'POST', path: `/api/runs/${first}/publish`, body: {} });
    assert.equal(again.status, 200, 'a run could not republish its own board');
    assert.equal(
      store.readDecisions(first).filter((event) => event.type === 'publish').at(-1).republished,
      true,
    );

    // A second run whose board carries the same title lands on the same slug —
    // the realistic collision, since two runs on one theme is how retries work.
    const { runId: second } = seedReviewable(store, { slug: 'other' });
    await approve(api, second);
    const collision = await api.handle({
      method: 'POST',
      path: `/api/runs/${second}/publish`,
      body: {},
    });
    assert.equal(collision.status, 409);
    assert.equal(collision.body.reason, 'occupied');
  } finally {
    cleanup();
  }
});

test('a malformed slug is a bad request, not a conflict', async () => {
  const { store, api, cleanup } = withPuzzles();
  try {
    const { runId } = seedReviewable(store, { slug: 'batman' });
    await approve(api, runId);
    const { status, body } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/publish`,
      body: { slug: '../../etc/passwd' },
    });
    assert.equal(status, 400);
    assert.equal(body.reason, 'bad-slug');
  } finally {
    cleanup();
  }
});

test('publish takes no fields beyond an optional slug', async () => {
  const { store, api, cleanup } = withPuzzles();
  try {
    const { runId } = seedReviewable(store, { slug: 'batman' });
    await approve(api, runId);
    const { status, body } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/publish`,
      body: { slug: 'batman', id: 'asto-something-else' },
    });
    assert.equal(status, 400);
    assert.match(body.error, /unknown field: id/);
  } finally {
    cleanup();
  }
});

// --- the cross-board steers reach themed runs too (design.md D-8, D-13) ---
//
// Themed runs once received nothing from the variety index except stance quotas
// — `relationshipShapes` is what marks a run as surprise-me. But a steer is
// about a rut across boards, not about subject matter, so it belongs on every
// run. D-13's stance steer was the field that proved it: it was added to the
// variety brief and reached surprise-me runs only, while every board Max was
// complaining about was themed.
//
// `variety.js` now answers both doors, so what this suite checks is the wiring:
// the themed branch calls the themed builder and the manifest keeps what it
// returns.

test('a themed run carries both steers but not the surprise-me shapes', async () => {
  const { api, cleanup } = setup(undefined, {
    buildThemed: () => ({
      count: 14,
      stanceQuotas: ['inclusion', 'time', 'event', 'possession'],
      varyHardestFrom: 'vocabulary',
      hardestStanceAsk: ['absence', 'dimension'],
      hardestStanceLean: 'time',
    }),
  });
  try {
    const { status } = await api.handle({
      method: 'POST',
      path: '/api/runs',
      body: { theme: 'caves', count: 14 },
    });
    assert.equal(status, 202);
    const { body } = await api.handle({ method: 'GET', path: '/api/runs' });
    const runId = body.runs[0].runId;
    const detail = await api.handle({ method: 'GET', path: `/api/runs/${runId}` });
    const { brief } = detail.body.manifest;

    assert.equal(brief.varyHardestFrom, 'vocabulary', 'the difficulty steer did not reach a themed run');
    assert.deepEqual(brief.hardestStanceAsk, ['absence', 'dimension'], 'the ask did not reach a themed run');
    assert.equal(brief.hardestStanceLean, 'time', 'the lean did not reach a themed run');
    // Still the surprise-me marker, and still not on a themed run.
    assert.equal(brief.relationshipShapes, undefined);
    assert.deepEqual(brief.stanceQuotas, ['inclusion', 'time', 'event', 'possession']);
  } finally {
    cleanup();
  }
});

test('no rut, no steer — a themed brief stays exactly as it was', async () => {
  const { api, cleanup } = setup(undefined, {
    buildThemed: () => ({ count: 14, stanceQuotas: ['inclusion', 'time', 'event', 'possession'] }),
  });
  try {
    await api.handle({ method: 'POST', path: '/api/runs', body: { theme: 'caves' } });
    const { body } = await api.handle({ method: 'GET', path: '/api/runs' });
    const detail = await api.handle({ method: 'GET', path: `/api/runs/${body.runs[0].runId}` });
    const { brief } = detail.body.manifest;
    assert.equal('varyHardestFrom' in brief, false);
    assert.equal('hardestStanceLean' in brief, false);
  } finally {
    cleanup();
  }
});

// A surprise-me run must not lose its shape brief to the same refactor.
test('a surprise-me run still carries the shape brief', async () => {
  const { api, cleanup } = setup(undefined, {
    buildBrief: () => ({
      count: 14,
      relationshipShapes: ['conversion'],
      avoidShapes: ['sequence'],
      stanceQuotas: ['time'],
      hardestStanceAsk: ['absence'],
    }),
  });
  try {
    await api.handle({ method: 'POST', path: '/api/runs', body: { count: 14 } });
    const { body } = await api.handle({ method: 'GET', path: '/api/runs' });
    const detail = await api.handle({ method: 'GET', path: `/api/runs/${body.runs[0].runId}` });
    const { brief } = detail.body.manifest;
    assert.deepEqual(brief.relationshipShapes, ['conversion']);
    assert.deepEqual(brief.avoidShapes, ['sequence']);
    assert.deepEqual(brief.hardestStanceAsk, ['absence']);
  } finally {
    cleanup();
  }
});

// --- GET /api/runs/:id/proposal ---
//
// The endpoint's job is to be unambiguous. Before 2026-08-07 it answered
// `{proposal: null, working: false}` both when the proposer had never been
// asked and when it had answered twice with nothing usable, so a brief that
// failed looked exactly like one that was never attempted. These three pin the
// distinction it now draws.

test('a proposal that failed is reported as a failure, not as silence', async () => {
  const { store, api, cleanup } = setup();
  try {
    const { runId, attemptId } = seedReviewable(store);
    store.writeRunArtifact(runId, proposalFailureFile(attemptId), {
      attemptId,
      category: 'invalid-output',
      message: 'the model answered twice and neither reply was a valid brief',
    });

    const { status, body } = await api.handle({ method: 'GET', path: `/api/runs/${runId}/proposal` });

    assert.equal(status, 200);
    assert.equal(body.proposal, null);
    assert.equal(body.working, false);
    assert.equal(body.failure.category, 'invalid-output');
  } finally {
    cleanup();
  }
});

test('a proposer that was never asked carries no failure field at all', async () => {
  const { store, api, cleanup } = setup();
  try {
    const { runId } = seedReviewable(store);

    const { body } = await api.handle({ method: 'GET', path: `/api/runs/${runId}/proposal` });

    assert.equal(body.proposal, null);
    assert.equal(body.working, false);
    // Absent, not null: nothing was attempted, so there is nothing to report.
    assert.equal('failure' in body, false);
  } finally {
    cleanup();
  }
});

test('a brief outranks a failure record left beside it', async () => {
  const { store, api, cleanup } = setup();
  try {
    const { runId, attemptId } = seedReviewable(store);
    // The order a re-run leaves behind: the earlier failure is not erased.
    store.writeRunArtifact(runId, proposalFailureFile(attemptId), { attemptId, category: 'invalid-output' });
    store.writeRunArtifact(runId, proposalFile(attemptId), { summary: 'one set blocks it', fromStage: '04-board-builder' });

    const { body } = await api.handle({ method: 'GET', path: `/api/runs/${runId}/proposal` });

    assert.equal(body.proposal.summary, 'one set blocks it');
    assert.equal('failure' in body, false);
  } finally {
    cleanup();
  }
});

// --- GET /api/config: is this server running the code on disk? ---
//
// A node process holds the modules it booted with. On 2026-08-07 the revision
// fix merged at 20:48, a server booted at 19:16 ran a revision at 20:00, and
// the revision churned exactly as it had before the fix — which read as the
// fix failing. It had not failed; it was not running. api.js does not touch
// the filesystem, so the answer is injected.

test('the config reports a stale server when the code is newer than the boot', async () => {
  const { api, cleanup } = setup(undefined, {
    codeState: () => ({
      startedAt: '2026-08-07T19:16:00.000Z',
      staleCode: true,
      codeChangedAt: '2026-08-07T20:48:00.000Z',
    }),
  });
  try {
    const { status, body } = await api.handle({ method: 'GET', path: '/api/config' });
    assert.equal(status, 200);
    assert.equal(body.staleCode, true);
    assert.equal(body.startedAt, '2026-08-07T19:16:00.000Z');
    assert.equal(body.codeChangedAt, '2026-08-07T20:48:00.000Z');
    // The settings it always carried are still there — this is an addition.
    assert.equal(body.effortProfile, 'stub-profile');
  } finally {
    cleanup();
  }
});

test('a fresh server says so without claiming anything else', async () => {
  const { api, cleanup } = setup(undefined, {
    codeState: () => ({ startedAt: '2026-08-07T21:00:00.000Z', staleCode: false }),
  });
  try {
    const { body } = await api.handle({ method: 'GET', path: '/api/config' });
    assert.equal(body.staleCode, false);
  } finally {
    cleanup();
  }
});

test('with no provider the config is exactly what it always was', async () => {
  const { api, cleanup } = setup();
  try {
    const { body } = await api.handle({ method: 'GET', path: '/api/config' });
    // Absent, not false: a server that cannot answer the question must not be
    // reported as having answered "fine".
    assert.equal('staleCode' in body, false);
    assert.equal('startedAt' in body, false);
    assert.equal(body.effortProfile, 'stub-profile');
  } finally {
    cleanup();
  }
});

// --- publishing warns when recorded changes would evaporate ---
//
// Publishing ships board.json exactly as generated; hand-editing is B2 and
// still deferred. That is a fine limitation and was a terrible silence. On
// 2026-08-08 Behind the Scenes was published carrying a recorded difficulty
// change from 3 to 1 that simply vanished — the fourth time (Ascent, bbq
// twice, cinema) and the first time anyone noticed. Nothing distinguished
// "I changed my mind" from "I forgot I flagged that".

const recordEdit = (store, runId, attemptId, event) =>
  store.appendFeedback(runId, {
    schemaVersion: '1.0',
    id: `fb-${attemptId}-${event.action}-${Math.abs(hashOf(JSON.stringify(event)))}`,
    attemptId,
    formVersion: 3,
    source: 'review-studio',
    tags: [],
    ...event,
  });

const hashOf = (text) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

test('publishing refuses once when a recorded change would not be applied', async () => {
  const { store, api, puzzlesDir, cleanup } = withPuzzles();
  try {
    const { runId, attemptId } = seedReviewable(store);
    recordEdit(store, runId, attemptId, {
      action: 'change-difficulty',
      scope: { type: 'set', setId: 'set-c' },
      before: { difficulty: 3 },
      after: { difficulty: 1 },
    });
    await approve(api, runId);

    const { status, body } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/publish`,
      body: {},
    });

    assert.equal(status, 409);
    assert.equal(body.reason, 'unapplied-edits');
    assert.equal(body.unapplied.length, 1);
    assert.equal(body.unapplied[0].setId, 'set-c');
    // The numbers travel, so the confirm can say what actually changes.
    assert.equal(body.unapplied[0].from, 3);
    assert.equal(body.unapplied[0].to, 1);
    assert.deepEqual(readdirSync(puzzlesDir), [], 'the board reached puzzles/ anyway');
  } finally {
    cleanup();
  }
});

test('acknowledged, it publishes — the editor decides, not the guard', async () => {
  const { store, api, puzzlesDir, cleanup } = withPuzzles();
  try {
    const { runId, attemptId } = seedReviewable(store);
    recordEdit(store, runId, attemptId, {
      action: 'set-needs-edit',
      scope: { type: 'set', setId: 'set-b' },
      note: 'swap Switch for Wii',
    });
    await approve(api, runId);

    const { status } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/publish`,
      body: { acknowledgeUnapplied: true },
    });

    assert.equal(status, 200);
    // index.json rides along: publish writes the manifest through the same store.
    assert.ok(readdirSync(puzzlesDir).includes('lantern.json'));
  } finally {
    cleanup();
  }
});

test('a run with nothing outstanding publishes exactly as it always did', async () => {
  const { store, api, cleanup } = withPuzzles();
  try {
    const { runId, attemptId } = seedReviewable(store);
    // Praise is not an outstanding request — only asks for a change count.
    recordEdit(store, runId, attemptId, {
      action: 'set-publishable',
      scope: { type: 'set', setId: 'set-a' },
    });
    await approve(api, runId);

    const { status } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/publish`,
      body: {},
    });
    assert.equal(status, 200, 'an unrelated event blocked a clean publish');
  } finally {
    cleanup();
  }
});

test('a request answered by a revision does not block — the revision is the answer', async () => {
  const { store, api, cleanup } = withPuzzles();
  try {
    const { runId, attemptId } = seedReviewable(store);
    recordEdit(store, runId, attemptId, {
      action: 'set-replace',
      scope: { type: 'set', setId: 'set-d' },
      note: 'this set is off theme',
    });

    // A second attempt supersedes the first, exactly as a revision does.
    const second = store.createAttempt(runId, { parentAttemptId: attemptId, startingStage: '01-pair-author' });
    store.writeAttemptArtifact(runId, second, 'board.json', BOARD);
    store.completeAttempt(runId, second, { status: 'complete' });
    await approve(api, runId);

    const { status } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/publish`,
      body: {},
    });
    assert.equal(status, 200, 'a superseded request blocked the publish');
  } finally {
    cleanup();
  }
});

test('publish still refuses fields it does not know', async () => {
  const { store, api, cleanup } = withPuzzles();
  try {
    const { runId } = seedReviewable(store);
    await approve(api, runId);
    const { status, body } = await api.handle({
      method: 'POST',
      path: `/api/runs/${runId}/publish`,
      body: { acknowledgeUnapplied: true, sneaky: 1 },
    });
    assert.equal(status, 400);
    assert.match(body.error, /unknown field: sneaky/);
  } finally {
    cleanup();
  }
});
