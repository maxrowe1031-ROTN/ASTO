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

import {
  buildRelationshipIndex,
  buildStanceQuotas,
  buildThemedBrief,
  buildVarietyBrief,
  SHAPES,
  SURPRISE_ME_ONLY,
} from '../../studio/variety.js';
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
    // First Light (the tutorial board) and Warm Up (list slot 1), four hand-labelled
    // sets each. Warm Up left this count for a day when its old file was retired, and
    // returned under its own slug when Max put it back at the head of the list
    // (D-20 second addendum) — the library counts what ships.
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

// Word-repetition avoidance (D-19, 2026-08-11). Max's three-time signal:
// "kindling:ember, mallet was just in the last puzzle… theres a lot of words
// out there. we don't want to be retreading territory too soon." The index
// gathers the words of the most recently PUBLISHED boards; the brief hands
// them to 01 as a soft avoid-list. Published boards only — a rejected board's
// words never reached a player, and mock runs are already excluded.
test('the index gathers the words of recently published boards, newest first', () => {
  const { store, cleanup } = makeStore();
  try {
    const early = seedRun(store, { slug: 'early', shapes: ['conversion', 'agent-instrument'] });
    const late = seedRun(store, { slug: 'late', shapes: ['conversion', 'agent-instrument'] });
    seedRun(store, { slug: 'never-published', shapes: ['conversion', 'agent-instrument'] });
    store.appendDecision(early, { type: 'publish', attemptId: '0001', at: '2026-08-10T00:00:00Z' });
    store.appendDecision(late, { type: 'publish', attemptId: '0001', at: '2026-08-11T00:00:00Z' });

    const index = buildRelationshipIndex({ store });
    assert.ok(index.recentPublishedWords.includes('Seed'), 'published words missing');
    // Two published boards share the same fixture words — the list stays deduped.
    assert.equal(
      index.recentPublishedWords.filter((word) => word === 'Seed').length,
      1,
      'words repeat in the avoid list',
    );
  } finally {
    cleanup();
  }
});

test('an unpublished run contributes no words to the avoid list', () => {
  const { store, cleanup } = makeStore();
  try {
    seedRun(store, { slug: 'only-approved', shapes: ['conversion', 'agent-instrument'] });
    const index = buildRelationshipIndex({ store });
    assert.deepEqual(index.recentPublishedWords, []);
  } finally {
    cleanup();
  }
});

test('the brief carries the avoid-words, on themed runs too', () => {
  const { store, cleanup } = makeStore();
  try {
    const runId = seedRun(store, { slug: 'pub', shapes: ['conversion', 'agent-instrument'] });
    store.appendDecision(runId, { type: 'publish', attemptId: '0001', at: '2026-08-11T00:00:00Z' });
    const index = buildRelationshipIndex({ store });
    assert.ok(buildVarietyBrief({ index, count: 8 }).avoidWords.includes('Seed'));
    assert.ok(buildThemedBrief({ index, count: 8 }).avoidWords.includes('Seed'));
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

// --- how the hardest set earned its difficulty (design.md D-8) ------------
//
// On 2026-08-05 Max approved five boards and said none of them gave him the
// rush. Every one reached its hardest set the same way — through a word fewer
// people know (coronagraph, speleothem, Paris-Roubaix) — because 03 counted
// familiarity as difficulty and 04 promoted whatever it ranked hardest.
//
// The steer is against a RUT, never against a KIND. Max was explicit: "they can
// both be black, depending on the puzzle. I don't want to fall into a
// repetitive hole where only one type of puzzle is one difficulty."

const gradedRun = (store, { slug, blackShape, source, difficulties = [1, 2, 3, 4] }) => {
  const { runId } = store.createRun({ slug, theme: slug, brief: { count: 8 } });
  const attemptId = store.createAttempt(runId);
  store.updateStatus(runId, 'running');
  const words = difficulties.map((d) => [`w${d}a`, `w${d}b`, `w${d}c`, `w${d}d`]);
  store.writeStageArtifact(runId, attemptId, '01-pair-author', 'output.json', {
    pairs: difficulties.flatMap((d, i) => [
      { a: words[i][0], b: words[i][1], relationshipLabel: 'r', shape: d === 4 ? blackShape : 'conversion' },
      { a: words[i][2], b: words[i][3], relationshipLabel: 'r', shape: d === 4 ? blackShape : 'conversion' },
    ]),
  });
  if (source) {
    store.writeStageArtifact(runId, attemptId, '03-difficulty-rater', 'output.json', {
      grades: difficulties.map((d, i) => ({
        setId: `s${d}`,
        difficulty: d,
        difficultySource: d === 4 ? source : 'arrangement',
        rationale: 'r',
      })),
    });
  }
  store.writeAttemptArtifact(runId, attemptId, 'board.json', {
    id: `asto-${slug}`,
    title: slug,
    sets: difficulties.map((d, i) => ({
      id: `s${d}`,
      relationshipLabel: 'r',
      explanation: 'e',
      pairs: [[words[i][0], words[i][1]], [words[i][2], words[i][3]]],
      difficulty: d,
    })),
  });
  store.completeAttempt(runId, attemptId, { status: 'complete' });
  store.updateStatus(runId, 'awaiting-review');
  return runId;
};

test('03\'s own judgement is what the index records when it exists', () => {
  const { store, cleanup } = makeStore();
  try {
    // A shape the fallback would call `arrangement`, declared `vocabulary` by
    // the rater — which is exactly the astronomy case the fallback gets wrong.
    gradedRun(store, { slug: 'declared', blackShape: 'conversion', source: 'vocabulary' });
    const index = buildRelationshipIndex({ store });
    assert.equal(index.hardestSources.at(-1), 'vocabulary');
  } finally {
    cleanup();
  }
});

test('without a declared source it falls back to the shape', () => {
  const { store, cleanup } = makeStore();
  try {
    gradedRun(store, { slug: 'named', blackShape: 'class-individual', source: null });
    gradedRun(store, { slug: 'arranged', blackShape: 'before-after', source: null });
    const index = buildRelationshipIndex({ store });
    assert.deepEqual(index.hardestSources.slice(-2), ['vocabulary', 'arrangement']);
  } finally {
    cleanup();
  }
});

// The bite-check that caught this: with the index's stance recording disabled,
// every stance test above still passed, because they all feed `hardestStances`
// in by hand. Nothing proved the index actually FILLS it — the same shape of
// bug as the revision channel, which was faithfully recorded and never read.
test('the index records the hardest set\'s STANCE, not just how it was hard', () => {
  const { store, cleanup } = makeStore();
  try {
    // `before-after` is a time set; `class-individual` is inclusion. Both are
    // the board's Black in their own run.
    gradedRun(store, { slug: 'spanned', blackShape: 'before-after', source: null });
    gradedRun(store, { slug: 'named', blackShape: 'class-individual', source: null });
    const index = buildRelationshipIndex({ store });
    assert.deepEqual(index.hardestStances.slice(-2), ['time', 'inclusion']);
  } finally {
    cleanup();
  }
});

// The two axes are recorded independently: a declared `difficultySource` short
// -circuits the source fallback, and must not take the stance down with it.
test('a declared difficultySource does not cost the board its stance', () => {
  const { store, cleanup } = makeStore();
  try {
    gradedRun(store, { slug: 'declared', blackShape: 'before-after', source: 'vocabulary' });
    const index = buildRelationshipIndex({ store });
    assert.equal(index.hardestSources.at(-1), 'vocabulary');
    assert.equal(index.hardestStances.at(-1), 'time');
  } finally {
    cleanup();
  }
});

test('three boards hard the same way asks the next one to vary', () => {
  const brief = buildVarietyBrief({
    index: { counts: {}, recent: [], unknown: 0, hardestSources: ['vocabulary', 'vocabulary', 'vocabulary'] },
    count: 8,
  });
  assert.equal(brief.varyHardestFrom, 'vocabulary');
});

test('it steers away from an arrangement rut too — neither kind is the right answer', () => {
  const brief = buildVarietyBrief({
    index: { counts: {}, recent: [], unknown: 0, hardestSources: ['arrangement', 'arrangement', 'arrangement'] },
    count: 8,
  });
  assert.equal(brief.varyHardestFrom, 'arrangement');
});

// The load-bearing test. A rule reserving Black for one kind is the failure
// this whole change exists to avoid, so a mixed history must say NOTHING.
test('a varied history carries no steer at all', () => {
  for (const history of [
    ['vocabulary', 'arrangement', 'vocabulary'],
    ['arrangement', 'arrangement', 'vocabulary'],
    ['both', 'both', 'both'],
    ['vocabulary', 'vocabulary'],
    [],
  ]) {
    const brief = buildVarietyBrief({ index: { counts: {}, recent: [], unknown: 0, hardestSources: history }, count: 8 });
    assert.equal(brief.varyHardestFrom, undefined, JSON.stringify(history));
  }
});

test('the steer reaches the pair author as a nudge, and is silent otherwise', async () => {
  const author = await import('../../studio/agents/pair-author.js');
  const withSteer = author.buildPrompt({ theme: 'caves', brief: { count: 8, varyHardestFrom: 'vocabulary' } }, {});
  assert.match(withSteer, /reach its top tier through arrangement/);
  const without = author.buildPrompt({ theme: 'caves', brief: { count: 8 } }, {});
  assert.ok(!/top tier through arrangement/.test(without));
});

// --- the hardest-slot ask (design.md D-13, second amendment) ---
//
// D-8's steer stopped every Black being a rare word; what filled the space was
// a clock. The FIRST stance lever named one stance to avoid and fired on a
// rut — and the batch that tested it (2026-08-08 evening) proved an exclusion
// only relocates the slot: told to avoid `dimension`, five of six boards
// topped out on a time span, three builders citing the steer as their reason,
// and the sixth escaped through a rare word. So the lever is now POSITIVE and
// ALWAYS ON: every brief names the 2-3 stances least used in the hardest
// slot, with the old lean kept as the explanation when a rut exists. Max:
// "All puzzles should pull from all taxonomies."

const stanceIndex = (hardestStances) => ({ counts: {}, recent: [], unknown: 0, hardestStances });

test('the ask is on every brief — even a varied history names underused territory', () => {
  const varied = buildVarietyBrief({
    index: stanceIndex(['time', 'cause', 'time', 'event', 'inclusion', 'possession', 'time', 'dimension']),
    count: 8,
  });
  // Varied enough that the OLD lever said nothing — the always-on ask still
  // names the stances the hardest slot has never used.
  assert.deepEqual(varied.hardestStanceAsk, ['absence', 'reference', 'cause']);
  assert.equal(varied.hardestStanceLean, undefined, 'no rut, so nothing to lean against');

  const empty = buildVarietyBrief({ index: stanceIndex([]), count: 8 });
  assert.equal(empty.hardestStanceAsk.length, 3, 'an empty library still gets an ask');
});

test('the rutted stance can never be asked for, and the lean names it', () => {
  const brief = buildVarietyBrief({
    index: stanceIndex(['time', 'time', 'time', 'time', 'cause', 'event', 'inclusion', 'possession']),
    count: 8,
  });
  assert.equal(brief.hardestStanceLean, 'time', 'four of eight is the calibrated half-share');
  assert.ok(!brief.hardestStanceAsk.includes('time'), 'the most-used stance cannot be underused');
  assert.deepEqual(brief.hardestStanceAsk, ['absence', 'dimension', 'reference']);
});

test('below the half-share, or below the window, there is an ask but no lean', () => {
  const threeOfEight = buildVarietyBrief({
    index: stanceIndex(['cause', 'inclusion', 'event', 'possession', 'dimension', 'time', 'time', 'time']),
    count: 8,
  });
  assert.equal(threeOfEight.hardestStanceLean, undefined, 'three of eight is not a rut');
  assert.ok(threeOfEight.hardestStanceAsk.length > 0);

  const shortHistory = buildVarietyBrief({ index: stanceIndex(['time', 'time', 'time']), count: 8 });
  assert.equal(shortHistory.hardestStanceLean, undefined, 'shorter than the window is not evidence of a rut');
  assert.ok(!shortHistory.hardestStanceAsk.includes('time'));
});

// Window count first, then ALL-TIME count, then name — so a stance heavily
// used before the window does not sneak back in on an alphabetical tie.
test('the ask ranks by window, then all-time, then name', () => {
  const history = [
    'cause', 'cause', // older than the window
    'inclusion', 'possession', 'event', 'cause', 'time', 'dimension', 'reference', 'absence',
  ];
  const brief = buildVarietyBrief({ index: stanceIndex(history), count: 8 });
  // Window: all eight tied at one use. All-time breaks the tie: cause has
  // three, so it drops out of the bottom three despite its alphabetical rank.
  assert.deepEqual(brief.hardestStanceAsk, ['absence', 'dimension', 'event']);
});

test('the ask is deterministic — the same library always produces the same brief', () => {
  const history = ['time', 'time', 'time', 'time', 'cause', 'cause', 'cause', 'cause'];
  const first = buildVarietyBrief({ index: stanceIndex(history), count: 8 });
  const again = buildVarietyBrief({ index: stanceIndex(history), count: 8 });
  assert.deepEqual(first.hardestStanceAsk, again.hardestStanceAsk);
  assert.equal(first.hardestStanceLean, again.hardestStanceLean);
});

// Both steers are independent — a board can be in both ruts at once, and
// neither should suppress the other.
test('the difficulty steer and the ask ride the same brief without colliding', () => {
  const brief = buildVarietyBrief({
    index: {
      counts: {},
      recent: [],
      unknown: 0,
      hardestSources: ['arrangement', 'arrangement', 'arrangement'],
      hardestStances: ['time', 'time', 'time', 'time', 'cause', 'event', 'inclusion', 'possession'],
    },
    count: 8,
  });
  assert.equal(brief.varyHardestFrom, 'arrangement');
  assert.equal(brief.hardestStanceLean, 'time');
  assert.ok(brief.hardestStanceAsk.length > 0);
});

test('the ask reaches BOTH the author and the builder, with its paradigm teaching', async () => {
  const author = await import('../../studio/agents/pair-author.js');
  const builder = await import('../../studio/agents/board-builder.js');

  const authored = author.buildPrompt(
    { theme: 'caves', brief: { count: 8, hardestStanceAsk: ['possession', 'cause'], hardestStanceLean: 'time' } },
    {},
  );
  assert.match(authored, /HARDEST set a TIME question/);
  assert.match(authored, /POSSESSION \(/, 'the ask names its stances with their descriptions');
  // Phrased so it cannot be read as banning anything — Max approved five span
  // Blacks the same evening he asked for this.
  assert.match(authored, /Any stance is still welcome/);
  // The festivals ride-along: hard material must not leave the theme.
  assert.match(authored, /inside the theme's world/);

  // The builder is what actually assigns difficulty 4; an ask that stopped at
  // the author would only change what was available, not what got promoted.
  const built = builder.buildPrompt(
    {
      gradedSets: [{ id: 's', stance: 'time', difficulty: 4, pairs: [['a', 'b'], ['c', 'd']] }],
      hardestStanceAsk: ['possession', 'cause'],
      hardestStanceLean: 'time',
    },
    {},
  );
  assert.match(built, /TIME set at difficulty 4/);
  assert.match(built, /POSSESSION \(/);
  assert.match(built, /genuinely hardest set/, "D-8's escape hatch survives the rewrite");

  // Without a lean the ask still renders; without an ask nothing does.
  const noLean = author.buildPrompt({ theme: 'caves', brief: { count: 8, hardestStanceAsk: ['event'] } }, {});
  assert.match(noLean, /EVENT \(/);
  assert.doesNotMatch(noLean, /HARDEST set a [A-Z]+ question/);
  assert.doesNotMatch(author.buildPrompt({ theme: 'caves', brief: { count: 8 } }, {}), /underused in the hardest slot/);
  assert.doesNotMatch(builder.buildPrompt({ gradedSets: [] }, {}), /underused in the hardest slot/);
});

// The content line (design.md D-13, second amendment, ride-along B): Max's
// school note — "anything about mass shootings, that would be an automatic
// throw out" — was a rule the pipeline had never been told. 01 carries it
// always; 08 reports beside unity and evocativeness, never gating.
test('the content line is always in 01, and 08 asks for contentConcerns', async () => {
  const author = await import('../../studio/agents/pair-author.js');
  const style = await import('../../studio/agents/style-guide.js');

  assert.match(
    author.buildPrompt({ theme: 'school', brief: { count: 8 } }, {}),
    /never material for a pair/,
  );
  const stylePrompt = style.buildPrompt({ items: [], words: [], theme: 'school' }, {});
  assert.match(stylePrompt, /contentConcerns/);
  assert.match(stylePrompt, /flag for the editor, not a judgement/);
});

// --- one door for the brief (the D-13 gap) ---
//
// D-13's `varyHardestStance` was added to the variety brief and reached only
// surprise-me runs, because two callers each re-listed what a themed brief
// carries and neither list learned about the new field. Every board Max was
// complaining about when he asked for that steer was a THEMED run, so the
// lever built to answer him was switched off for exactly the runs he makes.
//
// These tests pin the rule as a CLASS rather than as the one field that was
// caught: a themed brief differs from a variety brief by the surprise-me
// markers and by nothing else, ever.

/** An index that fires every cross-board steer at once, so no key is missing by luck. */
const FULLY_STEERED_INDEX = {
  counts: {},
  recent: [],
  unknown: 0,
  hardestSources: ['vocabulary', 'vocabulary', 'vocabulary'],
  hardestStances: ['time', 'time', 'time', 'time', 'time', 'cause', 'event', 'inclusion'],
};

test('a themed brief carries every steer the variety brief carries', () => {
  const variety = buildVarietyBrief({ index: FULLY_STEERED_INDEX, count: 14 });
  const themed = buildThemedBrief({ index: FULLY_STEERED_INDEX, count: 14 });

  // Derived from the variety brief rather than from a hand-written list: a
  // steer added tomorrow is in this comparison the moment it exists.
  const shouldTravel = Object.keys(variety).filter((key) => !SURPRISE_ME_ONLY.includes(key));
  assert.ok(shouldTravel.includes('hardestStanceAsk'), 'the fixture index must produce the ask');
  assert.ok(shouldTravel.includes('hardestStanceLean'), 'the fixture index must fire the lean');
  assert.ok(shouldTravel.includes('varyHardestFrom'), 'the fixture index must fire the source steer');

  for (const key of shouldTravel) {
    assert.deepEqual(
      themed[key],
      variety[key],
      `"${key}" reaches surprise-me runs but not themed ones. Either forward it in ` +
        `buildThemedBrief or add it to SURPRISE_ME_ONLY with a reason — a steer that ` +
        `only fires on half the runs is D-13's gap reopening.`,
    );
  }
});

test('the surprise-me markers are the ONLY difference', () => {
  const variety = buildVarietyBrief({ index: FULLY_STEERED_INDEX, count: 14 });
  const themed = buildThemedBrief({ index: FULLY_STEERED_INDEX, count: 14 });

  assert.deepEqual(
    Object.keys(variety).filter((key) => !(key in themed)).sort(),
    [...SURPRISE_ME_ONLY].sort(),
  );
  // `relationshipShapes` is what the rest of the Studio reads to classify a run,
  // so a themed run growing one would silently become a surprise-me run.
  for (const marker of SURPRISE_ME_ONLY) assert.equal(marker in themed, false, marker);
  assert.deepEqual(Object.keys(themed).filter((key) => !(key in variety)), []);
});

// The live corpus, not a fixture. Last session's lesson: every stance test fed
// `hardestStances` in by hand, so nothing proved the real index populates it.
// Phrased as an invariant rather than a value — when the rut clears, this test
// must keep passing rather than needing an edit.
test('the two doors agree on the real library', async () => {
  const { createRunStore } = await import('../../studio/storage/run-store.js');
  const { fileURLToPath } = await import('node:url');
  const store = createRunStore({
    rootDir: fileURLToPath(new URL('../../studio/runs/', import.meta.url)),
  });
  const index = buildRelationshipIndex({ store });

  const variety = buildVarietyBrief({ index, count: 14 });
  const themed = buildThemedBrief({ index, count: 14 });
  for (const key of Object.keys(variety).filter((k) => !SURPRISE_ME_ONLY.includes(k))) {
    assert.deepEqual(themed[key], variety[key], `"${key}" differs between the two doors on the real library`);
  }
});
