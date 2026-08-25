// The sound module's decision half, tested as the pure math it is — no DOM, no
// AudioContext, no browser. Importing this file in node IS the first assertion:
// sound.js must load with no audio platform present, because that is exactly
// the environment a refused AudioContext leaves it in.
//
// What these tests make impossible:
//   - Max's audited numbers drifting (the dials are the deliverable; the recipe
//     is derived, and the derivation is pinned here)
//   - the frame ladder desynchronizing from the selection count
//   - a selection delta being misread (reorder and shuffle must be silent)
//   - the outcome routing changing silently (already-tried thuds; hint doesn't)
//   - any code path throwing when audio or storage is broken

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SOUND, classifyTransition, cue, cupRecipe, getVolume, init, isMuted,
  preview, rungShift, setVolume, toggleMuted, update
} from '../src/view/sound.js';
import { Storage } from '../src/storage.js';

/** The smallest state the module reads: a puzzle id and a selection. */
const state = (terms, puzzleId = 'asto-test') => ({
  puzzle: { id: puzzleId },
  selectedTerms: Object.freeze([...terms])
});

/** Run a sequence of renders through cue(), returning the kinds it decided. */
function playThrough(frames) {
  let snapshot = null;
  const kinds = [];
  for (const [terms, outcome] of frames) {
    const decision = cue(snapshot, state(terms), outcome ?? null);
    snapshot = decision.snapshot;
    kinds.push(decision.kind);
  }
  return kinds;
}

const fakeStore = () => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k)
  };
};

// --- the parameter table ---

test('the table is frozen — tuning is a code change, not a runtime event', () => {
  assert.ok(Object.isFrozen(SOUND));
  assert.ok(Object.isFrozen(SOUND.select));
  assert.ok(Object.isFrozen(SOUND.ladder));
  assert.ok(Object.isFrozen(SOUND.ladder.steps));
  assert.ok(Object.isFrozen(SOUND.solve));
  assert.ok(Object.isFrozen(SOUND.mistake.strikes));
  assert.ok(Object.isFrozen(SOUND.mistake.strikes[0].partials));
});

test("the cup carries Max's dials: Body 30, Damping 86", () => {
  assert.equal(SOUND.solve.body, 0.3);
  assert.equal(SOUND.solve.damping, 0.86);
});

test('the derivation reproduces the audition at those dials', () => {
  // These are the numbers the audition page computed at 30/86 — the recipe Max
  // approved by ear. If the formulas drift, this is what says so.
  const recipe = cupRecipe();
  assert.ok(Math.abs(recipe.root - 808.84) < 0.01);
  assert.equal(recipe.lowpass, 9000 - 0.86 * 7000); // 2980
  assert.deepEqual(recipe.strikes.map((s) => s.ratio), [1, 1.335, 1.588]);
  // Damping is what separates cup from bell: the upper partials must decay
  // faster than the fundamental, and pull toward harmonic.
  const [, second, third] = recipe.partials;
  assert.ok(second[0] < 2.76 && second[2] < 0.5);
  assert.ok(third[0] < 5.4 && third[2] < 0.4);
  // The final strike's ring shortens with damping.
  assert.ok(Math.abs(recipe.strikes[2].dur - (0.85 - 0.86 * 0.35)) < 1e-9);
});

test('the paper select and woodblock mistake match the audited recipes', () => {
  assert.deepEqual({ ...SOUND.select }, { freq: 2400, q: 1.4, dur: 0.05, gain: 0.3 });
  const [first, second] = SOUND.mistake.strikes;
  assert.equal(first.freq, 233.08);
  assert.equal(second.freq, 196.0);
  assert.equal(second.delay, 0.11);
  // The audited woodblock is dark: one faint overtone, no ninth bar mode.
  assert.equal(first.partials.length, 2);
  assert.deepEqual([...first.partials[1]], [3.9, 0.1, 1]);
});

// --- the frame ladder ---

test('the ladder rises 0 / 1.1 / 2.2 / 3.85 semitones across the four slots', () => {
  const semis = [1, 2, 3, 4].map((count) => Math.log2(rungShift(count)) * 12);
  assert.deepEqual(semis.map((s) => Math.round(s * 100) / 100), [0, 1.1, 2.2, 3.85]);
});

test('the rung clamps outside the frame rather than inventing a fifth slot', () => {
  assert.equal(rungShift(0), rungShift(1));
  assert.equal(rungShift(5), rungShift(4));
  assert.equal(rungShift(-3), rungShift(1));
});

// --- the transition classifier ---

test('growing by one is a select; shrinking by one is a deselect', () => {
  assert.equal(classifyTransition(['a'], ['a', 'b'], null), 'select');
  assert.equal(classifyTransition(['a', 'b'], ['a'], null), 'deselect');
  assert.equal(classifyTransition([], ['a'], null), 'select');
});

test('the same four words in any order are silent — reorder, shuffle, repaint', () => {
  assert.equal(classifyTransition(['a', 'b', 'c'], ['c', 'a', 'b'], null), null);
  assert.equal(classifyTransition(['a'], ['a'], null), null);
  assert.equal(classifyTransition([], [], null), null);
});

test('emptying the frame is a reset, not four deselects', () => {
  assert.equal(classifyTransition(['a', 'b', 'c', 'd'], [], null), 'reset');
  assert.equal(classifyTransition(['a', 'b', 'c'], ['a'], null), 'reset');
});

test('any outcome silences the delta — the outcome channel owns those sounds', () => {
  assert.equal(classifyTransition(['a', 'b', 'c', 'd'], [], { type: 'solved' }), null);
  assert.equal(classifyTransition(['a'], ['a', 'b'], { type: 'hint' }), null);
});

// --- the whole decision ---

test('a full round: four rising selects, then the solve', () => {
  const kinds = playThrough([
    [[]],
    [['a']], [['a', 'b']], [['a', 'b', 'c']], [['a', 'b', 'c', 'd']],
    [[], { type: 'solved', setId: 's', canonicalOrder: ['a', 'b', 'c', 'd'] }]
  ]);
  assert.deepEqual(kinds, [null, 'select', 'select', 'select', 'select', 'solve']);
});

test('each select carries the rung for its new count', () => {
  let snapshot = cue(null, state([]), null).snapshot;
  const rungs = [];
  for (const terms of [['a'], ['a', 'b'], ['a', 'b', 'c']]) {
    const decision = cue(snapshot, state(terms), null);
    snapshot = decision.snapshot;
    rungs.push(decision.rung);
  }
  assert.deepEqual(rungs, [rungShift(1), rungShift(2), rungShift(3)]);
});

test('all three shaking outcomes thud, including the free already-tried', () => {
  for (const type of ['miss', 'so-close', 'already-tried']) {
    const kinds = playThrough([
      [['a', 'b', 'c', 'd']],
      [[], { type }]
    ]);
    assert.equal(kinds[1], 'mistake', `${type} must sound like the shake it rides`);
  }
});

test('hint, vocab, and invalid are explicitly silent', () => {
  for (const type of ['hint', 'vocab', 'invalid']) {
    const kinds = playThrough([
      [['a', 'b']],
      [['a', 'b'], { type }]
    ]);
    assert.equal(kinds[1], null, `${type} must play nothing`);
  }
});

test('deselect and clear are silent, and the ladder restarts by construction', () => {
  let snapshot = cue(null, state([]), null).snapshot; // first render: silent resync
  const script = [
    [['a'], null, 'select'],
    [['a', 'b'], null, 'select'],
    [['a'], null, null],        // deselect: silent
    [[], null, null],           // clear (via single removal path): silent
    [['x'], null, 'select']     // fresh frame: back at rung 1
  ];
  for (const [terms, outcome, expected] of script) {
    const decision = cue(snapshot, state(terms), outcome);
    snapshot = decision.snapshot;
    assert.equal(decision.kind, expected);
  }
  const last = cue(snapshot, state(['x', 'y']), null);
  assert.equal(last.rung, rungShift(2));
});

test('crossing into a new board resyncs silently, whatever the selection', () => {
  let snapshot = cue(null, state(['a', 'b'], 'asto-one'), null).snapshot;
  const decision = cue(snapshot, state(['p'], 'asto-two'), null);
  assert.equal(decision.kind, null);
  // And the next select on the new board is an ordinary rung-2 select.
  const next = cue(decision.snapshot, state(['p', 'q'], 'asto-two'), null);
  assert.equal(next.kind, 'select');
  assert.equal(next.rung, rungShift(2));
});

// --- the impure surface, with no audio platform at all ---

test('update() with no AudioContext returns undefined and never throws', () => {
  init(new Storage({ store: fakeStore() }));
  assert.equal(update(state(['a']), null), undefined);
  assert.equal(update(state([]), { type: 'solved' }), undefined);
  assert.doesNotThrow(() => preview());
});

test('mute round-trips through storage and survives a re-init', () => {
  const store = fakeStore();
  init(new Storage({ store }));
  assert.equal(isMuted(), false);
  assert.equal(toggleMuted(), true);
  init(new Storage({ store }));
  assert.equal(isMuted(), true);
  toggleMuted();
});

test('volume round-trips, clamps, and survives a re-init', () => {
  const store = fakeStore();
  init(new Storage({ store }));
  setVolume(60);
  assert.equal(getVolume(), 60);
  setVolume(400);
  assert.equal(getVolume(), 100);
  init(new Storage({ store }));
  assert.equal(getVolume(), 100);
});

test('init with no storage at all still leaves a working, silent module', () => {
  init(null);
  assert.equal(isMuted(), false);
  assert.equal(getVolume(), 25);
  assert.doesNotThrow(() => update(state(['a']), null));
  assert.doesNotThrow(() => toggleMuted());
  init(null); // leave module state clean for any suite ordered after this one
});
