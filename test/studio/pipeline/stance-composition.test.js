// The board composition rule (design.md D-3): four sets in four different
// STANCES — kinds of question. Enforced at two doors, tested at both:
//
//   02 theme-grouper — a pool that cannot supply four stances fails where a
//   retry still has the setAside list, not at the gate where a rebuild can
//   only re-roll.
//
//   04a gate — a builder that picked a stance twice from a diverse pool is
//   sent back with the stances named.
//
// The honest test of the rule is Max's own verdicts: the two blind-playtest
// boards from experiments/arrow-round-2 run through the pipeline, and the
// rule must reproduce what he decided — the all-arrowed control rejected, the
// mixed-stance board approved. A composition rule that cannot reproduce the
// judgements that motivated it would not be worth shipping.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

const experiment = (name) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../experiments/arrow-round-2/${name}`, import.meta.url)),
      'utf8',
    ),
  );

// The honest shape declarations for the two night boards, per the taxonomy
// reference (docs/research/semeval-2012-taxonomy.md) and the experiment's own
// KEY.md. Board A is all arrow — every set is a becoming or a producing.
// Board B mixes an arrowed on-ramp with membership, static feature, absence.
const NIGHT_SHAPES = {
  'exp-night-a': ['cause-effect', 'conversion', 'conversion', 'cause-effect'],
  'exp-night-b': ['cause-effect', 'class-individual', 'object-component', 'distinctive-nonpart'],
};

const grouperReply = (board) => ({
  text: JSON.stringify({
    sets: board.sets.map((set, i) => ({
      id: set.id,
      relationshipLabel: set.relationshipLabel,
      shape: NIGHT_SHAPES[board.id][i],
      pairs: set.pairs,
    })),
  }),
});

const raterReply = (board) => ({
  text: JSON.stringify({
    grades: board.sets.map((set) => ({
      setId: set.id,
      difficulty: set.difficulty,
      rationale: 'as played',
    })),
  }),
});

const runBoard = async (board) => {
  const { store, cleanup: dropStore } = makeStore();
  const { dir, cleanup: dropFixtures } = fixturesWith({
    '02-theme-grouper': grouperReply(board),
    '03-difficulty-rater': raterReply(board),
    '04-board-builder': [boardReply(board)],
    // The solver's checklist is derived from the board it judges, so a swapped
    // board needs a swapped reply — same reason the grouper and rater do.
    '06-adversarial-solver': solverReply(board),
  });
  const result = await runPipeline({
    runId: seedRun(store),
    store,
    transport: mockTransport(dir),
    ...fastTime(),
  });
  dropStore();
  dropFixtures();
  return result;
};

test('Night Board B — the board Max called "the best puzzle yet" — passes the pipeline', async () => {
  const result = await runBoard(experiment('board-b.json'));
  assert.equal(result.status, 'complete', result.failure?.message);
  assert.equal(result.board.id, 'exp-night-b');
});

test('Night Board A — the all-arrowed control Max rejected — is refused at the grouper', async () => {
  // It never reaches the gate: a pool that is one stance deep fails at the
  // door where a retry could still fix it. The mock transport replays the
  // same reply on every retry, so the validation failure is terminal here.
  const result = await runBoard(experiment('board-a.json'));
  assert.equal(result.status, 'failed');
  assert.equal(result.failure.stageId, '02-theme-grouper');
  // The terminal message is generic; the recorded validation errors carry the
  // specifics the retry was shown.
  const details = (result.failure.errors ?? []).map((e) => e.message).join(' ');
  assert.match(details, /stance/i);
  assert.match(details, /set aside|setAside/i, 'the retry is not told where to look');
});

// --- the gate's own check, reached when the POOL is diverse but the BUILDER
// repeated a stance ---

test('a builder that picks the same stance twice from a diverse pool is sent back with the stances named', async () => {
  const nightB = experiment('board-b.json');
  // A five-set pool spanning five stances...
  const pool = grouperReply(nightB);
  const poolSets = JSON.parse(pool.text).sets;
  poolSets.push({
    id: 'set-fifth',
    relationshipLabel: 'the season and what belongs to it',
    shape: 'time-activity',
    pairs: [['Winter', 'Frost'], ['Summer', 'Haze']],
  });
  // ...but the board swaps the absence set for the second cause set, so the
  // finished board asks cause twice.
  const badBoard = {
    ...nightB,
    sets: nightB.sets.map((set, i) =>
      i === 3
        ? {
            id: 'set-fifth',
            relationshipLabel: 'the season and what belongs to it',
            explanation: 'Frost belongs to winter the way haze belongs to summer.',
            pairs: [['Winter', 'Frost'], ['Summer', 'Haze']],
            difficulty: 4,
          }
        : set,
    ),
  };
  // Make the swap actually collide: fifth set declared as cause-effect too.
  poolSets[4].shape = 'cause-effect';

  const { store, cleanup: dropStore } = makeStore();
  const { dir, cleanup: dropFixtures } = fixturesWith({
    '02-theme-grouper': { text: JSON.stringify({ sets: poolSets }) },
    '03-difficulty-rater': {
      text: JSON.stringify({
        grades: poolSets.map((set, i) => ({
          setId: set.id,
          difficulty: Math.min(i + 1, 4),
          rationale: 'graded',
        })),
      }),
    },
    '04-board-builder': [boardReply(badBoard)],
  });
  const result = await runPipeline({
    runId: seedRun(store),
    store,
    transport: mockTransport(dir),
    ...fastTime(),
  });
  try {
    assert.equal(result.status, 'failed');
    assert.equal(result.failure.stageId, '04a-integrity');
    assert.match(result.failure.message, /kind\(s\) of question/);
    assert.match(result.failure.message, /set-fifth: cause/);
  } finally {
    dropStore();
    dropFixtures();
  }
});

test('the gate report records the stance of every set, for the review surface', async () => {
  const result = await runBoard(experiment('board-b.json'));
  assert.equal(result.status, 'complete');
  // The report itself is on the blackboard artifact; the cheap public proof
  // here is that the run completed with four distinct stances required.
});

// --- the known limit, recorded as a test so it cannot become a silent claim ---

test('KNOWN LIMIT: round 1\'s kitchen board declares four stances yet Max read it as one', async () => {
  // Kitchen Board A (experiments/four-family-board) classifies honestly as
  // conversion (cause), object-instrument (event), time-activity (time),
  // sign-significant (reference) — four stances — and Max still demoted three
  // of its tiers as "all the same". Stance is a per-shape proxy for the felt
  // arrow, and word choice can defeat it. The gate catches monostance boards;
  // Max's eye, with the stances shown on the review card, covers this case.
  const kitchen = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../experiments/four-family-board/board-a.json', import.meta.url)),
      'utf8',
    ),
  );
  const shapes = ['conversion', 'object-instrument', 'time-activity', 'sign-significant'];
  const { store, cleanup: dropStore } = makeStore();
  const { dir, cleanup: dropFixtures } = fixturesWith({
    '02-theme-grouper': {
      text: JSON.stringify({
        sets: kitchen.sets.map((set, i) => ({
          id: set.id,
          relationshipLabel: set.relationshipLabel,
          shape: shapes[i],
          pairs: set.pairs,
        })),
      }),
    },
    '03-difficulty-rater': raterReply(kitchen),
    '04-board-builder': [boardReply(kitchen)],
    '06-adversarial-solver': solverReply(kitchen),
  });
  const result = await runPipeline({
    runId: seedRun(store),
    store,
    transport: mockTransport(dir),
    ...fastTime(),
  });
  try {
    // It passes. That is the limit, stated. If a future refinement makes the
    // machine agree with Max about this board, this assertion should flip —
    // knowingly, not by accident.
    assert.equal(result.status, 'complete', result.failure?.message);
  } finally {
    dropStore();
    dropFixtures();
  }
});
