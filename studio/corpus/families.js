// Franchise vocabulary → canonical family (design.md D-15 second amendment,
// extended 2026-08-18).
//
// WHY THIS EXISTS. The word-echo guard compares significant words, and that is
// structurally blind to a franchise: "hogwarts common room", "diagon alley
// shops", "gringotts vault chambers" and "under the invisibility cloak" share
// not one word between them, yet the v2 sampling shipped all four as separate
// subjects. Max's rule is that a hundred picks should contain a hundred
// different ideas — "why use two harry potter boards when one could be harry
// potter and the other could be iron man?"
//
// The scout now names its own `family`, which is the primary signal. This table
// is the BACKSTOP, because self-reporting is the failure mode this whole axis
// keeps rediscovering: a scout labelling "gringotts vault chambers" as family
// "gringotts" has answered honestly and uselessly. Every alias below is scanned
// against BOTH the reported family and the subject text, so a dodge in either
// place still resolves to the same canonical name.
//
// It is deliberately shallow. It only needs to know the handful of franchises
// deep enough to yield many subjects — the ones that actually clustered. An
// unknown family passes through untouched; a missing entry costs one repeat in
// a sampling and is fixed by adding a line of data, never by adding machinery.

export const FAMILY_ALIASES = {
  'harry potter': [
    'hogwarts', 'gringotts', 'diagon', 'hogsmeade', 'quidditch', 'muggle',
    'dumbledore', 'voldemort', 'invisibility cloak', 'sorting hat', 'wizarding',
    'death eater', 'floo', 'azkaban', 'weasley', 'the burrow',
  ],
  'lord of the rings': [
    'shire', 'hobbit', 'mordor', 'middle-earth', 'middle earth', 'gandalf',
    'rivendell', 'frodo', 'bilbo', 'gondor', 'orc',
  ],
  narnia: ['aslan', 'wardrobe', 'turkish delight', 'white witch'],
  batman: ['gotham', 'batcave', 'arkham', 'wayne manor', 'joker'],
  'star wars': [
    'jedi', 'sith', 'death star', 'mos eisley', 'tatooine', 'lightsaber',
    'millennium falcon', 'wookiee', 'stormtrooper',
  ],
  'star trek': ['starfleet', 'vulcan', 'klingon', 'enterprise bridge', 'warp core'],
  'sherlock holmes': ['baker street', 'watson', 'deerstalker', 'moriarty'],
  'wonderland': ['cheshire', 'mad hatter', 'white rabbit', 'looking glass'],
  'robin hood': ['sherwood', 'nottingham', 'merry men'],
  'the wizard of oz': ['emerald city', 'yellow brick', 'munchkin'],
};

/**
 * Canonical family for a piece of text, or null when nothing is recognised.
 * Longest alias first, so "death star" resolves to star wars before "death"
 * could be read as anything else.
 */
export function canonicalFamily(text) {
  const haystack = ` ${String(text).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `;
  let best = null;
  let bestLength = 0;
  for (const [family, aliases] of Object.entries(FAMILY_ALIASES)) {
    for (const alias of [family, ...aliases]) {
      if (alias.length <= bestLength) continue;
      if (haystack.includes(` ${alias} `)) {
        best = family;
        bestLength = alias.length;
      }
    }
  }
  return best;
}
