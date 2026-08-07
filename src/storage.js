// Player state that outlives the tab: whether the first-run tutorial has been played, and
// how the player did on each board.
//
// Every access is wrapped in try/catch, and that is not defensive noise: Safari's private
// mode THROWS on localStorage rather than returning null, and older WebKit throws on
// setItem once the quota is hit. A remembered preference must never be able to stop the
// game from booting, so a broken store degrades to "nothing remembered" and play goes on.
// The results blob extends that rule to a second failure the tutorial flag cannot have:
// JSON that parses to the wrong shape, which is also treated as "nothing remembered".
//
// `store` is injectable so node:test covers this without a browser — the same seam
// LocalJsonSource uses for fetch.

export const TUTORIAL_SEEN_KEY = 'asto.tutorialSeen';
export const RESULTS_KEY = 'asto.results';

const SEEN = 'true';

export class Storage {
  constructor({ store } = {}) {
    this.store = store === undefined ? safeDefaultStore() : store;
  }

  /** False whenever we cannot know — an extra tutorial is a far smaller harm than a crash. */
  hasSeenTutorial() {
    return this.read(TUTORIAL_SEEN_KEY) === SEEN;
  }

  markTutorialSeen() {
    this.write(TUTORIAL_SEEN_KEY, SEEN);
  }

  // --- per-puzzle results, keyed by slug ---
  //
  // One key holding one object rather than a key per board: it is one read to paint the
  // whole select screen, and one thing to forget on clear().
  //
  // Keyed by SLUG, not by puzzle id, because the slug is what the manifest, the URL and
  // the filename all already agree on. Both are stable for the life of a board — the id
  // is derived from the slug at publish precisely so neither can be renamed.

  /** Every result, as { slug: {status, mistakes, solvedCount} }. Never null. */
  allResults() {
    const raw = this.read(RESULTS_KEY);
    if (raw === null) return {};
    try {
      const parsed = JSON.parse(raw);
      return isObject(parsed) ? parsed : {};
    } catch {
      // Hand-edited, truncated by a quota failure, or written by an older version.
      // Losing a results blob costs a player some badges; crashing costs them the game.
      return {};
    }
  }

  /** How the player did on one board, or null if they have not finished it. */
  resultFor(slug) {
    const result = this.allResults()[slug];
    return isObject(result) ? result : null;
  }

  /**
   * Record a finished game — but only if it is the player's BEST on that board.
   *
   * A win is never overwritten by a later loss, and a win with fewer beans replaces one
   * with more. Replaying a board you scraped through can improve the row; it can never
   * spoil it. The select screen is a record of your best day, not your last one.
   */
  recordResult(slug, result) {
    const previous = this.resultFor(slug);
    if (!improves(result, previous)) return;
    this.write(RESULTS_KEY, JSON.stringify({ ...this.allResults(), [slug]: result }));
  }

  /** Forget everything ASTO stores — how a fresh-profile run is set up by hand. */
  clear() {
    this.remove(TUTORIAL_SEEN_KEY);
    this.remove(RESULTS_KEY);
  }

  // --- the guarded primitives; nothing above this line touches the store directly ---

  read(key) {
    try {
      return this.store?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  write(key, value) {
    try {
      this.store?.setItem(key, value);
    } catch {
      // Full disk, private mode, storage disabled by policy. Nothing to do and nothing
      // worth telling the player: the game plays identically either way.
    }
  }

  remove(key) {
    try {
      this.store?.removeItem(key);
    } catch {
      // Same as write.
    }
  }
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Is this result worth replacing the stored one with? See recordResult. */
function improves(next, previous) {
  if (previous === null) return true;
  if (previous.status !== 'won') return true;
  return next.status === 'won' && next.mistakes < previous.mistakes;
}

/** Merely READING globalThis.localStorage can throw when storage is disabled by policy. */
function safeDefaultStore() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
