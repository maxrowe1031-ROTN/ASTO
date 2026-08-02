import test from 'node:test';
import assert from 'node:assert/strict';

import { Storage, TUTORIAL_SEEN_KEY } from '../src/storage.js';

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
