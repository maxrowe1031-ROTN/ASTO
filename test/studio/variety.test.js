// Variety as a pipeline property (locked decision 6): with no theme, the
// pipeline picks an underused relationship shape for itself rather than
// relying on Max to remember what the last board did.
//
// The index is recomputed on demand from what actually shipped and what runs
// produced, so there is no second mutable file to keep in step.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildRelationshipIndex, buildVarietyBrief, SHAPES } from '../../studio/variety.js';
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

test('the taxonomy covers the spec\'s shapes and the GDD\'s relationship types', () => {
  const ids = SHAPES.map((shape) => shape.id);
  for (const required of [
    'transformation',
    'part-whole',
    'tool-function',
    'cause-effect',
    'material-object',
    'young-mature',
    'container-contents',
    'scale-degree',
  ]) {
    assert.ok(ids.includes(required), `taxonomy is missing ${required}`);
  }
  assert.ok(SHAPES.every((shape) => shape.description), 'a shape has no description');
});

test('the shipped boards are already counted — the library does not start empty', () => {
  const { store, cleanup } = makeStore();
  try {
    const index = buildRelationshipIndex({ store });
    const used = Object.values(index.counts).reduce((a, b) => a + b, 0);
    assert.ok(used >= 8, `only ${used} shipped sets counted`);
    assert.ok(index.counts['tool-function'] >= 1, 'First Light\'s tool set is not counted');
  } finally {
    cleanup();
  }
});

test('a run\'s shapes are derived by joining its board back to the pair author', () => {
  const { store, cleanup } = makeStore();
  try {
    const before = buildRelationshipIndex({ store }).counts['container-contents'] ?? 0;
    seedRun(store, { slug: 'one', shapes: ['container-contents', 'part-whole'] });
    const after = buildRelationshipIndex({ store }).counts['container-contents'];
    assert.equal(after, before + 1, 'the run\'s shape was not picked up');
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
    const before = buildRelationshipIndex({ store }).counts['container-contents'] ?? 0;
    seedRun(store, { slug: 'fixture', shapes: ['container-contents', 'part-whole'], mock: true });
    const after = buildRelationshipIndex({ store }).counts['container-contents'] ?? 0;
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
      seedRun(store, { slug, shapes: ['transformation', 'transformation'] });
    }
    const brief = buildVarietyBrief({ index: buildRelationshipIndex({ store }), count: 8 });

    assert.equal(brief.count, 8);
    assert.ok(brief.relationshipShapes.length >= 2);
    assert.ok(brief.avoidShapes.includes('transformation'), 'the overused shape is not avoided');
    assert.equal(
      brief.relationshipShapes.includes('transformation'),
      false,
      'the overused shape was also requested',
    );
  } finally {
    cleanup();
  }
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

test('an empty library still produces a usable brief', () => {
  const brief = buildVarietyBrief({ index: { counts: {}, recent: [], unknown: 0 }, count: 6 });
  assert.equal(brief.count, 6);
  assert.ok(brief.relationshipShapes.length >= 2);
  assert.deepEqual(brief.avoidShapes, []);
});
