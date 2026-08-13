// The game's one OUTBOUND network seam: the end-screen survey's fire-and-forget posts
// to Supabase. (LocalJsonSource fetches board JSON from our own origin; this is the only
// module that talks to a third party — the mirror of llm.js owning the Studio's only
// fetch. Recorded as D-21.)
//
// The URL and publishable key are committed constants ON PURPOSE: the key maps to the
// `anon` role, and row-level security gives that role insert-only access to two
// bounded tables — the lock is RLS, not secrecy. The service key, which can read,
// lives in .env on Max's machine and never appears here or in the browser.
//
// Everything is swallowed. A survey that can take down the end screen is worse than no
// survey: fetch missing, fetch throwing, network down, 4xx/5xx — all of it degrades to
// "the tap felt like it worked", which for an optional anonymous survey is the truth
// that matters. No retries, no queues; a lost tap is a lost tap.

export const SUPABASE_URL = 'https://icfwpjcrjhwfkzkkncyc.supabase.co';
export const PUBLISHABLE_KEY = 'sb_publishable_OxGQncqLpbIVWKPANRa41w_-eWNdO_C';
export const CLIENT_ID_KEY = 'asto.clientId';

const MAX_COMMENT_LENGTH = 280;

export class Ratings {
  constructor({ fetchFn, store } = {}) {
    // Bound late so a browser without fetch degrades to the same silence as a down
    // network — and `keepalive: true` lets a tap on the way out of the page complete.
    this.fetchFn = fetchFn ?? ((...args) => globalThis.fetch(...args));
    this.store = store === undefined ? safeDefaultStore() : store;
    // Held in memory as well as in storage: a hostile store (Safari private mode
    // throws on every access) still gets one stable id for the session.
    this.clientId = null;
  }

  /** One tap on one dot. `slug` is null for the tutorial, which never reports. */
  async sendRating({ slug, question, value, won, mistakes }) {
    if (slug === null) return;
    await this.post('ratings', { puzzle_slug: slug, question, value, won, mistakes });
  }

  /** The optional free-text line. Clamped here so the table's check never rejects it. */
  async sendComment({ slug, note, won }) {
    if (slug === null) return;
    const trimmed = String(note ?? '').trim();
    if (trimmed.length === 0) return;
    await this.post('comments', { puzzle_slug: slug, note: trimmed.slice(0, MAX_COMMENT_LENGTH), won });
  }

  // --- the guarded send; nothing above this line touches the network ---

  async post(table, row) {
    try {
      await this.fetchFn(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          apikey: PUBLISHABLE_KEY,
          Authorization: `Bearer ${PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        keepalive: true,
        body: JSON.stringify({ ...row, client_id: this.getClientId() })
      });
    } catch {
      // Silence is the contract. See the header comment.
    }
  }

  /** Minted lazily, remembered across sessions when storage cooperates. */
  getClientId() {
    if (this.clientId !== null) return this.clientId;
    this.clientId = this.read(CLIENT_ID_KEY) ?? mintUuid();
    this.write(CLIENT_ID_KEY, this.clientId);
    return this.clientId;
  }

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
      // Private mode or quota. The in-memory copy carries the session.
    }
  }
}

function mintUuid() {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    // Pre-2021 browsers lack randomUUID. A survey id is not worth failing over.
    return '00000000-0000-4000-8000-000000000000';
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
