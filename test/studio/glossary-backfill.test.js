// The glossary backfill — retrofitting D-18's Vocabulary button onto boards
// published before stage 09 existed.
//
// The seams under test are all existing ones: the join reads publish events
// from decisions.jsonl exactly as the review page does, the gloss comes from
// the same glossary-author agent the pipeline runs, and the write goes through
// puzzle-store.publish — the only door into puzzles/. What this file covers is
// the orchestration between them: which board gets auto-applied (07 flagged a
// word — evidence of a wall) and which waits for Max (the author's own pick),
// and that a failed authoring leaves a diagnosable record rather than silence.
//
// Every test runs on temp directories and an injected transport. Zero network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyGloss,
  authorGloss,
  joinPublishedBoards,
  partition,
  validateEditedGloss,
} from '../../studio/glossary-backfill.js';
import { createPuzzleStore } from '../../studio/storage/puzzle-store.js';
import { createRunStore } from '../../studio/storage/run-store.js';
import { validatePuzzle } from '../../src/source/validate-puzzle.js';
import { tickingClock } from './pipeline/helpers.js';

/** A board that passes both the schema and the integrity sweep. */
const goodBoard = (id = 'board-01', title = 'Gotham Connections') => ({
  id,
  title,
  sets: [
    {
      id: 'set-1',
      relationshipLabel: 'a broad category and one specific example of it',
      explanation: 'Joker is a villain the way the Batmobile is a vehicle.',
      pairs: [['villain', 'Joker'], ['vehicle', 'Batmobile']],
      difficulty: 1,
    },
    {
      id: 'set-2',
      relationshipLabel: 'the hero and the tool that marks them',
      explanation: 'Batman carries a Batarang the way Catwoman carries a whip.',
      pairs: [['Batman', 'Batarang'], ['Catwoman', 'whip']],
      difficulty: 2,
    },
    {
      id: 'set-3',
      relationshipLabel: 'a substance and the effect it produces',
      explanation: 'Venom grants strength the way toxin induces fear.',
      pairs: [['Venom', 'strength'], ['toxin', 'fear']],
      difficulty: 3,
    },
    {
      id: 'set-4',
      relationshipLabel: 'the time of day and the activity that belongs to it',
      explanation: 'Night is for patrol the way dusk is for a stakeout.',
      pairs: [['night', 'patrol'], ['dusk', 'stakeout']],
      difficulty: 4,
    },
  ],
});

/**
 * A throwaway world: a puzzles directory and a runs directory, with helpers to
 * publish a board and to fabricate the run that published it.
 */
function makeWorld() {
  const puzzlesDir = mkdtempSync(join(tmpdir(), 'asto-backfill-puzzles-'));
  const runsDir = mkdtempSync(join(tmpdir(), 'asto-backfill-runs-'));
  const puzzles = createPuzzleStore({ rootDir: puzzlesDir });
  const runs = createRunStore({ rootDir: runsDir, clock: tickingClock() });

  /** Publishes `board` at `slug` and, unless runless, records the run that did it. */
  function publishWithRun(slug, board, { knowledgeGated = null, runless = false } = {}) {
    puzzles.publish({ board, slug });
    if (runless) return null;
    const { runId } = runs.createRun({ slug: `run-${slug}`, theme: slug });
    const attemptId = runs.createAttempt(runId);
    if (knowledgeGated !== null) {
      runs.writeStageArtifact(runId, attemptId, '07-test-player', 'output.json', {
        trials: [],
        knowledgeGated,
        orderGuessed: [],
      });
    }
    runs.completeAttempt(runId, attemptId, { status: 'complete' });
    runs.appendDecision(runId, {
      type: 'publish',
      attemptId,
      publishedAs: `${slug}.json`,
      publishedId: `asto-${slug}`,
    });
    return runId;
  }

  return {
    puzzles,
    runs,
    puzzlesDir,
    publishWithRun,
    cleanup: () => {
      rmSync(puzzlesDir, { recursive: true, force: true });
      rmSync(runsDir, { recursive: true, force: true });
    },
  };
}

/** A transport that replies with a fixed sequence of texts, recording requests. */
function scriptedTransport(replies) {
  const calls = [];
  const transport = async (request) => {
    calls.push(request);
    const reply = replies[Math.min(calls.length, replies.length) - 1];
    return {
      text: typeof reply === 'function' ? reply(request) : reply,
      usage: { inputTokens: 1, outputTokens: 1 },
      stopReason: 'end_turn',
      model: request.model,
    };
  };
  transport.calls = calls;
  return transport;
}

// ---------------------------------------------------------------------------
// The join
// ---------------------------------------------------------------------------

test('the join finds a published board, its run, and 07\'s flags', (t) => {
  const world = makeWorld();
  t.after(world.cleanup);

  const runId = world.publishWithRun('gotham', goodBoard(), {
    knowledgeGated: [{ word: 'Batarang', note: 'requires Batman lore' }],
  });

  const entries = joinPublishedBoards({ puzzles: world.puzzles, runs: world.runs });
  assert.equal(entries.length, 1);
  const [entry] = entries;
  assert.equal(entry.slug, 'gotham');
  assert.equal(entry.runId, runId);
  assert.equal(entry.board.title, 'Gotham Connections');
  assert.deepEqual(entry.knowledgeGated.map((k) => k.word), ['Batarang']);
  assert.equal(entry.skip, false);
});

test('a board with no publish record joins run-less, with empty flags', (t) => {
  const world = makeWorld();
  t.after(world.cleanup);

  world.publishWithRun('hand-authored', goodBoard(), { runless: true });

  const [entry] = joinPublishedBoards({ puzzles: world.puzzles, runs: world.runs });
  assert.equal(entry.runId, null);
  assert.deepEqual(entry.knowledgeGated, []);
});

test('a run whose 07 artifact is missing degrades to empty flags, never throws', (t) => {
  const world = makeWorld();
  t.after(world.cleanup);

  world.publishWithRun('no-07', goodBoard(), { knowledgeGated: null });

  const [entry] = joinPublishedBoards({ puzzles: world.puzzles, runs: world.runs });
  assert.notEqual(entry.runId, null);
  assert.deepEqual(entry.knowledgeGated, []);
});

test('a board already carrying a glossary is marked skip', (t) => {
  const world = makeWorld();
  t.after(world.cleanup);

  const board = {
    ...goodBoard(),
    glossary: [{ word: 'Batarang', definition: 'a bat-shaped throwing blade' }],
  };
  world.publishWithRun('already-glossed', board, { runless: true });

  const [entry] = joinPublishedBoards({ puzzles: world.puzzles, runs: world.runs });
  assert.equal(entry.skip, true);
});

// ---------------------------------------------------------------------------
// The partition — flagged is evidence, unflagged is the author's own pick
// ---------------------------------------------------------------------------

test('partition: flagged → auto, unflagged or run-less → review, glossed → skipped', () => {
  const entries = [
    { slug: 'flagged', skip: false, runId: 'r1', knowledgeGated: [{ word: 'x', note: 'n' }] },
    { slug: 'unflagged', skip: false, runId: 'r2', knowledgeGated: [] },
    { slug: 'runless', skip: false, runId: null, knowledgeGated: [] },
    { slug: 'glossed', skip: true, runId: null, knowledgeGated: [] },
  ];

  const { auto, review, skipped } = partition(entries);
  assert.deepEqual(auto.map((e) => e.slug), ['flagged']);
  assert.deepEqual(review.map((e) => e.slug), ['unflagged', 'runless']);
  assert.deepEqual(skipped.map((e) => e.slug), ['glossed']);
});

// ---------------------------------------------------------------------------
// Authoring — the proposer-style bounded loop
// ---------------------------------------------------------------------------

test('a valid first reply becomes the gloss', async () => {
  const transport = scriptedTransport([
    JSON.stringify({
      glossary: [{ word: 'Batarang', definition: 'a bat-shaped throwing blade' }],
    }),
  ]);

  const result = await authorGloss({
    entry: {
      slug: 'gotham',
      board: goodBoard(),
      knowledgeGated: [{ word: 'Batarang', note: 'requires Batman lore' }],
    },
    transport,
  });

  assert.equal(result.ok, true);
  assert.equal(result.gloss.word, 'Batarang');
  assert.equal(transport.calls.length, 1);
});

test('an invalid reply is retried once with the errors, then reported — not thrown', async () => {
  // Round 1 leaks the board word "Batman" into the definition; round 2 defines
  // a word that was never flagged. Both must appear in the failure record.
  const transport = scriptedTransport([
    JSON.stringify({
      glossary: [{ word: 'Batarang', definition: 'the blade Batman throws' }],
    }),
    JSON.stringify({
      glossary: [{ word: 'whip', definition: 'a coiled leather lash' }],
    }),
  ]);

  const result = await authorGloss({
    entry: {
      slug: 'gotham',
      board: goodBoard(),
      knowledgeGated: [{ word: 'Batarang', note: 'requires Batman lore' }],
    },
    transport,
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure.slug, 'gotham');
  assert.equal(result.failure.rounds.length, 2);
  assert.match(result.failure.rounds[0].errors[0].message, /Batman/);
  assert.match(result.failure.rounds[1].errors[0].message, /not flagged/);
  // The reply is the diagnosis (the D-5 amendment's lesson).
  assert.match(result.failure.reply, /whip/);
});

test('the retry prompt carries round 1\'s validation errors', async () => {
  const transport = scriptedTransport([
    JSON.stringify({
      glossary: [{ word: 'Batarang', definition: 'the blade Batman throws' }],
    }),
    JSON.stringify({
      glossary: [{ word: 'Batarang', definition: 'a bat-shaped throwing blade' }],
    }),
  ]);

  const result = await authorGloss({
    entry: {
      slug: 'gotham',
      board: goodBoard(),
      knowledgeGated: [{ word: 'Batarang', note: 'requires Batman lore' }],
    },
    transport,
  });

  assert.equal(result.ok, true);
  assert.equal(transport.calls.length, 2);
  // The rejection reason reached the model, naming the leaked word — a retry
  // that cannot see what went wrong can only repeat it.
  assert.match(transport.calls[1].prompt, /rejected/);
  assert.match(transport.calls[1].prompt, /Batman/);
});

test('a transport failure is reported with its message, never thrown', async () => {
  const transport = async () => {
    throw new Error('HTTP 400: credit balance too low');
  };

  const result = await authorGloss({
    entry: { slug: 'gotham', board: goodBoard(), knowledgeGated: [] },
    transport,
  });

  assert.equal(result.ok, false);
  assert.match(result.failure.message, /credit balance/);
});

// ---------------------------------------------------------------------------
// Applying — through the store, validated on the way
// ---------------------------------------------------------------------------

test('applyGloss round-trips: the file gains exactly one entry and stays valid', (t) => {
  const world = makeWorld();
  t.after(world.cleanup);
  world.publishWithRun('gotham', goodBoard(), { runless: true });

  const result = applyGloss({
    puzzles: world.puzzles,
    slug: 'gotham',
    gloss: { word: 'Batarang', definition: 'a bat-shaped throwing blade' },
  });

  assert.equal(result.slug, 'gotham');
  const board = world.puzzles.read('gotham');
  assert.deepEqual(board.glossary, [
    { word: 'Batarang', definition: 'a bat-shaped throwing blade' },
  ]);
  assert.equal(validatePuzzle(board).ok, true);

  // The manifest was regenerated by the same publish call.
  const manifest = world.puzzles.readManifest();
  assert.equal(manifest.puzzles.length, 1);
});

test('applyGloss preserves everything else about the board', (t) => {
  const world = makeWorld();
  t.after(world.cleanup);
  world.publishWithRun('gotham', goodBoard(), { runless: true });
  const before = world.puzzles.read('gotham');

  applyGloss({
    puzzles: world.puzzles,
    slug: 'gotham',
    gloss: { word: 'Batarang', definition: 'a bat-shaped throwing blade' },
  });

  const after = world.puzzles.read('gotham');
  assert.deepEqual(after.sets, before.sets);
  assert.equal(after.id, before.id);
  assert.equal(after.title, before.title);
});

// ---------------------------------------------------------------------------
// The edited-entry gate — Max's edit could introduce a leak
// ---------------------------------------------------------------------------

test('an edited gloss that leaks another board word is refused with the word named', () => {
  const validation = validateEditedGloss({
    board: goodBoard(),
    gloss: { word: 'Batarang', definition: 'the blade Batman throws' },
  });
  assert.equal(validation.ok, false);
  assert.match(validation.errors[0].message, /Batman/);
});

test('an edited gloss for a word not on the board is refused', () => {
  const validation = validateEditedGloss({
    board: goodBoard(),
    gloss: { word: 'grappling hook', definition: 'a climbing tool' },
  });
  assert.equal(validation.ok, false);
});

test('a clean edited gloss passes', () => {
  const validation = validateEditedGloss({
    board: goodBoard(),
    gloss: { word: 'Batarang', definition: 'a bat-shaped throwing blade' },
  });
  assert.equal(validation.ok, true);
});
