// player-ratings.js — the Studio-side reader of the game's survey (D-21) and, since
// D-34, of its play counter — the same key, the same tables' law, one reader.
//
// The SECOND network seam beside llm.js, recorded the same way puzzle-store is a second
// write seam beside run-store: different law, own module. It owns the only fetch that
// reads player data, and it runs on Max's machine only — the service key comes from
// .env (SUPABASE_SERVICE_KEY), is never committed, and is never sent to a browser. A
// missing key names the variable and nothing else.
//
// Everything below the reader is pure. The game writes an APPEND-ONLY tap log —
// changing an answer adds a row — so reading means deduping: the last row per
// (player, board, question) is that player's answer, everything earlier is history.

const QUESTIONS = ['difficulty', 'delight', 'fairness'];
const PAGE = 1000; // PostgREST caps a response at 1000 rows; page until a short page.

const SUPABASE_URL = 'https://icfwpjcrjhwfkzkkncyc.supabase.co';

/**
 * Pure: raw table rows → per-board readings, sorted by slug.
 *
 * Returns [{ slug, players, winRate, ratings: { difficulty|delight|fairness:
 * { count, average } }, comments: [{ note, won, createdAt }] }].
 */
export function aggregate(ratingRows, commentRows) {
  const boards = new Map();
  const boardFor = (slug) => {
    if (!boards.has(slug)) boards.set(slug, { answers: new Map(), comments: [] });
    return boards.get(slug);
  };

  // Last write wins per (player, question). A row without a client id cannot be joined
  // to anything, so each one stays its own anonymous voice — deduping strangers into
  // one player would silently shrink the count.
  for (const row of ratingRows) {
    const board = boardFor(row.puzzle_slug);
    const player = row.client_id ?? `anonymous-row-${row.id}`;
    const key = `${player} ${row.question}`;
    const seen = board.answers.get(key);
    if (seen === undefined || row.id > seen.id) board.answers.set(key, { ...row, player });
  }

  for (const row of commentRows) {
    boardFor(row.puzzle_slug).comments.push({
      id: row.id,
      note: row.note,
      won: row.won,
      createdAt: row.created_at
    });
  }

  return [...boards.entries()]
    .map(([slug, { answers, comments }]) => {
      const latest = [...answers.values()];

      const ratings = {};
      for (const question of QUESTIONS) {
        const values = latest.filter((a) => a.question === question).map((a) => a.value);
        ratings[question] = {
          count: values.length,
          average: values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length
        };
      }

      // One verdict per player: their latest row on the board says whether they won.
      const byPlayer = new Map();
      for (const answer of latest) {
        const seen = byPlayer.get(answer.player);
        if (seen === undefined || answer.id > seen.id) byPlayer.set(answer.player, answer);
      }
      const verdicts = [...byPlayer.values()].filter((a) => typeof a.won === 'boolean');

      return {
        slug,
        players: byPlayer.size,
        winRate:
          verdicts.length === 0
            ? null
            : verdicts.filter((a) => a.won).length / verdicts.length,
        ratings,
        comments: [...comments].sort((a, b) => b.id - a.id).map(({ id, ...rest }) => rest)
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * The reader. `fetchFn` is injected for tests; production passes nothing and gets the
 * real fetch. `env` is injected the same way, so no test ever touches process.env.
 */
export function createRatingsReader({ fetchFn, env = process.env, url = SUPABASE_URL } = {}) {
  const doFetch = fetchFn ?? ((...args) => globalThis.fetch(...args));

  const serviceKey = () => {
    const key = env.SUPABASE_SERVICE_KEY;
    if (!key) {
      throw new Error(
        'SUPABASE_SERVICE_KEY is not set — add it to .env (the Supabase service key; it never leaves this machine).'
      );
    }
    return key;
  };

  async function readTable(table, key) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const response = await doFetch(`${url}/rest/v1/${table}?select=*&order=id.asc`, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Range: `${from}-${from + PAGE - 1}`
        }
      });
      if (!response.ok) {
        throw new Error(`Supabase answered HTTP ${response.status} reading ${table}`);
      }
      const page = await response.json();
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }

  return {
    /** Both tables, read and folded into per-board readings. */
    async fetchBoards() {
      const key = serviceKey();
      const [ratingRows, commentRows] = await Promise.all([
        readTable('ratings', key),
        readTable('comments', key)
      ]);
      return aggregate(ratingRows, commentRows);
    },

    /** The play counter's raw rows (D-34), oldest first. Summarised by plays-summary.js. */
    async fetchPlays() {
      return readTable('plays', serviceKey());
    }
  };
}
