// What the address bar should say. `hrefFor` is PURE — a string in, a string out.
// It touches no `location` and no `history`; app.js owns those, and hands this the
// href. `rememberInUrl` is the one impure function, and it reaches for no global
// either: app.js hands it the history object, which is what keeps it testable with
// the view turned off.
//
// One rule, and the whole file exists to make it explicit: THE QUERY NAMES THE
// BOARD ON SCREEN. A board names itself so a reload comes back to it; a door —
// the title screen, the calendar, the statistics — names nothing, because there
// is no board on screen to name.
//
// That second half was implicit and therefore missing (fixed 2026-08-18). Doors
// changed the screen without touching the query, so the address kept pointing at
// a board the player had navigated away from, and the next load — a backgrounded
// mobile tab reclaimed, a pull-to-refresh — took the deep-link route straight
// back into it. Pressing ASTO looked like it worked and then undid itself.

/**
 * @param {string} currentHref  the address now
 * @param {string|null} slug    the board on screen, or null for any door
 * @returns {string} the address that screen should have
 */
export function hrefFor(currentHref, slug) {
  const url = new URL(currentHref);
  if (slug === null) url.searchParams.delete('puzzle');
  else url.searchParams.set('puzzle', slug);
  return url.toString();
}

/**
 * Point the address at `slug`, and never let that cost the game.
 *
 * replaceState, never pushState: this is bookkeeping, not navigation. Pushing would
 * build a history stack where Back means "the previous board" — a second, invisible
 * router competing with the real one.
 *
 * The throw is the reason this is a function rather than a line in app.js. An
 * optional call guards a method's EXISTENCE, not its behaviour, and in a
 * cross-origin iframe — an itch.io build, an embed — `replaceState` exists and
 * throws `SecurityError`. Its only caller is startGame, whose rejection lands on
 * the error screen, so an unguarded throw here shows a player "something went
 * wrong" instead of their board. The address is a convenience for reload and
 * sharing; the board is the game. When they conflict the board wins, silently,
 * because a player inside an iframe cannot act on the news either way.
 *
 * @param {History|undefined} history  the history object, or nothing at all
 * @param {string} currentHref         the address now
 * @param {string|null} slug           the board on screen, or null for any door
 * @returns {boolean} whether the address was actually updated
 */
export function rememberInUrl(history, currentHref, slug) {
  if (typeof history?.replaceState !== 'function') return false;
  try {
    history.replaceState(null, '', hrefFor(currentHref, slug));
    return true;
  } catch {
    return false;
  }
}
