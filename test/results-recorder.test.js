// The recorder is the only piece of the select screen that decides anything, so it is
// tested the way the engine is: headlessly, with no DOM and no browser.

import test from 'node:test';
import assert from 'node:assert/strict';

import { ResultsRecorder } from '../src/results-recorder.js';

/** Records what it was told, in order, so a double-write is visible. */
function fakeStorage() {
  const calls = [];
  return { calls, recordResult: (slug, result) => calls.push({ slug, result }) };
}

const state = (status, over = {}) => ({
  status,
  mistakes: 0,
  solvedSetIds: [],
  hintsUsed: 0,
  ...over
});

const on = (slug) => () => slug;

test('a win is recorded with its beans and its solved count', () => {
  const storage = fakeStorage();
  const recorder = new ResultsRecorder(storage, on('first-light'));

  recorder.update(state('playing'));
  recorder.update(state('won', { mistakes: 2, solvedSetIds: ['a', 'b', 'c', 'd'] }));

  assert.deepEqual(storage.calls, [
    { slug: 'first-light', result: { status: 'won', mistakes: 2, solvedCount: 4, hintsUsed: 0 } }
  ]);
});

// The select list's cup colour rides on this: white for a clean board, brown when the
// player took the hint (design.md D-16 addendum).
test('a hinted game records how many hints it spent', () => {
  const storage = fakeStorage();
  const recorder = new ResultsRecorder(storage, on('first-light'));

  recorder.update(state('won', { solvedSetIds: ['a', 'b', 'c', 'd'], hintsUsed: 1 }));

  assert.equal(storage.calls[0].result.hintsUsed, 1);
});

// Results saved before hints existed have no field at all; the recorder itself must
// also cope with a state that lacks one (an old saved game replayed mid-migration).
test('a state without hintsUsed records zero, not undefined', () => {
  const storage = fakeStorage();
  const recorder = new ResultsRecorder(storage, on('first-light'));

  const legacy = state('won', { solvedSetIds: ['a', 'b', 'c', 'd'] });
  delete legacy.hintsUsed;
  recorder.update(legacy);

  assert.equal(storage.calls[0].result.hintsUsed, 0);
});

test('a loss is recorded too, carrying how far the player got', () => {
  const storage = fakeStorage();
  const recorder = new ResultsRecorder(storage, on('yankees-baseball'));

  recorder.update(state('lost', { mistakes: 4, solvedSetIds: ['a', 'b'] }));

  assert.deepEqual(storage.calls[0].result, {
    status: 'lost',
    mistakes: 4,
    solvedCount: 2,
    hintsUsed: 0
  });
});

test('a live game records nothing', () => {
  const storage = fakeStorage();
  const recorder = new ResultsRecorder(storage, on('first-light'));

  recorder.update(state('playing'));
  recorder.update(state('playing', { mistakes: 3, solvedSetIds: ['a'] }));

  assert.deepEqual(storage.calls, []);
});

// The controller repaints a finished game whenever anything else changes — the end view
// has the same guard for the same reason.
test('the same finished game records exactly once, however often it repaints', () => {
  const storage = fakeStorage();
  const recorder = new ResultsRecorder(storage, on('first-light'));

  const finished = state('won', { solvedSetIds: ['a', 'b', 'c', 'd'] });
  recorder.update(finished);
  recorder.update(finished);
  recorder.update(finished);

  assert.equal(storage.calls.length, 1);
});

test('playing the same board again records the new result', () => {
  const storage = fakeStorage();
  const recorder = new ResultsRecorder(storage, on('first-light'));

  recorder.update(state('lost', { mistakes: 4 }));
  recorder.update(state('playing')); // restart
  recorder.update(state('won', { mistakes: 1, solvedSetIds: ['a', 'b', 'c', 'd'] }));

  assert.deepEqual(
    storage.calls.map((call) => call.result.status),
    ['lost', 'won']
  );
});

// The tutorial has no row on the select screen, and cannot be lost — a result for it
// would be a badge for showing up.
test('the tutorial records nothing, because it has no slug', () => {
  const storage = fakeStorage();
  const recorder = new ResultsRecorder(storage, () => null);

  recorder.update(state('won', { solvedSetIds: ['a', 'b', 'c', 'd'] }));

  assert.deepEqual(storage.calls, []);
});

// The slug is read at record time, not construction time: one recorder outlives every
// board swap, exactly as one controller and one set of views do.
test('it records against whichever board is on screen now', () => {
  const storage = fakeStorage();
  let slug = 'first-light';
  const recorder = new ResultsRecorder(storage, () => slug);

  recorder.update(state('won', { solvedSetIds: ['a', 'b', 'c', 'd'] }));
  slug = 'by-the-shore';
  recorder.update(state('playing'));
  recorder.update(state('lost', { mistakes: 4 }));

  assert.deepEqual(
    storage.calls.map((call) => call.slug),
    ['first-light', 'by-the-shore']
  );
});

test('it never writes to state — it is a reader in the views array', () => {
  const recorder = new ResultsRecorder(fakeStorage(), on('first-light'));
  const finished = Object.freeze(state('won', { solvedSetIds: Object.freeze(['a']) }));
  assert.doesNotThrow(() => recorder.update(finished));
});
