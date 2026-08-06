// The 04a order-fairness check (design.md D-9, 2026-08-06).
//
// The board under test is the real one: `board-yankees-baseball`, generated and
// approved on 2026-08-06 and published. Max scored every set all four praise
// tags and wrote "This puzzle presented the right level of challenge, variety,
// and theme." Then he lost it — four mistakes, and all four were "So close!".
// He never grouped the wrong four words once.
//
// `Ruth : Gehrig :: Mantle : Maris` is why. Its shape is `coordinates` — two
// counterparts side by side — so nothing about the relationship says which name
// leads. The engine accepts a flip only when both halves flip together, so the
// player has to guess an orientation and then match it, and half of them guess
// wrong. That is a mistake charged for having the answer.
//
// These tests use the real board because a defect this expensive should be
// pinned against the artifact that demonstrated it, not a fixture invented to
// agree with the check.

import { test } from 'node:test';
import assert from 'node:assert/strict';

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

const YANKEES = {
  id: 'board-yankees-baseball',
  title: 'Yankees Baseball',
  sets: [
    { id: 'set-locationactivity', relationshipLabel: 'place and the activity it exists for',
      explanation: 'e', difficulty: 1,
      pairs: [['Bullpen', 'warm-up'], ['Batting cage', 'practice swings']] },
    { id: 'set-beforeafter', relationshipLabel: 'first and final moments of one span',
      explanation: 'e', difficulty: 2,
      pairs: [['Opening Day', 'World Series'], ['Rookie season', 'retirement']] },
    { id: 'set-objectcomponent', relationshipLabel: 'garment and the marking it bears',
      explanation: 'e', difficulty: 3,
      pairs: [['Jersey', 'pinstripes'], ['Cap', 'interlocking NY']] },
    { id: 'set-coordinates', relationshipLabel: 'paired figures side by side in the same role',
      explanation: 'e', difficulty: 4,
      pairs: [['Ruth', 'Gehrig'], ['Mantle', 'Maris']] },
  ],
};

// The shapes the real run declared. Four distinct stances — event, time,
// possession, inclusion — so the board clears the composition gate and the
// order check is what is actually under test.
const SHAPES = {
  'set-locationactivity': 'location-activity',
  'set-beforeafter': 'before-after',
  'set-objectcomponent': 'object-component',
  'set-coordinates': 'coordinates',
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
      difficultySource: 'vocabulary',
      rationale: 'as graded',
    })),
  }),
});

const runBoard = async (board, shapes) => {
  const { store, cleanup: dropStore } = makeStore();
  const { dir, cleanup: dropFixtures } = fixturesWith({
    '02-theme-grouper': grouperReply(board, shapes),
    '03-difficulty-rater': raterReply(board),
    '04-board-builder': [boardReply(board)],
    '06-adversarial-solver': solverReply(board, { shapes }),
  });
  const runId = seedRun(store);
  const result = await runPipeline({ runId, store, transport: mockTransport(dir), ...fastTime() });
  const gate = store.readStageArtifact(runId, result.attemptId, '04a-integrity', 'output.json');
  dropStore();
  dropFixtures();
  return { result, gate };
};

test('the Yankees board completes, and the gate flags the set that cost Max the game', async () => {
  const { result, gate } = await runBoard(YANKEES, SHAPES);
  assert.equal(result.status, 'complete', result.failure?.message);

  const { orderFairness } = gate;
  assert.equal(orderFairness.count, 1);
  assert.equal(orderFairness.flagged[0].setId, 'set-coordinates');
  assert.equal(orderFairness.flagged[0].shape, 'coordinates');
  assert.equal(orderFairness.flagged[0].kind, 'order-indistinguishable');
  assert.match(orderFairness.flagged[0].note, /reads the same/);
});

// The load-bearing property. A check that could fail a board would have
// rejected this one — which Max approved, published, and called right-level.
// It reports; only the graduation trigger can change that.
test('the flag does NOT fail the board — it reports, it does not gate', async () => {
  const { result, gate } = await runBoard(YANKEES, SHAPES);
  assert.equal(gate.ok, true);
  assert.deepEqual(gate.reasons, []);
  assert.equal(gate.orderFairness.enforced, false);
  assert.equal(result.status, 'complete');
});

// before-after is the control, and it is the whole reason the list is four
// shapes rather than "anything with two similar things in it". Time runs one
// way; a player never wonders which end leads.
test('the three asymmetric sets on the same board are silent', async () => {
  const { gate } = await runBoard(YANKEES, SHAPES);
  const flagged = gate.orderFairness.flagged.map((f) => f.setId);
  assert.ok(!flagged.includes('set-beforeafter'));
  assert.ok(!flagged.includes('set-objectcomponent'));
  assert.ok(!flagged.includes('set-locationactivity'));
});

test('a board with no symmetric shape produces no flags at all', async () => {
  // Same board, same words — only the declared shape of the Black changes, to
  // another `inclusion` shape so the stance composition is untouched and the
  // order check is the only variable.
  const asymmetric = { ...SHAPES, 'set-coordinates': 'taxonomic' };
  const { result, gate } = await runBoard(YANKEES, asymmetric);
  assert.equal(result.status, 'complete', result.failure?.message);
  assert.equal(gate.orderFairness.count, 0);
  assert.deepEqual(gate.orderFairness.flagged, []);
});
