// Self-matching pairs reach the rater and the review card, and gate nothing.
//
// `test/studio/corpus/lexical.test.js` pins the detector itself. This pins the
// plumbing: the fact has to arrive where it can change a judgement (03's
// input) and where Max can see it (the 04a artifact the review card reads),
// while never failing a board.
//
// The non-gating half is load-bearing rather than incidental. Max is torn on
// whether these sets are bad — *"It seems too easy but maybe that needs
// testing from other audiences"* — and one of the sets he most admired
// (cinema's `opening credits : closing credits :: greenlight : wrap`) carries
// one. A check that could reject a board would be deciding a question he has
// deliberately left open. See design.md D-12.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runPipeline } from '../../../studio/pipeline.js';
import {
  makeStore,
  mockTransport,
  seedRun,
  fastTime,
  fixturesWith,
  boardReply,
  solverReply,
} from './helpers.js';

// The music board Max approved on 2026-08-08, whose Yellow is the case that
// prompted all of this: both pairs share visible text.
const MUSIC = {
  id: 'asto-on-stage',
  title: 'On Stage and Behind It',
  sets: [
    { id: 'set-performer-tool', relationshipLabel: 'performer and their instrument',
      explanation: 'e', difficulty: 1,
      pairs: [['singer', 'microphone'], ['drummer', 'drumsticks']] },
    { id: 'set-bookend-live', relationshipLabel: 'opening and closing of one span',
      explanation: 'e', difficulty: 2,
      pairs: [['load-in', 'load-out'], ['fade-in', 'fade-out']] },
    { id: 'set-touching-parts', relationshipLabel: 'two parts that meet to make sound',
      explanation: 'e', difficulty: 3,
      pairs: [['reed', 'mouthpiece'], ['bow', 'string']] },
    { id: 'set-cover-vs-truth', relationshipLabel: 'a cover and the truth beneath it',
      explanation: 'e', difficulty: 4,
      pairs: [['stage name', 'birth name'], ['Auto-Tune', 'voice']] },
  ],
};

const SHAPES = {
  'set-performer-tool': 'agent-instrument',
  'set-bookend-live': 'before-after',
  'set-touching-parts': 'contiguity',
  'set-cover-vs-truth': 'concealment',
};

const grouperReply = (board, shapes) => ({
  text: JSON.stringify({
    sets: board.sets.map((set) => ({
      id: set.id,
      relationshipLabel: set.relationshipLabel,
      shape: shapes[set.id],
      pairs: set.pairs,
    })),
  }),
});

const raterReply = (board) => ({
  text: JSON.stringify({
    grades: board.sets.map((set) => ({
      setId: set.id,
      difficulty: set.difficulty,
      difficultySource: 'arrangement',
      rationale: 'as graded',
    })),
  }),
});

const runBoard = async (board, shapes) => {
  const { store, rootDir, cleanup: dropStore } = makeStore();
  const { dir, cleanup: dropFixtures } = fixturesWith({
    '02-theme-grouper': grouperReply(board, shapes),
    '03-difficulty-rater': raterReply(board),
    '04-board-builder': [boardReply(board)],
    '06-adversarial-solver': solverReply(board, { shapes }),
  });
  const runId = seedRun(store);
  const result = await runPipeline({ runId, store, transport: mockTransport(dir), ...fastTime() });
  const gate = store.readStageArtifact(runId, result.attemptId, '04a-integrity', 'output.json');
  const raterPrompt = readFileSync(
    join(rootDir, runId, 'attempts', result.attemptId, 'stages', '03-difficulty-rater', 'prompt.txt'),
    'utf8',
  );
  dropStore();
  dropFixtures();
  return { result, gate, raterPrompt };
};

test('the rater is told which sets a player can pair on sight', async () => {
  const { result, raterPrompt } = await runBoard(MUSIC, SHAPES);
  assert.equal(result.status, 'complete', result.failure?.message);

  // The count reaches 03's input, per set. Without it the rater grades the
  // relationship and cannot see that the words give the set away.
  assert.match(raterPrompt, /"selfMatchingPairs": 2/);
  assert.match(raterPrompt, /"selfMatchingPairs": 0/);
  // …and the instruction that tells it what to do with the number.
  assert.match(raterPrompt, /the set assembles itself/);
});

test('the gate reports the counts for the review card', async () => {
  const { gate } = await runBoard(MUSIC, SHAPES);
  // Two sets, and the second one is a finding rather than a fixture quirk:
  // the Black's `stage name : birth name` shares the visible word "name", so
  // that pair couples on sight too. Nobody had noticed — which is the whole
  // argument for computing this rather than eyeballing it. One pair, so it is
  // the on-ramp tier, not the free one.
  assert.deepEqual(gate.lexical.bySet, { 'set-bookend-live': 2, 'set-cover-vs-truth': 1 });
});

test('a board with nothing to report carries an empty map, not a missing one', async () => {
  const swapped = {
    'set-bookend-live': [['doors', 'encore'], ['soundcheck', 'curtain']],
    'set-cover-vs-truth': [['stage persona', 'birth certificate'], ['Auto-Tune', 'voice']],
  };
  const clean = {
    ...MUSIC,
    sets: MUSIC.sets.map((set) =>
      swapped[set.id] ? { ...set, pairs: swapped[set.id] } : set,
    ),
  };
  const { gate } = await runBoard(clean, SHAPES);
  assert.deepEqual(gate.lexical.bySet, {});
});

// The load-bearing property, and the same one D-9's flag has: Max APPROVED and
// PUBLISHED this board. A check that could fail it would have thrown away a
// board he liked over a question he has not answered.
test('the flag does NOT fail the board — it reports, it does not gate', async () => {
  const { result, gate } = await runBoard(MUSIC, SHAPES);
  assert.equal(gate.ok, true);
  assert.deepEqual(gate.reasons, []);
  assert.equal(result.status, 'complete');
});
