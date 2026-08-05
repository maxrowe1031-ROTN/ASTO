// slug.js — the one place a puzzle's slug is derived. PURE: imports nothing.
//
// It lives on its own, and is served to the review page, for the same reason
// `stage-registry.js` is: the Studio's UI has to show Max the destination
// BEFORE he publishes, and the server has to compute the same destination when
// he does. Two copies of this rule would drift, and the thing they would
// disagree about is a puzzle id — which, once Phase 5 persists results under
// it, can never be renamed without orphaning saved progress.
//
// The slug comes from the board's TITLE, not from the run. A run slug is a
// lifecycle name — `beach-retry` records that the first beach run truncated —
// and that is the Studio's business, not the game's. `asto-first-light` is the
// precedent: the shipped board's id is its title, and the published boards
// join it.

// Lowercase, hyphen-separated, no leading hyphen. The shape a filename and a
// `?puzzle=` value can both carry safely.
export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

const MAX_LENGTH = 64;

/**
 * "Trees, Tools, and Time" → "trees-tools-and-time".
 *
 * Returns null when nothing usable survives — a title of punctuation, or one
 * whose characters all normalize away. Callers fall back to something they
 * know is a slug rather than publishing under a guess.
 */
export function slugify(text) {
  const slug = String(text ?? '')
    .normalize('NFKD')
    // Drop combining marks, so "Café" slugs as "cafe" rather than losing the e.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    // The slice can leave a trailing hyphen behind.
    .replace(/-+$/, '');

  return SLUG.test(slug) ? slug : null;
}
