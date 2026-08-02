// Player preferences that outlive the tab. Phase 4 stores exactly one thing: whether the
// first-run tutorial has been played. Per-puzzle results arrive with the select screen.
//
// Every access is wrapped in try/catch, and that is not defensive noise: Safari's private
// mode THROWS on localStorage rather than returning null, and older WebKit throws on
// setItem once the quota is hit. A remembered preference must never be able to stop the
// game from booting, so a broken store degrades to "nothing remembered" and play goes on.
//
// `store` is injectable so node:test covers this without a browser — the same seam
// LocalJsonSource uses for fetch.

export const TUTORIAL_SEEN_KEY = 'asto.tutorialSeen';

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

  /** Forget everything ASTO stores — how a fresh-profile run is set up by hand. */
  clear() {
    this.remove(TUTORIAL_SEEN_KEY);
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

/** Merely READING globalThis.localStorage can throw when storage is disabled by policy. */
function safeDefaultStore() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
