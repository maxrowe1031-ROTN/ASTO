import test from 'node:test';
import assert from 'node:assert/strict';

import { CLIENT_ID_KEY, Ratings, SUPABASE_URL, PUBLISHABLE_KEY } from '../src/ratings.js';

/** Records every call and answers with a happy 201, unless told otherwise. */
function fakeFetch({ status = 201, reject = false, boom = false } = {}) {
  const calls = [];
  const fn = (url, options) => {
    if (boom) throw new Error('fetch itself blew up');
    calls.push({ url, options, body: JSON.parse(options.body) });
    if (reject) return Promise.reject(new TypeError('network down'));
    return Promise.resolve({ ok: status < 300, status });
  };
  return { calls, fn };
}

/** Same stand-in the storage tests use: three methods, no browser. */
function fakeStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k)
  };
}

/** Safari private mode THROWS on every access rather than returning null. */
function hostileStore() {
  const boom = () => {
    throw new DOMException('QuotaExceededError');
  };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

const make = (overrides = {}) => {
  const { calls, fn } = fakeFetch(overrides);
  const store = overrides.store ?? fakeStore();
  return { calls, store, ratings: new Ratings({ fetchFn: fn, store }) };
};

// --- ratings payloads ---

test('a rating tap posts one row shaped for the ratings table', async () => {
  const { calls, ratings } = make();
  await ratings.sendRating({ slug: 'low-tide', question: 'delight', value: 3, won: true, mistakes: 1 });

  assert.equal(calls.length, 1);
  const { url, options, body } = calls[0];
  assert.equal(url, `${SUPABASE_URL}/rest/v1/ratings`);
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.apikey, PUBLISHABLE_KEY);
  assert.equal(options.headers.Authorization, `Bearer ${PUBLISHABLE_KEY}`);
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(options.headers.Prefer, 'return=minimal');
  assert.equal(options.keepalive, true);
  assert.equal(body.puzzle_slug, 'low-tide');
  assert.equal(body.question, 'delight');
  assert.equal(body.value, 3);
  assert.equal(body.won, true);
  assert.equal(body.mistakes, 1);
  assert.match(body.client_id, /^[0-9a-f-]{36}$/);
});

test('a comment posts one row shaped for the comments table, without mistakes', async () => {
  const { calls, ratings } = make();
  await ratings.sendComment({ slug: 'low-tide', note: 'lovely board', won: false });

  assert.equal(calls.length, 1);
  const { url, body } = calls[0];
  assert.equal(url, `${SUPABASE_URL}/rest/v1/comments`);
  assert.equal(body.puzzle_slug, 'low-tide');
  assert.equal(body.note, 'lovely board');
  assert.equal(body.won, false);
  assert.equal('mistakes' in body, false);
  assert.match(body.client_id, /^[0-9a-f-]{36}$/);
});

// --- the survey must never break the game ---

test('a rejecting fetch is swallowed', async () => {
  const { ratings } = make({ reject: true });
  await ratings.sendRating({ slug: 's', question: 'difficulty', value: 1, won: true, mistakes: 0 });
  await ratings.sendComment({ slug: 's', note: 'hi', won: true });
});

test('a fetch that throws synchronously is swallowed', async () => {
  const { ratings } = make({ boom: true });
  await ratings.sendRating({ slug: 's', question: 'difficulty', value: 1, won: true, mistakes: 0 });
  await ratings.sendComment({ slug: 's', note: 'hi', won: true });
});

test('a non-2xx answer is not an error anyone hears about', async () => {
  const { ratings } = make({ status: 401 });
  await ratings.sendRating({ slug: 's', question: 'fairness', value: 4, won: false, mistakes: 4 });
});

// --- the tutorial never reports ---

test('a null slug sends nothing at all', async () => {
  const { calls, ratings } = make();
  await ratings.sendRating({ slug: null, question: 'delight', value: 2, won: true, mistakes: 0 });
  await ratings.sendComment({ slug: null, note: 'hello', won: true });
  assert.equal(calls.length, 0);
});

// --- comments are bounded before they travel ---

test('a comment longer than 280 characters is clamped before sending', async () => {
  const { calls, ratings } = make();
  await ratings.sendComment({ slug: 's', note: 'x'.repeat(400), won: true });
  assert.equal(calls[0].body.note.length, 280);
});

test('an empty or whitespace comment sends nothing (the table demands at least one character)', async () => {
  const { calls, ratings } = make();
  await ratings.sendComment({ slug: 's', note: '', won: true });
  await ratings.sendComment({ slug: 's', note: '   ', won: true });
  assert.equal(calls.length, 0);
});

// --- the anonymous client id ---

test('the client id is minted once and persisted', async () => {
  const { calls, store, ratings } = make();
  await ratings.sendRating({ slug: 'a', question: 'delight', value: 1, won: true, mistakes: 0 });
  await ratings.sendRating({ slug: 'b', question: 'delight', value: 2, won: true, mistakes: 0 });

  assert.equal(calls[0].body.client_id, calls[1].body.client_id);
  assert.equal(store.getItem(CLIENT_ID_KEY), calls[0].body.client_id);
});

test('a stored client id is reused across constructions', async () => {
  const store = fakeStore({ [CLIENT_ID_KEY]: '11111111-2222-3333-4444-555555555555' });
  const { calls, fn } = fakeFetch();
  await new Ratings({ fetchFn: fn, store }).sendRating({
    slug: 'a', question: 'delight', value: 1, won: true, mistakes: 0
  });
  assert.equal(calls[0].body.client_id, '11111111-2222-3333-4444-555555555555');
});

test('a hostile store still yields a working, session-stable client id', async () => {
  const { calls, fn } = fakeFetch();
  const ratings = new Ratings({ fetchFn: fn, store: hostileStore() });
  await ratings.sendRating({ slug: 'a', question: 'delight', value: 1, won: true, mistakes: 0 });
  await ratings.sendRating({ slug: 'b', question: 'delight', value: 2, won: true, mistakes: 0 });

  assert.match(calls[0].body.client_id, /^[0-9a-f-]{36}$/);
  assert.equal(calls[0].body.client_id, calls[1].body.client_id);
});
