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
  buttonTap, rungShift, setVolume, toggleMuted, update
} from '../src/view/sound.js';
import { Storage } from '../src/storage.js';

/** The smallest state the module reads: a puzzle id, a selection, a status. */
const state = (terms, puzzleId = 'asto-test', status = 'playing') => ({
  puzzle: { id: puzzleId },
  selectedTerms: Object.freeze([...terms]),
  status
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

test('the fourth solve is a win, and only the fourth — the fanfare fires once', () => {
  let snapshot = cue(null, state(['a', 'b', 'c', 'd']), null).snapshot;
  // An ordinary solve mid-game stays a solve.
  const mid = cue(snapshot, state([]), { type: 'solved', setId: 's1' });
  assert.equal(mid.kind, 'solve');
  // The solve that ends the game — status is already 'won' on this render.
  snapshot = cue(mid.snapshot, state(['e', 'f', 'g', 'h']), null).snapshot;
  const last = cue(snapshot, state([], 'asto-test', 'won'), { type: 'solved', setId: 's4' });
  assert.equal(last.kind, 'win');
  // The end screen repainting afterwards plays nothing more.
  const after = cue(last.snapshot, state([], 'asto-test', 'won'), null);
  assert.equal(after.kind, null);
});

test('the fanfare recipe is a rising triad on a filtered saw, frozen', () => {
  assert.ok(Object.isFrozen(SOUND.win));
  assert.ok(Object.isFrozen(SOUND.win.notes));
  const freqs = SOUND.win.notes.map((n) => n.freq);
  assert.deepEqual(freqs, [523.25, 659.25, 783.99]); // C5, E5, G5
  // Rising delays, the last note held longest — "ta-da-daa", not a chord.
  const delays = SOUND.win.notes.map((n) => n.delay);
  assert.ok(delays[0] < delays[1] && delays[1] < delays[2]);
  assert.ok(SOUND.win.notes[2].dur > SOUND.win.notes[1].dur * 3);
  // It waits for the end screen (the solve beat runs ~1.2s of motion) plus a
  // breath — the horn belongs to the final page, not to the fourth chime.
  assert.ok(SOUND.win.after >= 1.2);
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

test('deselect sounds at the rung the frame returns to; clear stays silent', () => {
  // Revised 2026-08-25: the audition shipped deselect silent and Max asked for
  // a sound — the duller cousin, stepping back DOWN the ladder.
  let snapshot = cue(null, state([]), null).snapshot; // first render: silent resync
  const script = [
    [['a'], null, 'select', rungShift(1)],
    [['a', 'b'], null, 'select', rungShift(2)],
    [['a'], null, 'deselect', rungShift(1)], // back down to rung 1
    [[], null, 'deselect', rungShift(1)],    // the last removal, clamped low
    [['x'], null, 'select', rungShift(1)]    // fresh frame: back at rung 1
  ];
  for (const [terms, outcome, expected, rung] of script) {
    const decision = cue(snapshot, state(terms), outcome);
    snapshot = decision.snapshot;
    assert.equal(decision.kind, expected);
    if (expected !== null) assert.equal(decision.rung, rung);
  }
  // The Clear button empties 4 → 0 in one render: a reset, and silent — the
  // button itself speaks through app.js's buttonTap wiring.
  let full = cue(null, state([]), null).snapshot;
  for (const terms of [['a'], ['a', 'b'], ['a', 'b', 'c'], ['a', 'b', 'c', 'd']]) {
    full = cue(full, state(terms), null).snapshot;
  }
  assert.equal(cue(full, state([]), null).kind, null);
});

test('the deselect recipe is the select made duller, and frozen', () => {
  assert.ok(Object.isFrozen(SOUND.deselect));
  assert.ok(SOUND.deselect.freq < SOUND.select.freq, 'lower');
  assert.ok(SOUND.deselect.gain < SOUND.select.gain, 'softer');
  assert.ok(SOUND.deselect.dur < SOUND.select.dur, 'shorter');
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
  assert.doesNotThrow(() => buttonTap());
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
