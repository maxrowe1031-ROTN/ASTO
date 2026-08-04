// subjects.js — what a "surprise me" run is about.
//
// Why this file exists. A surprise-me run used to get a variety brief (which
// relationship SHAPES to reach for) and no subject at all, so the Pair Author
// authored sixteen words with nothing tying them together. Max rejected both
// surprise-me boards he has judged, both times for the same reason and in
// almost the same words — "no overall theme here. goes from money to animals
// to geology" and "There's not overall theme to all four of these analogies" —
// while every themed board he has seen (music, weather, history) he approved.
// Shape variety was never the missing ingredient; a subject was.
//
// Content, not code: adding a subject is adding a string here, and nothing
// else in the pipeline changes. That is the house rule about repeated or
// expandable content, applied to the smallest possible case.
//
// The spread is chosen against Max's own judgements. He called the ocean board
// "very science driven... too much makes the puzzle lose its fun factor", and
// praised the ones that "strike a peaceful chord". So this list leans everyday,
// sensory and cultural, and keeps hard-science subjects to a minority — they
// can still produce good boards, they just should not dominate the draw.

export const SUBJECTS = Object.freeze([
  // Everyday and domestic — the richest vein so far.
  'cooking', 'the kitchen', 'gardening', 'clothing', 'furniture', 'tools',
  'markets and money', 'letters and post', 'houses and homes', 'travel',
  // Nature and weather — concrete, familiar words.
  'weather', 'the seasons', 'rivers', 'mountains', 'forests', 'birds',
  'insects', 'the desert', 'the night sky', 'gardens in winter',
  // Culture and craft.
  'music', 'painting', 'theatre', 'books and libraries', 'photography',
  'dance', 'architecture', 'poetry', 'cinema', 'sculpture',
  // Human life and history.
  'history', 'childhood', 'sport', 'medicine', 'school',
  'crafts and trades', 'festivals', 'journeys and pilgrimage',
  // A little science, deliberately a minority.
  'astronomy', 'the sea', 'geology', 'flight',
  // Whimsy — the "ASTO vibe" Max keeps naming.
  'fairy tales', 'circuses', 'clocks and time', 'maps', 'mirrors',
  'sleep and dreams', 'shadows', 'keys and locks',
]);

/**
 * One subject at random.
 *
 * `random` is injected rather than reached for, like every other source of
 * randomness in this repo — it keeps the callers testable and matches the
 * engine's rule that nothing pure calls Math.random on its own.
 */
export function pickSubject(random = Math.random) {
  return SUBJECTS[Math.floor(random() * SUBJECTS.length)];
}
