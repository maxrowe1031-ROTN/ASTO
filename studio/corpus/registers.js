// The register axis (design.md D-15 second amendment, 2026-08-18).
//
// WHY THIS IS DATA AND NOT PROSE. The scout was twice told in its prompt to
// widen its range — the D-15 amendment ("'the <thing>' must not be the
// reflex") and the D-17 amendment ("reach elsewhere: a tropical island, the
// pyramids, mars… harry potter, the yankees"). Measured across the 31 picks
// that followed: 74% still opened "the <thing>" (the era before the scout ran
// 7%), and proper nouns appeared ZERO times against 17% before. Meanwhile the
// one axis the CALLER assigns — world/lens, held by styleFor — came out 15/16.
// Same file, same model, same call: instruction drifts, assignment holds. So
// register joins style as something decided out here, and the list of them is
// a data file anyone can extend without touching the rotation.
//
// EQUAL WEIGHTS, and that is Max's call rather than an oversight. Asked
// whether the cozy register should keep the plurality, he said: "the themes of
// the boards do not have to be 'cozy' for the game to be cozy. We've already
// achieved that through the game rules, ui, and usability." The scout's old
// "cozy everyday places are this game's HOME REGISTER" line retired with that
// sentence — cosiness is the game's manner, not its subject matter.
//
// `allowProperNouns` exists because the old prompt demanded lowercase plain
// language, which quietly forbade the very subjects D-17 asked for: "Harry
// Potter" cannot be typed under that rule. Registers that trade in names carry
// the exemption; the rest keep the lowercase house voice.

export const REGISTERS = [
  // --- worked places (was one "cozy premises" bucket) ---
  {
    id: 'workshops-trades',
    label: 'workshops & trades',
    allowProperNouns: false,
    ask:
      'Register for THIS pick: A WORKSHOP OR TRADE — someone who makes or mends things, and the ' +
      'tools of it. Bookbinding, glassblowing, boatbuilding, watch repair. This register is the ' +
      'best-explored in the whole project, so avoid any trade the used list has already visited.',
  },
  {
    id: 'kitchens-food',
    label: 'kitchens, bakeries & food',
    allowProperNouns: false,
    ask:
      'Register for THIS pick: FOOD AND ITS PLACES — a kitchen, a bakery, a cuisine, a way of ' +
      'preserving or serving. Fermentation, street food, a Sunday roast, the cheese cave.',
  },
  {
    id: 'shops-business',
    label: 'shops & small business',
    allowProperNouns: false,
    ask:
      'Register for THIS pick: A SHOP OR SMALL BUSINESS and the commerce of it — a counter, a ' +
      'stockroom, a trade in something specific. Not the maker at the bench: the selling of it.',
  },

  // --- the living world (was one "natural world" bucket) ---
  {
    id: 'creatures',
    label: 'creatures & wildlife',
    allowProperNouns: false,
    ask:
      'Register for THIS pick: CREATURES — an animal, an insect, a bird, and how it lives. Wolves, ' +
      'octopuses, honeybees, migrating whales. Name the creature and its world, not scenery.',
  },
  {
    id: 'weather-seasons',
    label: 'weather & seasons',
    allowProperNouns: false,
    ask:
      'Register for THIS pick: WEATHER OR A SEASON — a storm, a frost, a monsoon, a thaw. What the ' +
      'sky does and what it does to us. Avoid a time-of-day flourish; name a real condition.',
  },
  {
    id: 'landscapes',
    label: 'landscapes & wild places',
    allowProperNouns: false,
    ask:
      'Register for THIS pick: A LANDSCAPE — a kind of place the earth makes. Caves, wetlands, ' +
      'canyons, old forests, rivers. The terrain itself, not a country or a creature.',
  },

  // --- the wider map (was one "far places" bucket) ---
  {
    id: 'world-cities',
    label: 'cities & neighborhoods of the world',
    allowProperNouns: true,
    ask:
      'Register for THIS pick: A CITY OR NEIGHBORHOOD somewhere in the world, named. Lisbon, ' +
      'Marrakech, Seoul, New Orleans — and the specific life of it: its trams, markets, rooftops.',
  },
  {
    id: 'islands-coasts',
    label: 'islands & coasts',
    allowProperNouns: true,
    ask:
      'Register for THIS pick: AN ISLAND OR COAST — harbours, reefs, fishing villages, archipelagos. ' +
      'Named places welcome. The sea and its edge, wherever in the world it is.',
  },
  {
    id: 'extremes',
    label: 'mountains, deserts & extremes',
    allowProperNouns: true,
    ask:
      'Register for THIS pick: AN EXTREME PLACE — high mountains, deserts, polar ice, deep caves, ' +
      'the far north. Named ranges and regions welcome. Somewhere it is hard to live.',
  },

  // --- the past (was one "history & myth" bucket) ---
  {
    id: 'ancient-history',
    label: 'ancient history & archaeology',
    allowProperNouns: true,
    ask:
      'Register for THIS pick: THE ANCIENT WORLD — Egypt, Rome, the Maya, Mesopotamia, and the ' +
      'digging up of them. Tombs, ruins, artefacts, the daily objects of a vanished life.',
  },
  {
    id: 'myth-legend',
    label: 'myth & legend',
    allowProperNouns: true,
    ask:
      'Register for THIS pick: MYTH OR FOLKLORE — Norse gods, Greek monsters, folk tales, ' +
      'sea legends. A story a culture tells itself, and the concrete things in it.',
  },
  {
    id: 'eras-expeditions',
    label: 'eras & expeditions',
    allowProperNouns: true,
    ask:
      'Register for THIS pick: A HISTORICAL ERA OR JOURNEY — the age of sail, the gold rush, the ' +
      'Silk Road, polar expeditions, the space race. A stretch of time or a voyage through it.',
  },

  // --- invented worlds (was one "fiction & fandom" bucket) ---
  {
    id: 'fantasy-worlds',
    label: 'fantasy worlds',
    allowProperNouns: true,
    ask:
      'Register for THIS pick: A FANTASY STORY WORLD — wizards, hobbits, dragons, fairy tales ' +
      'retold. Reach for its ordinary furniture, not its deep lore.',
  },
  {
    id: 'scifi-space',
    label: 'sci-fi & space',
    allowProperNouns: true,
    ask:
      'Register for THIS pick: SCIENCE FICTION OR REAL SPACE — starships, robots, Mars missions, ' +
      'observatories, time travel. Invented or actual, so long as the things in it are concrete.',
  },
  {
    id: 'comics-film',
    label: 'comics, film & animation',
    allowProperNouns: true,
    ask:
      'Register for THIS pick: COMICS, FILM OR ANIMATION — superheroes, detectives, studio ' +
      'monsters, animated classics. A story world people watched or read, not one they played.',
  },

  // --- what people do for fun (was one "sports & pop" bucket) ---
  {
    id: 'sports-games',
    label: 'sports & games',
    allowProperNouns: true,
    ask:
      'Register for THIS pick: A SPORT OR GAME — baseball, climbing, chess, surfing, darts. Its ' +
      'kit, its places, its rituals. What a casual fan would recognise, never deep statistics.',
  },
  {
    id: 'music-performance',
    label: 'music & performance',
    allowProperNouns: true,
    ask:
      'Register for THIS pick: MUSIC OR PERFORMANCE — an instrument, a genre, a venue, a circus, ' +
      'a dance. The making and the watching of it.',
  },
  {
    id: 'hobbies-collections',
    label: 'hobbies & collections',
    allowProperNouns: true,
    ask:
      'Register for THIS pick: A HOBBY OR COLLECTION — stamps, model trains, birdwatching, ' +
      'gardening, tabletop games, restoring old cars. What someone does on a Saturday for love.',
  },
];

/** Lookup by id; null for an id no longer in the corpus. */
export const registerById = (id) => REGISTERS.find((register) => register.id === id) ?? null;
