import test from 'node:test';
import assert from 'node:assert/strict';

import { RESULTS_KEY, Storage, TUTORIAL_SEEN_KEY } from '../src/storage.js';

/** A stand-in for localStorage: same three methods, no browser. */
function fakeStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k)
  };
}

/** Safari private mode does not return null — it THROWS on every access. */
function hostileStore() {
  const boom = () => {
    throw new DOMException('QuotaExceededError');
  };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

test('a fresh player has not seen the tutorial', () => {
  assert.equal(new Storage({ store: fakeStore() }).hasSeenTutorial(), false);
});

test('marking it seen is remembered', () => {
  const storage = new Storage({ store: fakeStore() });
  storage.markTutorialSeen();
  assert.equal(storage.hasSeenTutorial(), true);
});

test('the flag survives a new Storage over the same store — this is what a reload is', () => {
  const store = fakeStore();
  new Storage({ store }).markTutorialSeen();
  assert.equal(new Storage({ store }).hasSeenTutorial(), true);
});

test('clear() forgets it again, which is how a fresh profile is tested', () => {
  const storage = new Storage({ store: fakeStore() });
  storage.markTutorialSeen();
  storage.clear();
  assert.equal(storage.hasSeenTutorial(), false);
});

test('marking twice is idempotent, not an error', () => {
  const storage = new Storage({ store: fakeStore() });
  storage.markTutorialSeen();
  storage.markTutorialSeen();
  assert.equal(storage.hasSeenTutorial(), true);
});

test('the value written is a real string, so a raw localStorage read is legible', () => {
  const store = fakeStore();
  new Storage({ store }).markTutorialSeen();
  assert.equal(typeof store.getItem(TUTORIAL_SEEN_KEY), 'string');
});

// The whole reason every access is wrapped: the game must boot in Safari private mode,
// where touching localStorage throws. A preference must never be able to break the game.
test('a store that throws on every call degrades quietly instead of exploding', () => {
  const storage = new Storage({ store: hostileStore() });
  assert.equal(storage.hasSeenTutorial(), false);
  assert.doesNotThrow(() => storage.markTutorialSeen());
  assert.doesNotThrow(() => storage.clear());
  assert.equal(storage.hasSeenTutorial(), false);
});

test('no store at all behaves like a store that forgets everything', () => {
  const storage = new Storage({ store: null });
  assert.equal(storage.hasSeenTutorial(), false);
  assert.doesNotThrow(() => storage.markTutorialSeen());
  assert.equal(storage.hasSeenTutorial(), false);
});

test('a stored value other than the one we write does not count as seen', () => {
  const storage = new Storage({ store: fakeStore({ [TUTORIAL_SEEN_KEY]: '' }) });
  assert.equal(storage.hasSeenTutorial(), false);
});

// --- per-puzzle results ---

const won = (mistakes = 1) => ({ status: 'won', mistakes, solvedCount: 4 });
const lost = (solvedCount = 2) => ({ status: 'lost', mistakes: 4, solvedCount });

test('a board never played has no result', () => {
  const storage = new Storage({ store: fakeStore() });
  assert.equal(storage.resultFor('first-light'), null);
  assert.deepEqual(storage.allResults(), {});
});

test('a recorded result comes back as it went in', () => {
  const storage = new Storage({ store: fakeStore() });
  storage.recordResult('first-light', won(2));
  assert.deepEqual(storage.resultFor('first-light'), { status: 'won', mistakes: 2, solvedCount: 4 });
});

test('results are per board and do not leak into each other', () => {
  const storage = new Storage({ store: fakeStore() });
  storage.recordResult('first-light', won(0));
  storage.recordResult('yankees-baseball', lost(3));
  assert.equal(storage.resultFor('first-light').status, 'won');
  assert.equal(storage.resultFor('yankees-baseball').solvedCount, 3);
  assert.deepEqual(Object.keys(storage.allResults()).sort(), ['first-light', 'yankees-baseball']);
});

// This is the phase gate's named condition: select state survives a reload.
test('results survive a new Storage over the same store — this is what a reload is', () => {
  const store = fakeStore();
  new Storage({ store }).recordResult('by-the-shore', won(3));
  assert.equal(new Storage({ store }).resultFor('by-the-shore').mistakes, 3);
});

test('a later loss never overwrites a win — the row records your best day', () => {
  const storage = new Storage({ store: fakeStore() });
  storage.recordResult('first-light', won(2));
  storage.recordResult('first-light', lost(1));
  assert.deepEqual(storage.resultFor('first-light'), won(2));
});

test('a cleaner win replaces a scrappier one', () => {
  const storage = new Storage({ store: fakeStore() });
  storage.recordResult('first-light', won(3));
  storage.recordResult('first-light', won(0));
  assert.equal(storage.resultFor('first-light').mistakes, 0);
});

test('a worse win does not replace a better one', () => {
  const storage = new Storage({ store: fakeStore() });
  storage.recordResult('first-light', won(0));
  storage.recordResult('first-light', won(3));
  assert.equal(storage.resultFor('first-light').mistakes, 0);
});

test('a win replaces an earlier loss', () => {
  const storage = new Storage({ store: fakeStore() });
  storage.recordResult('first-light', lost(2));
  storage.recordResult('first-light', won(1));
  assert.equal(storage.resultFor('first-light').status, 'won');
});

test('a second loss replaces the first — the most recent attempt is all a loss records', () => {
  const storage = new Storage({ store: fakeStore() });
  storage.recordResult('first-light', lost(0));
  storage.recordResult('first-light', lost(3));
  assert.equal(storage.resultFor('first-light').solvedCount, 3);
});

test('clear() forgets results too, not just the tutorial flag', () => {
  const storage = new Storage({ store: fakeStore() });
  storage.markTutorialSeen();
  storage.recordResult('first-light', won());
  storage.clear();
  assert.equal(storage.hasSeenTutorial(), false);
  assert.deepEqual(storage.allResults(), {});
});

// The failure the tutorial flag cannot have: JSON that parses, into the wrong thing.
test('a corrupt results blob degrades to no results instead of throwing', () => {
  for (const raw of ['{ not json', '[]', 'null', '"a string"', '42']) {
    const storage = new Storage({ store: fakeStore({ [RESULTS_KEY]: raw }) });
    assert.deepEqual(storage.allResults(), {}, raw);
    assert.equal(storage.resultFor('first-light'), null, raw);
    assert.doesNotThrow(() => storage.recordResult('first-light', won()), raw);
    assert.equal(storage.resultFor('first-light').status, 'won', raw);
  }
});

test('an entry that is not an object is ignored rather than handed to the view', () => {
  const storage = new Storage({ store: fakeStore({ [RESULTS_KEY]: '{"first-light": "won"}' }) });
  assert.equal(storage.resultFor('first-light'), null);
});

test('a hostile store loses results quietly and the game still boots', () => {
  const storage = new Storage({ store: hostileStore() });
  assert.deepEqual(storage.allResults(), {});
  assert.doesNotThrow(() => storage.recordResult('first-light', won()));
  assert.equal(storage.resultFor('first-light'), null);
});

test('no store at all behaves like a store that forgets every result', () => {
  const storage = new Storage({ store: null });
  assert.doesNotThrow(() => storage.recordResult('first-light', won()));
  assert.deepEqual(storage.allResults(), {});
});
