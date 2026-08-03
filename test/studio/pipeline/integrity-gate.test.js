// The 04a gate: deterministic, mid-pipeline, bounded.
//
// Its realistic catch is a model drifting back to the pre-v1.0 schema — a
// `words[]` array or a per-set `tier`. Those pass the Board Builder's own
// checks and are rejected only by the game's validator, which is the whole
// argument for the gate importing `src/` rather than keeping its own copy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runPipeline } from '../../../studio/pipeline.js';
import { DEFAULT_CONFIG } from '../../../studio/pipeline-config.js';
import { TERMINAL_CONTENT } from '../../../studio/failures.js';
import {
  makeStore,
  mockTransport,
  seedRun,
  fastTime,
  fixturesWith,
  fixtureBoard,
  boardReply,
} from './helpers.js';

const board = fixtureBoard();
const oldSchemaBoard = { ...board, words: board.sets.flatMap((set) => set.pairs.flat()) };

const runWith = async (builderScript, extra = {}) => {
  const { store, rootDir, cleanup: dropStore } = makeStore();
  const { dir, cleanup: dropFixtures } = fixturesWith({ '04-board-builder': builderScript });
  const transport = mockTransport(dir);
  const runId = seedRun(store);
  const result = await runPipeline({ runId, store, transport, ...fastTime(), ...extra });
  return {
    result,
    store,
    rootDir,
    runId,
    transport,
    cleanup: () => {
      dropStore();
      dropFixtures();
    },
  };
};

// Relation-type variety: the first check here that can fail a board which is
// entirely schema-valid. The prototype crew shipped an ocean board using only
// two distinct relation types across its four sets — legal, and boring to
// play (lessons-learned.md section 3.3). Nothing mechanical caught it.
const monotonousBoard = {
  ...board,
  sets: board.sets.map((set, i) => ({
    ...set,
    relationshipLabel: i < 2 ? 'Tool used by profession' : 'Home of animal',
  })),
};

test('a schema-valid board with too few distinct relation types is rejected', async () => {
  const { result, cleanup } = await runWith([boardReply(monotonousBoard)]);
  try {
    assert.equal(result.status, 'failed');
    assert.equal(result.failure.stageId, '04a-integrity');
    assert.match(result.failure.message, /2 distinct relationship label/);
    // The offending labels go back with the count — a rebuild told only "not
    // varied enough" is a re-roll, not a retry.
    assert.match(result.failure.message, /Tool used by profession/);
  } finally {
    cleanup();
  }
});

test('the monotonous board really is schema-valid — the gate is adding a check, not repeating one', async () => {
  const { validatePuzzle } = await import('../../../src/source/validate-puzzle.js');
  assert.equal(validatePuzzle(monotonousBoard).ok, true);
});

test('labels differing only in case or spacing are not four distinct types', async () => {
  const casedBoard = {
    ...board,
    sets: board.sets.map((set, i) => ({
      ...set,
      relationshipLabel: ['Home of animal', 'home of animal', '  HOME OF ANIMAL  ', 'Tool used by profession'][i],
    })),
  };
  const { result, cleanup } = await runWith([boardReply(casedBoard)]);
  try {
    assert.equal(result.status, 'failed');
    assert.match(result.failure.message, /2 distinct relationship label/);
  } finally {
    cleanup();
  }
});

test('the rebuild loop recovers a monotonous board when the builder varies it', async () => {
  const { result, cleanup } = await runWith([boardReply(monotonousBoard), boardReply(board)]);
  try {
    assert.equal(result.status, 'complete');
    assert.equal(result.board.id, board.id);
  } finally {
    cleanup();
  }
});

test('a board carrying the old schema is rejected — the agent passed it, the gate did not', async () => {
  const { result, rootDir, runId, cleanup } = await runWith([boardReply(oldSchemaBoard)]);
  try {
    assert.equal(result.status, 'failed');
    assert.equal(result.failure.stageId, '04a-integrity');
    assert.match(result.failure.message, /words\[\]/);

    const rejected = JSON.parse(
      readFileSync(
        join(rootDir, runId, 'attempts', result.attemptId, 'stages', '04a-integrity', 'integrity.rejected-1.json'),
        'utf8',
      ),
    );
    assert.equal(rejected.ok, false);
  } finally {
    cleanup();
  }
});

test('a rejected board sends the builder back with the reasons, and the run recovers', async () => {
  const { result, transport, cleanup } = await runWith([
    boardReply(oldSchemaBoard),
    boardReply(board),
  ]);
  try {
    assert.equal(result.status, 'complete', result.failure?.message);

    const builderCalls = transport.calls.filter((c) => c.stageId === '04-board-builder');
    assert.equal(builderCalls.length, 2, 'the builder was not sent back');
    assert.match(builderCalls[1].prompt, /rejected by the mechanical integrity check/);
    assert.match(builderCalls[1].prompt, /words\[\]/);
  } finally {
    cleanup();
  }
});

test('the rebuild loop is bounded — it gives up rather than looping forever', async () => {
  const { result, transport, cleanup } = await runWith([boardReply(oldSchemaBoard)]);
  try {
    assert.equal(result.status, 'failed');
    assert.equal(result.failure.category, TERMINAL_CONTENT);
    const builderCalls = transport.calls.filter((c) => c.stageId === '04-board-builder');
    assert.equal(builderCalls.length, DEFAULT_CONFIG.maxIntegrityRetries + 1);
    assert.match(result.failure.message, /after 2 rebuild\(s\)/);
  } finally {
    cleanup();
  }
});

test('a builder that refuses with insufficientSets fails the gate, not the schema check', async () => {
  const { result, cleanup } = await runWith([
    { text: JSON.stringify({ insufficientSets: 'no usable difficulty-4 set among the candidates' }) },
  ]);
  try {
    assert.equal(result.status, 'failed');
    assert.equal(result.failure.stageId, '04a-integrity');
    assert.match(result.failure.message, /no usable difficulty-4 set/);
  } finally {
    cleanup();
  }
});

test('the gate never spends a request of its own', async () => {
  const { result, transport, rootDir, runId, cleanup } = await runWith([boardReply(board)]);
  try {
    assert.equal(result.status, 'complete');
    assert.equal(transport.calls.some((c) => c.stageId === '04a-integrity'), false);
    assert.equal(
      existsSync(join(rootDir, runId, 'attempts', result.attemptId, 'stages', '04a-integrity', 'request.json')),
      false,
    );
  } finally {
    cleanup();
  }
});

test('the accepted report reaches the adversarial solver, which is who reads it next', async () => {
  const { result, transport, cleanup } = await runWith([boardReply(board)]);
  try {
    assert.equal(result.status, 'complete');
    const solverPrompt = transport.calls.find((c) => c.stageId === '06-adversarial-solver').prompt;
    assert.match(solverPrompt, /"acceptedCount": 16/);
  } finally {
    cleanup();
  }
});

test('the gate runs before the four taste stages, never after', async () => {
  const { transport, cleanup } = await runWith([boardReply(board)]);
  try {
    const order = transport.calls.map((c) => c.stageId);
    const builder = order.indexOf('04-board-builder');
    for (const later of ['05-analogy-validator', '06-adversarial-solver', '07-test-player', '08-style-guide']) {
      assert.ok(order.indexOf(later) > builder, `${later} ran before the board was gated`);
    }
  } finally {
    cleanup();
  }
});

// --- the board may only use sets that were actually rated -----------------
//
// The builder is now allowed to PROMOTE a set (label the hardest one it has
// as Black even though the rater graded it lower). It is not allowed to
// INVENT one — a set nothing rated has no independent difficulty judgement
// behind it, which is the signal the whole review loop exists to improve.
// Enforced here rather than in the prompt, because a rule can enforce it and
// a prompt can only ask.
const inventedBoard = {
  ...board,
  // The graded pool is set-growth / set-tools / set-homes / set-material.
  sets: board.sets.map((set, i) => (i === 3 ? { ...set, id: 'set-invented' } : set)),
};

test('a board containing a set that was never rated is rejected', async () => {
  const { result, cleanup } = await runWith([boardReply(inventedBoard)]);
  try {
    assert.equal(result.status, 'failed');
    assert.equal(result.failure.stageId, '04a-integrity');
    assert.match(result.failure.message, /set-invented/);
    assert.match(result.failure.message, /not among the graded candidates/i);
  } finally {
    cleanup();
  }
});

test('the invented board is otherwise schema-valid — this is a new check, not a repeat', async () => {
  const { validatePuzzle } = await import('../../../src/source/validate-puzzle.js');
  assert.equal(validatePuzzle(inventedBoard).ok, true);
});

test('a promoted set is not an invented one — a rated set relabelled Black passes', async () => {
  // set-homes was graded 3. Labelling it difficulty 4 is exactly the promotion
  // Max asked for, and the gate must not confuse it with invention.
  const promoted = {
    ...board,
    sets: board.sets
      .filter((set) => set.id !== 'set-material')
      .concat([{ ...board.sets.find((s) => s.id === 'set-material'), difficulty: 4 }]),
  };
  const { result, cleanup } = await runWith([boardReply(promoted)]);
  try {
    assert.equal(result.status, 'complete', result.failure?.message);
  } finally {
    cleanup();
  }
});

// --- a rebuild that cannot help is never attempted ------------------------
//
// The gate's rebuild loop exists to fix a board the builder got wrong. It
// cannot fix a candidate pool that is too small — the builder may not invent
// sets, so re-asking it produces the same refusal at the same price. On
// 2026-08-03 a real run paid for three xhigh builder attempts to rediscover
// that its pool held three sets. The handbook calls this a blind re-roll
// (lessons-learned.md 4.1): a retry that changes nothing is resampling.
test('a pool too small to build from fails at once, without re-asking the builder', async () => {
  const shortPool = {
    '03-difficulty-rater': {
      text: JSON.stringify({
        grades: [
          { setId: 'set-growth', difficulty: 1, rationale: 'immediate' },
          { setId: 'set-tools', difficulty: 2, rationale: 'a moment' },
          { setId: 'set-homes', difficulty: 3, rationale: 'abstract' },
        ],
      }),
    },
    '04-board-builder': {
      text: JSON.stringify({ insufficientSets: 'only three graded candidates were provided' }),
    },
  };
  const { store, rootDir, cleanup: dropStore } = makeStore();
  const { dir, cleanup: dropFixtures } = fixturesWith(shortPool);
  const transport = mockTransport(dir);
  const runId = seedRun(store);
  const result = await runPipeline({ runId, store, transport, ...fastTime() });
  try {
    assert.equal(result.status, 'failed');
    assert.equal(result.failure.stageId, '04a-integrity');
    // The message must point at the real cause, not at the builder.
    assert.match(result.failure.message, /3 graded candidate/i);
    assert.match(result.failure.message, /rebuild cannot add/i);

    const builderCalls = transport.calls.filter((c) => c.stageId === '04-board-builder');
    assert.equal(builderCalls.length, 1, `the builder was re-asked ${builderCalls.length} times`);
  } finally {
    dropStore();
    dropFixtures();
  }
});
