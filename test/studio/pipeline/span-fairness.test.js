// The 04a span-fairness check (design.md D-13, 2026-08-08).
//
// The board under test is the real one: attempt 0002 of the `flowers` run,
// generated on 2026-08-08 after Max asked for a revision. He read the Black —
// `seed : wilt :: bud : bloom` — and wrote:
//
//   "not only is this another movement through time, the relationships are
//    weird and you could reorder this as seed:bud::bloom:wilt and it still
//    makes sense. So this puzzle is bad."
//
// He is right, and the reason is structural rather than unlucky. All four words
// lie on ONE timeline (seed → bud → bloom → wilt), so regrouping them still
// reads "earlier : later" — a valid analogy the engine refuses. A player who
// finds it is marked wrong for being right, which is D-7's `second-valid-reading`
// manufactured by the stance itself.
//
// 06 was asked this exact question and answered `valid: false` with an empty
// note. That is being repaired separately; this check exists so the structural
// risk never again depends on a model noticing it.
//
// Pinned against the real artifact for the same reason order-fairness is: a
// defect that cost a board should be tested by the board it cost.

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

const FLOWERS = {
  id: 'asto-board-001',
  title: 'In the Garden',
  sets: [
    { id: 'set-location-product', relationshipLabel: 'a place and what it exists to produce',
      explanation: 'e', difficulty: 1,
      pairs: [['apiary', 'honey'], ['nursery', 'seedlings']] },
    { id: 'set-agent-instrument', relationshipLabel: 'a worker and the tool of their trade',
      explanation: 'e', difficulty: 2,
      pairs: [['beekeeper', 'smoker'], ['florist', 'shears']] },
    { id: 'set-object-component', relationshipLabel: 'a flower and the storage organ it necessarily has',
      explanation: 'e', difficulty: 3,
      pairs: [['dahlia', 'tuber'], ['gladiolus', 'corm']] },
    { id: 'set-before-after', relationshipLabel: 'two life-stages facing each other in fixed order',
      explanation: 'e', difficulty: 4,
      pairs: [['seed', 'wilt'], ['bud', 'bloom']] },
  ],
};

// The shapes the real run declared. Four distinct stances — cause, event,
// possession, time — so the board clears the composition gate and the span
// check is what is actually under test.
const SHAPES = {
  'set-location-product': 'location-product',
  'set-agent-instrument': 'agent-instrument',
  'set-object-component': 'object-component',
  'set-before-after': 'before-after',
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

test('the flowers board completes, and the gate names the set Max caught by hand', async () => {
  const { result, gate } = await runBoard(FLOWERS, SHAPES);
  assert.equal(result.status, 'complete', result.failure?.message);

  const { spanFairness } = gate;
  assert.equal(spanFairness.count, 1);

  const [flag] = spanFairness.flagged;
  assert.equal(flag.setId, 'set-before-after');
  assert.equal(flag.shape, 'before-after');
  assert.equal(flag.difficulty, 4);

  // The readings are spelled out, not merely counted — the card has to show Max
  // the thing to look at, and the reading he found by hand must be among them.
  // `seed : bud :: wilt : bloom` is his `seed:bud::bloom:wilt` with its right
  // half read the other way round; both halves are "earlier : later".
  assert.ok(flag.readings.includes('seed : bud :: wilt : bloom'), flag.readings.join(' | '));
  assert.equal(flag.readings.length, 2, 'both refused regroupings, every time');
});

// The load-bearing one. Max is not against span sets — he has approved several,
// and `sunrise : sunset` is a good set. A gate here would decide a question that
// is his to decide, and would have failed boards he liked.
test('the flag reports and never gates — the board still passes', async () => {
  const { gate } = await runBoard(FLOWERS, SHAPES);
  assert.equal(gate.ok, true, gate.reasons?.join('; '));
  assert.equal(gate.spanFairness.enforced, false);
  assert.deepEqual(gate.reasons, []);
});

test('a board with no time set carries an empty flag, not a missing one', async () => {
  const noSpan = {
    ...FLOWERS,
    sets: FLOWERS.sets.map((set) =>
      set.id === 'set-before-after'
        ? { ...set, relationshipLabel: 'a sign and what it announces',
            pairs: [['wilting', 'thirst'], ['yellowing', 'blight']] }
        : set,
    ),
  };
  const { gate } = await runBoard(noSpan, { ...SHAPES, 'set-before-after': 'sign-significant' });
  assert.equal(gate.spanFairness.count, 0);
  assert.deepEqual(gate.spanFairness.flagged, []);
});
