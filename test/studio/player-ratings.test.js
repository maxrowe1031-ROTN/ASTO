import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregate, createRatingsReader } from '../../studio/player-ratings.js';

// --- the pure aggregation ---

const rating = (id, slug, question, value, extra = {}) => ({
  id,
  puzzle_slug: slug,
  question,
  value,
  won: true,
  mistakes: 0,
  client_id: 'c-1',
  created_at: '2026-08-13T20:00:00Z',
  ...extra
});

test('one tap per question averages to itself', () => {
  const boards = aggregate(
    [
      rating(1, 'warm-up', 'difficulty', 2),
      rating(2, 'warm-up', 'delight', 3),
      rating(3, 'warm-up', 'fairness', 4)
    ],
    []
  );
  assert.equal(boards.length, 1);
  const [board] = boards;
  assert.equal(board.slug, 'warm-up');
  assert.equal(board.players, 1);
  assert.deepEqual(board.ratings.difficulty, { count: 1, average: 2 });
  assert.deepEqual(board.ratings.delight, { count: 1, average: 3 });
  assert.deepEqual(board.ratings.fairness, { count: 1, average: 4 });
});

test('a changed answer counts once, at its LAST value — the append log is deduped', () => {
  const boards = aggregate(
    [rating(1, 'warm-up', 'delight', 3), rating(4, 'warm-up', 'delight', 4)],
    []
  );
  assert.deepEqual(boards[0].ratings.delight, { count: 1, average: 4 });
});

test('last means highest id, not array order', () => {
  const boards = aggregate(
    [rating(4, 'warm-up', 'delight', 4), rating(1, 'warm-up', 'delight', 3)],
    []
  );
  assert.deepEqual(boards[0].ratings.delight, { count: 1, average: 4 });
});

test('different players average together and are counted apart', () => {
  const boards = aggregate(
    [
      rating(1, 'warm-up', 'delight', 2, { client_id: 'c-1' }),
      rating(2, 'warm-up', 'delight', 4, { client_id: 'c-2' })
    ],
    []
  );
  assert.equal(boards[0].players, 2);
  assert.deepEqual(boards[0].ratings.delight, { count: 2, average: 3 });
});

test('rows without a client id are each their own anonymous voice, never merged', () => {
  const boards = aggregate(
    [
      rating(1, 'warm-up', 'delight', 1, { client_id: null }),
      rating(2, 'warm-up', 'delight', 3, { client_id: null })
    ],
    []
  );
  assert.equal(boards[0].players, 2);
  assert.deepEqual(boards[0].ratings.delight, { count: 2, average: 2 });
});

test('win rate reads each player\'s latest word on the board', () => {
  const boards = aggregate(
    [
      rating(1, 'warm-up', 'delight', 3, { client_id: 'c-1', won: false }),
      rating(2, 'warm-up', 'fairness', 3, { client_id: 'c-1', won: true }),
      rating(3, 'warm-up', 'delight', 2, { client_id: 'c-2', won: false })
    ],
    []
  );
  assert.equal(boards[0].winRate, 0.5);
});

test('boards are kept apart, and a question nobody answered reports zero taps', () => {
  const boards = aggregate(
    [rating(1, 'warm-up', 'delight', 4), rating(2, 'low-tide', 'difficulty', 1)],
    []
  );
  assert.equal(boards.length, 2);
  const lowTide = boards.find((b) => b.slug === 'low-tide');
  assert.deepEqual(lowTide.ratings.delight, { count: 0, average: null });
  assert.deepEqual(lowTide.ratings.difficulty, { count: 1, average: 1 });
});

test('a board with only comments still appears', () => {
  const boards = aggregate(
    [],
    [{ id: 1, puzzle_slug: 'warm-up', note: 'hello', won: true, client_id: 'c-1', created_at: 'x' }]
  );
  assert.equal(boards.length, 1);
  assert.equal(boards[0].players, 0);
  assert.equal(boards[0].comments.length, 1);
  assert.equal(boards[0].comments[0].note, 'hello');
});

test('comments arrive newest first and are never deduped — every note is kept', () => {
  const boards = aggregate(
    [],
    [
      { id: 1, puzzle_slug: 'warm-up', note: 'first', won: true, client_id: 'c-1', created_at: 'a' },
      { id: 2, puzzle_slug: 'warm-up', note: 'second', won: true, client_id: 'c-1', created_at: 'b' }
    ]
  );
  assert.deepEqual(
    boards[0].comments.map((c) => c.note),
    ['second', 'first']
  );
});

// --- the reader (injected fetch; the only Studio module beside llm.js that may own one) ---

function fakeSupabase({ ratings = [], comments = [], status = 200 } = {}) {
  const calls = [];
  const fn = (url, options) => {
    calls.push({ url: String(url), options });
    if (status !== 200) {
      return Promise.resolve({ ok: false, status, text: () => Promise.resolve('nope') });
    }
    const body = String(url).includes('/ratings') ? ratings : comments;
    return Promise.resolve({ ok: true, status, json: () => Promise.resolve(body) });
  };
  return { calls, fn };
}

const ENV = { SUPABASE_SERVICE_KEY: 'sk-test-not-a-real-key' };

test('a missing service key fails loudly, naming the variable and never any value', async () => {
  const reader = createRatingsReader({ fetchFn: fakeSupabase().fn, env: {} });
  await assert.rejects(
    () => reader.fetchBoards(),
    (error) => {
      assert.match(error.message, /SUPABASE_SERVICE_KEY/);
      assert.doesNotMatch(error.message, /sk-/);
      return true;
    }
  );
});

test('the reader asks for both tables with the service key and aggregates the answers', async () => {
  const { calls, fn } = fakeSupabase({
    ratings: [rating(1, 'warm-up', 'delight', 4)],
    comments: [
      { id: 1, puzzle_slug: 'warm-up', note: 'nice', won: true, client_id: 'c-1', created_at: 'x' }
    ]
  });
  const reader = createRatingsReader({ fetchFn: fn, env: ENV });
  const boards = await reader.fetchBoards();

  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.options.headers.apikey, ENV.SUPABASE_SERVICE_KEY);
    assert.equal(call.options.headers.Authorization, `Bearer ${ENV.SUPABASE_SERVICE_KEY}`);
  }
  assert.equal(boards.length, 1);
  assert.deepEqual(boards[0].ratings.delight, { count: 1, average: 4 });
  assert.equal(boards[0].comments[0].note, 'nice');
});

test('a refusal from Supabase surfaces as an error, not as an empty report', async () => {
  const reader = createRatingsReader({ fetchFn: fakeSupabase({ status: 401 }).fn, env: ENV });
  await assert.rejects(() => reader.fetchBoards(), /401/);
});
