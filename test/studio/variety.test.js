// Variety as a pipeline property (locked decision 6): with no theme, the
// pipeline picks an underused relationship shape for itself rather than
// relying on Max to remember what the last board did.
//
// The index is recomputed on demand from what actually shipped and what runs
// produced, so there is no second mutable file to keep in step.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildRelationshipIndex, buildStanceQuotas, buildVarietyBrief, SHAPES } from '../../studio/variety.js';
import { PORTABLE_STANCES, STANCES, resolveShape } from '../../studio/corpus/vocabulary.js';
import { makeStore } from './pipeline/helpers.js';

// A run whose pair author declared shapes, and whose board used two of them.
function seedRun(store, { slug, shapes, status = 'awaiting-review', mock = false }) {
  const { runId } = store.createRun({ slug, theme: null, brief: { count: 8, mock } });
  const attemptId = store.createAttempt(runId);
  store.updateStatus(runId, 'running');

  store.writeStageArtifact(runId, attemptId, '01-pair-author', 'output.json', {
    pairs: [
      { a: 'Seed', b: 'Tree', relationshipLabel: 'grows into', shape: shapes[0] },
      { a: 'Spark', b: 'Fire', relationshipLabel: 'grows into', shape: shapes[0] },
      { a: 'Brush', b: 'Painter', relationshipLabel: 'used by', shape: shapes[1] },
      { a: 'Chisel', b: 'Sculptor', relationshipLabel: 'used by', shape: shapes[1] },
    ],
  });
  store.writeAttemptArtifact(runId, attemptId, 'board.json', {
    id: `asto-${slug}`,
    title: slug,
    sets: [
      { id: 's1', relationshipLabel: 'grows into', explanation: 'e', pairs: [['Seed', 'Tree'], ['Spark', 'Fire']], difficulty: 1 },
      { id: 's2', relationshipLabel: 'used by', explanation: 'e', pairs: [['Brush', 'Painter'], ['Chisel', 'Sculptor']], difficulty: 2 },
    ],
  });
  store.completeAttempt(runId, attemptId, { status: 'complete' });
  store.updateStatus(runId, status === 'awaiting-review' ? 'awaiting-review' : status);
  return runId;
}

test('every vocabulary entry carries its three levels and its teaching', () => {
  // The controlled vocabulary (design.md D-3): each shape is a taxonomy
  // relation type with a family (coverage axis), a stance (composition axis),
  // a paradigm pair, and a failure mode for the review card.
  assert.ok(SHAPES.length >= 30, `only ${SHAPES.length} shapes`);
  const stanceIds = new Set(STANCES.map((stance) => stance.id));
  for (const shape of SHAPES) {
    assert.ok(shape.description, `${shape.id} has no description`);
    assert.ok(shape.paradigm, `${shape.id} has no paradigm pair`);
    assert.ok(shape.failureMode, `${shape.id} has no failure mode`);
    assert.ok(shape.taxonomy, `${shape.id} has no taxonomy provenance`);
    assert.ok(Number.isInteger(shape.family), `${shape.id} has no family`);
    assert.ok(stanceIds.has(shape.stance), `${shape.id} has invented stance "${shape.stance}"`);
  }
});

test('the portable stances are real stances, and reference is not among them', () => {
  const stanceIds = new Set(STANCES.map((stance) => stance.id));
  for (const stance of PORTABLE_STANCES) assert.ok(stanceIds.has(stance));
  // `reference` reaches exactly one family — requiring it would make family
  // 10 mandatory for every board.
  assert.ok(!PORTABLE_STANCES.includes('reference'));
});

test('the retired 13-shape ids still resolve through the aliases', () => {
  // History must stay countable: boards authored under the old free-text list
  // declared these ids, and the index walks every run ever made.
  for (const [legacy, expected] of [
    ['transformation', 'conversion'],
    ['tool-function', 'instrument-action'],
    ['container-contents', 'item-location'],
    ['place-occupant', 'item-location'],
    ['scale-degree', 'dimensional-similarity'],
  ]) {
    assert.equal(resolveShape(legacy)?.id, expected, `${legacy} no longer resolves`);
  }
  // Free text stays unknown — that is the 40%-uncountable bug being measured,
  // not silently absorbed.
  assert.equal(resolveShape('a bounded region of space'), null);
});

test('the shipped boards are already counted — the library does not start empty', () => {
  const { store, cleanup } = makeStore();
  try {
    const index = buildRelationshipIndex({ store });
    const used = Object.values(index.counts).reduce((a, b) => a + b, 0);
    assert.ok(used >= 8, `only ${used} shipped sets counted`);
    assert.ok(index.counts['agent-instrument'] >= 1, 'First Light\'s tool set is not counted');
    // The hand labels roll up to families and stances too.
    assert.ok((index.familyCounts[7] ?? 0) >= 1, 'family counts not derived');
    assert.ok((index.stanceCounts.event ?? 0) >= 1, 'stance counts not derived');
  } finally {
    cleanup();
  }
});

test('a run\'s shapes are derived by joining its board back to the pair author', () => {
  const { store, cleanup } = makeStore();
  try {
    const before = buildRelationshipIndex({ store }).counts['sign-significant'] ?? 0;
    seedRun(store, { slug: 'one', shapes: ['sign-significant', 'object-component'] });
    const after = buildRelationshipIndex({ store }).counts['sign-significant'];
    assert.equal(after, before + 1, 'the run\'s shape was not picked up');
  } finally {
    cleanup();
  }
});

test('a run that declared legacy shape ids still counts, through the aliases', () => {
  const { store, cleanup } = makeStore();
  try {
    const before = buildRelationshipIndex({ store }).counts['item-location'] ?? 0;
    seedRun(store, { slug: 'legacy', shapes: ['container-contents', 'part-whole'] });
    const after = buildRelationshipIndex({ store }).counts['item-location'];
    assert.equal(after, before + 1, 'a legacy declaration fell out of the index');
  } finally {
    cleanup();
  }
});

// A mock run replays the same fixture board every time, so counting it tells
// the brief that First Light's shapes are heavily used and steers real runs
// away from them — variety pressure from a board nobody authored. One had been
// sitting in the corpus marked `approved` since 2026-08-03.
test('mock runs do not steer the brief — a fixture board is not editorial signal', () => {
  const { store, cleanup } = makeStore();
  try {
    const before = buildRelationshipIndex({ store }).counts['sign-significant'] ?? 0;
    seedRun(store, { slug: 'fixture', shapes: ['sign-significant', 'object-component'], mock: true });
    const after = buildRelationshipIndex({ store }).counts['sign-significant'] ?? 0;
    assert.equal(after, before, 'a mock run was counted into the variety index');
  } finally {
    cleanup();
  }
});

test('the brief asks for what is underused and steers away from what is not', () => {
  const { store, cleanup } = makeStore();
  try {
    // Lean hard on one shape.
    for (const slug of ['a', 'b', 'c']) {
      seedRun(store, { slug, shapes: ['conversion', 'conversion'] });
    }
    const brief = buildVarietyBrief({ index: buildRelationshipIndex({ store }), count: 8 });

    assert.equal(brief.count, 8);
    assert.ok(brief.relationshipShapes.length >= 2);
    assert.ok(brief.avoidShapes.includes('conversion'), 'the overused shape is not avoided');
    assert.equal(
      brief.relationshipShapes.includes('conversion'),
      false,
      'the overused shape was also requested',
    );
  } finally {
    cleanup();
  }
});

test('the requested shapes spread across families rather than triple-dipping one', () => {
  const { store, cleanup } = makeStore();
  try {
    const brief = buildVarietyBrief({ index: buildRelationshipIndex({ store }), count: 8 });
    const families = brief.relationshipShapes.map((id) => resolveShape(id).family);
    assert.equal(new Set(families).size, families.length, `families repeat: ${families}`);
  } finally {
    cleanup();
  }
});

test('every brief carries stance quotas drawn from the portable stances', () => {
  const { store, cleanup } = makeStore();
  try {
    const brief = buildVarietyBrief({ index: buildRelationshipIndex({ store }), count: 8 });
    assert.equal(brief.stanceQuotas.length, 4);
    for (const stance of brief.stanceQuotas) {
      assert.ok(PORTABLE_STANCES.includes(stance), `${stance} is not portable`);
    }
  } finally {
    cleanup();
  }
});

test('stance quotas favour the least-used stances, deterministically', () => {
  const quotas = buildStanceQuotas({
    index: { stanceCounts: { cause: 40, event: 5, possession: 3, inclusion: 0, time: 1 } },
  });
  assert.deepEqual(quotas, ['inclusion', 'time', 'possession', 'event']);
});

test('requested and avoided shapes never overlap', () => {
  const { store, cleanup } = makeStore();
  try {
    const brief = buildVarietyBrief({ index: buildRelationshipIndex({ store }), count: 8 });
    const requested = new Set(brief.relationshipShapes);
    assert.equal(brief.avoidShapes.some((shape) => requested.has(shape)), false);
  } finally {
    cleanup();
  }
});

test('the brief is deterministic — the same library gives the same brief', () => {
  const { store, cleanup } = makeStore();
  try {
    const index = buildRelationshipIndex({ store });
    assert.deepEqual(buildVarietyBrief({ index }), buildVarietyBrief({ index }));
  } finally {
    cleanup();
  }
});

test('every requested shape is a real one from the taxonomy', () => {
  const { store, cleanup } = makeStore();
  try {
    const brief = buildVarietyBrief({ index: buildRelationshipIndex({ store }), count: 8 });
    const ids = new Set(SHAPES.map((s) => s.id));
    for (const shape of [...brief.relationshipShapes, ...brief.avoidShapes]) {
      assert.ok(ids.has(shape), `invented shape: ${shape}`);
    }
  } finally {
    cleanup();
  }
});

test('a run with no pair-author output degrades to unknown rather than failing', () => {
  const { store, cleanup } = makeStore();
  try {
    const { runId } = store.createRun({ slug: 'bare', theme: null });
    const attemptId = store.createAttempt(runId);
    store.updateStatus(runId, 'running');
    store.writeAttemptArtifact(runId, attemptId, 'board.json', {
      id: 'asto-bare',
      title: 'bare',
      sets: [{ id: 's1', relationshipLabel: 'x', explanation: 'e', pairs: [['A', 'B'], ['C', 'D']], difficulty: 1 }],
    });
    store.completeAttempt(runId, attemptId, { status: 'complete' });
    store.updateStatus(runId, 'awaiting-review');

    assert.doesNotThrow(() => buildRelationshipIndex({ store }));
    const index = buildRelationshipIndex({ store });
    assert.ok(index.unknown >= 1, 'an unjoinable set was not counted as unknown');
  } finally {
    cleanup();
  }
});

// Publishing an approved board into puzzles/ must not disturb the index. Its
// shapes are already counted through its RUN, joined from the pair author's
// declarations — the reliable path. The puzzles/ walk exists only for the two
// hand-authored boards, which predate the `shape` field and are hand-labelled
// in the vocabulary. A published board has no hand label and needs none;
// counting it as `unknown` would have added four to that tally per board and
// slowly told every future brief that the corpus is unreadable.
test('a published board does not disturb the index — its run already counted it', () => {
  const { store, cleanup } = makeStore();
  const puzzlesDir = mkdtempSync(join(tmpdir(), 'asto-puzzles-'));
  try {
    const before = buildRelationshipIndex({ store, puzzlesDir });
    assert.equal(before.unknown, 0, 'the empty puzzles dir should contribute nothing');

    writeFileSync(
      join(puzzlesDir, 'birds.json'),
      JSON.stringify({
        id: 'asto-birds',
        title: 'Birds',
        sets: [
          { id: 's1', relationshipLabel: 'x', explanation: 'e', pairs: [['A', 'B'], ['C', 'D']], difficulty: 1 },
          { id: 's2', relationshipLabel: 'y', explanation: 'e', pairs: [['E', 'F'], ['G', 'H']], difficulty: 2 },
        ],
      }),
    );

    const after = buildRelationshipIndex({ store, puzzlesDir });
    assert.equal(after.unknown, 0, 'a published board was counted as unknown');
    assert.deepEqual(after.counts, before.counts, 'a published board moved the shape counts');
  } finally {
    rmSync(puzzlesDir, { recursive: true, force: true });
    cleanup();
  }
});

test('a hand-authored board is still counted through its labels', () => {
  const { store, cleanup } = makeStore();
  const puzzlesDir = mkdtempSync(join(tmpdir(), 'asto-puzzles-'));
  try {
    // Same id as the shipped board, so the hand labels in the vocabulary apply.
    writeFileSync(
      join(puzzlesDir, 'first-light.json'),
      JSON.stringify({
        id: 'asto-first-light',
        title: 'First Light',
        sets: [
          { id: 'set-tools', relationshipLabel: 'x', explanation: 'e', pairs: [['A', 'B'], ['C', 'D']], difficulty: 1 },
        ],
      }),
    );

    const index = buildRelationshipIndex({ store, puzzlesDir });
    assert.equal(index.counts['agent-instrument'], 1, 'a hand-labelled set stopped counting');
  } finally {
    rmSync(puzzlesDir, { recursive: true, force: true });
    cleanup();
  }
});

test('an empty library still produces a usable brief', () => {
  const brief = buildVarietyBrief({ index: { counts: {}, recent: [], unknown: 0 }, count: 6 });
  assert.equal(brief.count, 6);
  assert.ok(brief.relationshipShapes.length >= 2);
  assert.deepEqual(brief.avoidShapes, []);
});
