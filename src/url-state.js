// What the address bar should say. PURE — a string in, a string out. It touches
// no `location` and no `history`; app.js owns those, and hands this the href.
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
