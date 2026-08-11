// Revisions: a child attempt re-enters at a chosen stage, references the
// parent's earlier work instead of re-running it, and leaves the parent
// untouched. The complete editorial path A → B has to stay readable.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runPipeline, requestRevision } from '../../../studio/pipeline.js';
import { DEFAULT_CONFIG } from '../../../studio/pipeline-config.js';
import {
  makeStore,
  mockTransport,
  seedRun,
  fastTime,
  hashTree,
  fixturesWith,
  fixtureBoard,
  boardReply,
  solverReply,
} from './helpers.js';

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
      ['04-board-builder', '05-analogy-validator', '06-adversarial-solver', '07-test-player', '08-style-guide', '09-glossary-author'],
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

// --- the notes have to actually reach the model ---
//
// The defect these pin, found on 2026-08-08: `requestRevision` wrote the
// editor's notes to revision.json and NOTHING READ THEM BACK. A revision
// re-entering at 01-pair-author was a blind re-roll of the theme — fresh pool,
// fresh grouping, fresh board. Max said it twice in one night, on bbq and on
// nintendo: "i only asked for one small change and this is an entirely new
// puzzle set."
//
// `the revision records why it was asked for` above passed the whole time,
// because recording is not delivering. These read the prompt the stage
// actually sent.

const promptFor = (rootDir, runId, attemptId, stageId) =>
  readFileSync(join(attemptDir(rootDir, runId, attemptId), 'stages', stageId, 'prompt.txt'), 'utf8');

test('the entry stage is told what the editor asked for', async () => {
  const { store, rootDir, runId, cleanup } = await completedRun();
  try {
    const childId = requestRevision(store, runId, {
      fromStage: FROM,
      notes: 'The Black set is too easy — wrap:unwrap is a symmetric opposite pair.',
    });
    await runPipeline({ runId, store, transport: mockTransport(), ...fastTime() });

    const prompt = promptFor(rootDir, runId, childId, FROM);
    assert.match(prompt, /THIS IS A REVISION, NOT A NEW BOARD/);
    assert.match(prompt, /wrap:unwrap is a symmetric opposite pair/);
    assert.match(prompt, /must SURVIVE UNCHANGED/);
  } finally {
    cleanup();
  }
});

test('the entry stage can see the board it is revising', async () => {
  const { store, rootDir, runId, first, cleanup } = await completedRun();
  try {
    const parentBoard = store.readAttemptArtifact(runId, first.attemptId, 'board.json');
    const childId = requestRevision(store, runId, { fromStage: FROM, notes: 'fix the Red set' });
    await runPipeline({ runId, store, transport: mockTransport(), ...fastTime() });

    const prompt = promptFor(rootDir, runId, childId, FROM);
    assert.match(prompt, /The board being revised/);
    // Without the parent board, "leave the approved sets alone" is an
    // instruction the model has no way to follow.
    assert.ok(
      prompt.includes(parentBoard.sets[0].pairs[0][0]),
      'a word from the parent board never reached the prompt',
    );
  } finally {
    cleanup();
  }
});

test('the evaluators stay blind — they judge the board, not the request', async () => {
  const { store, rootDir, runId, cleanup } = await completedRun();
  try {
    const childId = requestRevision(store, runId, {
      fromStage: FROM,
      notes: 'The Black set is too easy — wrap:unwrap is a symmetric opposite pair.',
    });
    await runPipeline({ runId, store, transport: mockTransport(), ...fastTime() });

    // An evaluator that had read the instructions would be marking its own
    // homework: agreeing the change was made is not finding the board good.
    for (const stageId of ['05-analogy-validator', '06-adversarial-solver', '07-test-player', '08-style-guide', '09-glossary-author']) {
      const prompt = promptFor(rootDir, runId, childId, stageId);
      assert.doesNotMatch(prompt, /THIS IS A REVISION/, `${stageId} was shown the revision request`);
      assert.doesNotMatch(prompt, /wrap:unwrap/, `${stageId} was shown the editor's notes`);
    }
  } finally {
    cleanup();
  }
});

// The unity gate on revisions (D-17 second amendment, 2026-08-11). The
// mending-nets revision imported "kickoff" onto a boat board; 08 flagged it and
// the flag was advisory, so the breach reached Max and cost the board. A word a
// REVISION introduces that lands in 08's unity outliers now fails the attempt —
// first drafts stay advisory-only, since Max sees those fresh.
test('a revision that introduces a unity outlier fails, and names the word', async () => {
  const { store, runId, cleanup } = await completedRun();
  let dropFixtures = () => {};
  try {
    // The revised board swaps one parent word for an off-theme import.
    const revised = structuredClone(fixtureBoard());
    const set = revised.sets.find((s) => s.pairs.flat().includes('Harvest'));
    set.pairs = set.pairs.map((pair) => pair.map((w) => (w === 'Harvest' ? 'kickoff' : w)));

    const eight = JSON.parse(
      readFileSync(join('studio', 'fixtures', 'responses', '08-style-guide.json'), 'utf8'),
    );
    const eightOut = JSON.parse(eight.text);
    eightOut.unity = {
      verdict: 'weak',
      reasoning: 'kickoff reads as imported from another world.',
      outliers: [{ word: 'kickoff', note: 'american football on a rustic-morning board' }],
    };

    const { dir, cleanup: drop } = fixturesWith({
      '04-board-builder': boardReply(revised),
      '06-adversarial-solver': solverReply(revised),
      '08-style-guide': { text: JSON.stringify(eightOut) },
    });
    dropFixtures = drop;

    requestRevision(store, runId, { fromStage: FROM, notes: 'fix the black set' });
    const result = await runPipeline({ runId, store, transport: mockTransport(dir), ...fastTime() });

    assert.equal(result.status, 'failed');
    assert.match(result.failure.message, /kickoff/);
    assert.match(result.failure.message, /unity|world|imported/i);
  } finally {
    dropFixtures();
    cleanup();
  }
});

// The same outlier on a FIRST draft stays advisory — Max judges fresh boards
// himself, and 08's opinion is one click away on the card, not a gate.
test('a first draft with a unity outlier still completes', async () => {
  const { store, rootDir, cleanup } = makeStore();
  let dropFixtures = () => {};
  try {
    const eight = JSON.parse(
      readFileSync(join('studio', 'fixtures', 'responses', '08-style-guide.json'), 'utf8'),
    );
    const eightOut = JSON.parse(eight.text);
    eightOut.unity = {
      verdict: 'weak',
      reasoning: 'x',
      outliers: [{ word: 'Seed', note: 'test — an outlier on a fresh board' }],
    };
    const { dir, cleanup: drop } = fixturesWith({ '08-style-guide': { text: JSON.stringify(eightOut) } });
    dropFixtures = drop;

    const runId = seedRun(store);
    const result = await runPipeline({ runId, store, transport: mockTransport(dir), ...fastTime() });
    assert.equal(result.status, 'complete', result.failure?.message);
  } finally {
    dropFixtures();
    cleanup();
  }
});

test('a fresh run carries no revision framing at all', async () => {
  const { store, rootDir, runId, first, cleanup } = await completedRun();
  try {
    const prompt = promptFor(rootDir, runId, first.attemptId, '01-pair-author');
    assert.doesNotMatch(prompt, /THIS IS A REVISION/);
  } finally {
    cleanup();
  }
});
