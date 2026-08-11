// The first-run coach-marks. PURE — no DOM, no storage, no globals. It imports nothing
// outside itself, exactly like the engine, so the whole of the tutorial's teaching logic
// is unit-testable and the overlay that draws it stays dumb.
//
// GDD §5.2 names the three ideas a first-time player needs:
//   1. you are hunting a RELATIONSHIP, not a category
//   2. ORDER matters
//   3. what :: means
// plus a fourth requirement — "a wrong attempt simply nudges the player with a hint".
//
// That fourth one is why this module diagnoses. "Not quite" teaches nothing, so every
// wrong submission is classified by WHY it was wrong: cross-paired, backwards, three of a
// set plus a stranger, two halves of two sets, or four scattered words. The classification
// is a pure reading of the board the player is already looking at.
//
// WHERE THE HINT LINE IS DRAWN. The main game's `so-close` and `miss` outcomes carry no
// payload on purpose, so no view can leak which set or tier was nearly had. This module
// does not read the outcome for that — it derives the shape of the mistake from the
// puzzle itself, and only ever describes that SHAPE: how many words go together, whether
// the halves are intact. It never names a set, a tier, a relationship label, or a word.
// Hinting is the tutorial's entire job (§5.2); nothing here runs on a real puzzle.
//
// Copy rule (GDD §11.3): short, friendly, no snark.

/**
 * The rules the tutorial board runs under. Both are existing engine dials, so the
 * tutorial is a configuration of the game rather than a fork of it.
 *
 * - `maxMistakes: Infinity` — no-lose (§5.2). Mistakes still increment, so the "So
 *   close!" beat still teaches; they just never end the game.
 * - `clearSelectionOnFail: false` — the wrong answer STAYS IN THE FRAME. The main game
 *   sweeps it away, but a diagnosis the player cannot check against their own submission
 *   is a diagnosis they have to take on trust. The tiles shake to say "wrong" and then
 *   stay put, so "the pairs are split across the middle" can be read while looking at the
 *   split. It also makes the advice actionable: "swap that one out" is one tap when the
 *   other three are still selected.
 */
export const TUTORIAL_RULES = Object.freeze({
  maxMistakes: Infinity,
  clearSelectionOnFail: false,
  // The tutorial scripts its own nudges (GDD §5.2); a free-form hint mid-script would
  // fight the choreography, so the pill never appears here.
  hintsAllowed: 0
});

const REASSURANCE = 'Nothing lost — the warm-up costs no beans.';

const STEPS = Object.freeze({
  relationship: {
    id: 'relationship',
    body: "Four tiles, one analogy. You're hunting a relationship that repeats — not a category of similar words.",
    action: null
  },
  // One line per tap. The coach has to say something new every time the frame changes —
  // a panel that holds still while the player is acting reads as broken, not as calm.
  'pair-hunt': {
    id: 'pair-hunt',
    body: 'One word down. Now find the one it pairs with — the word it has the clearest relationship to.',
    action: null
  },
  notation: {
    id: 'notation',
    body: "That's your first pair. The next two have to relate the same way: A is to B as C is to D. That's what :: means.",
    action: null
  },
  'one-more': {
    id: 'one-more',
    body: 'One more. The fourth word should finish the second pair the way the second word finished the first.',
    action: null
  },
  order: {
    id: 'order',
    body: 'Order matters. Drag a word to move it, then press Confirm when the analogy reads right.',
    action: null
  },

  'keep-going': {
    id: 'keep-going',
    body: 'Pick four more tiles. What matters is the relationship that repeats, not what the words have in common.',
    action: null
  },
  done: {
    id: 'done',
    body: "That's it — a relationship, in order. Ready for the real puzzles?",
    action: null
  },
  'solved-idle': {
    id: 'solved-idle',
    body: "That's one down. Take another if you fancy it, or head for the real puzzles.",
    action: null
  }
});

// What the coach says as the frame fills, indexed by how many words are in it.
const PICKING = Object.freeze([null, STEPS['pair-hunt'], STEPS.notation, STEPS['one-more']]);

const CHARGED = new Set(['miss', 'so-close']);

/**
 * The diagnoses. Each is a LADDER, not a line: repeat the same kind of mistake and the
 * coach escalates from naming the problem to spelling out what to do about it.
 *
 * This is not decoration. Three different wrong guesses can share a shape — four words
 * from four relationships is four words from four relationships — and answering all of
 * them with one sentence makes a live coach look like a frozen panel. A person would
 * never repeat themselves verbatim; they would try saying it another way.
 *
 * The last line is reused once the ladder runs out.
 */
const NUDGES = Object.freeze({
  // Right four words, wrong arrangement. These follow the status strip's "So close!
  // Right four words", so they pick up where it leaves off rather than repeating it.
  'nudge-split': [
    'The pairs are split across the middle. Each half should hold one whole pair, not one word from each.',
    'Still split. Put the two words that belong together in the first two slots, and the other two in the last two.',
    'Slots one and two are one pair. Slots three and four are the other pair. Move a word and try again.'
  ],
  'nudge-direction': [
    'The pairs are right — one half just runs backwards. Both halves have to point the same way.',
    'Still backwards. If the first two go small to large, the last two have to as well. Swap them.'
  ],

  // Wrong words, described by how wrong.
  'nudge-three-and-one': [
    'Close: three of those belong to one relationship and the fourth is a stranger. Swap that one out.',
    'Three still belong together, one still does not. Take out the word you are least sure about.',
    'Only one word is wrong. Try each of the four in turn — take one out and put a different one in.'
  ],
  'nudge-two-and-two': [
    'Two of those share one relationship and two share another. All four have to come from the same one.',
    'Still two halves of two different ideas. Keep one half, and hunt for the pair that completes it.'
  ],
  'nudge-two-and-strays': [
    'Only two of those belong together. The other two each come from somewhere else.',
    'Two go together, two are strays. Keep the pair you trust and replace both of the others.'
  ],
  'nudge-scattered': [
    'Those four come from four different relationships. Start from two words that clearly go together.',
    'Four unrelated words again. Find one pair you are sure of first, then look for a pair that echoes it.',
    'Still nothing shared. Pick two words with an obvious link, then ask what other two work the same way.'
  ],
  'nudge-repeat': [
    "That's the same four words in the same order as before. Something has to change — a word, or the order.",
    'Same guess again. Move a word to a different slot, or swap one out for a tile you have not used.'
  ],
  'nudge-generic': ['Not this one. Look for the idea that repeats across both halves of the frame.']
});

// How many of the player's four words fell in each set, largest first.
const MISS_SHAPES = Object.freeze({
  '3-1': 'nudge-three-and-one',
  '2-2': 'nudge-two-and-two',
  '2-1-1': 'nudge-two-and-strays',
  '1-1-1-1': 'nudge-scattered'
});

/**
 * The coach-mark to show right now, or null for "say nothing".
 *
 * Every branch below is reachable by a single tap, because that is the point: a coach
 * that only speaks when you press Confirm feels dead between presses. The step is derived
 * entirely from what is on screen, so it cannot go stale and needs no memory.
 *
 * @param {object} state     engine state (tutorial board, running TUTORIAL_RULES)
 * @param {object} [outcome] the outcome of the submission that produced this render
 * @returns {{id: string, body: string, note?: string, action: 'continue'|null}|null}
 */
export function tutorialStep(state, outcome) {
  // Won or lost: the end screen owns the moment, and two panels talking at once is noise.
  if (state.status !== 'playing') return null;

  const step = coaching(state, outcome);

  // One solved set means all three ideas have been demonstrated, so the way out goes on
  // offer and STAYS on offer. Only the button is sticky, though — the words are not. A
  // player who keeps playing instead of pressing Continue must still be coached, and an
  // earlier version returned the hand-off message here and went deaf to everything after
  // it: submit a wrong answer and the box sat there congratulating you.
  return state.solvedSetIds.length > 0 ? { ...step, action: 'continue' } : step;
}

/** What the coach has to say about the board as it stands. */
function coaching(state, outcome) {
  if (outcome?.type === 'solved') return STEPS.done;

  // A repeat carries no new information about the board, so its rung is driven by how
  // much has gone wrong overall rather than by the shape of the guess.
  if (outcome?.type === 'already-tried') {
    return nudge('nudge-repeat', state.failedAttempts.length - 1);
  }

  // `invalid` is deliberately absent: it is a no-op the player never caused on purpose,
  // and nudging for it would punish a mis-tap.
  if (outcome && CHARGED.has(outcome.type)) {
    const step = diagnoseStep(state, state.failedAttempts.at(-1));
    // Said once, on the first wrong answer — repeating it turns reassurance into noise.
    return state.failedAttempts.length === 1 ? { ...step, note: REASSURANCE } : step;
  }

  const selected = state.selectedTerms;

  if (selected.length === 4) {
    // The frame still holds an answer that failed. Keep explaining THAT, rather than
    // reciting "order matters" over a board the player is already staring at — the
    // explanation lives exactly as long as the thing it describes is on screen, and the
    // moment they change a word the coaching below takes over again.
    return wasSubmitted(state, selected) ? diagnoseStep(state, selected) : STEPS.order;
  }

  if (selected.length > 0) return PICKING[selected.length];

  // Empty frame. What that means depends on how far they have got.
  if (state.solvedSetIds.length > 0) return STEPS['solved-idle'];
  if (state.failedAttempts.length > 0) return STEPS['keep-going'];

  return STEPS.relationship;
}

/** The diagnosis for those four words, on the rung this player has climbed to. */
function diagnoseStep(state, terms) {
  const id = diagnose(state, terms);

  // How many times this exact mistake has been made — including the one being explained,
  // hence the -1. Recomputed from history rather than counted, so it stays a pure
  // derivation and cannot drift out of step with the board.
  const repeats = state.failedAttempts.filter((a) => diagnose(state, a) === id).length;
  return nudge(id, repeats - 1);
}

/**
 * Why those four words are wrong, in terms of shape rather than content.
 *
 * Derived from the words alone, not from the outcome — so it answers "why is what I am
 * looking at wrong?" whether the player just submitted it or is still sitting on it.
 */
function diagnose(state, terms) {
  if (!terms || terms.length !== 4) return 'nudge-generic';

  const unsolved = state.puzzle.sets.filter((set) => !state.solvedSetIds.includes(set.id));
  const rightWords = unsolved.find((set) => sameMembers(set.pairs.flat(), terms));

  return rightWords
    ? arrangementProblem(rightWords, terms)
    : (MISS_SHAPES[missShape(unsolved, terms)] ?? 'nudge-generic');
}

/** Build a step from a nudge ladder, holding at the top rung once it runs out. */
function nudge(id, rung) {
  const ladder = NUDGES[id] ?? NUDGES['nudge-generic'];
  const index = Math.min(Math.max(rung, 0), ladder.length - 1);
  return { id, body: ladder[index], action: null };
}

/** Has this exact order already been tried and charged? */
function wasSubmitted(state, terms) {
  return state.failedAttempts.some(
    (attempt) => attempt.length === terms.length && attempt.every((word, i) => word === terms[i])
  );
}

/**
 * The four words are right; only their arrangement is wrong. Two distinct mistakes hide
 * in there, and they need different advice:
 *
 *   split     — a half of the frame holds one word from each pair. This is the grouping
 *               habit ASTO exists to unteach, and it is 16 of the 20 near misses.
 *   direction — both halves are whole pairs, but one runs backwards. The other 4.
 */
function arrangementProblem(set, submitted) {
  const pairOf = (word) => set.pairs.findIndex((pair) => pair.includes(word));
  const halvesIntact =
    pairOf(submitted[0]) === pairOf(submitted[1]) && pairOf(submitted[2]) === pairOf(submitted[3]);

  return halvesIntact ? 'nudge-direction' : 'nudge-split';
}

/** e.g. '3-1' — how the four words distributed across the unsolved sets, largest first. */
function missShape(unsolved, submitted) {
  return unsolved
    .map((set) => submitted.filter((word) => set.pairs.flat().includes(word)).length)
    .filter((count) => count > 0)
    .sort((a, b) => b - a)
    .join('-');
}

function sameMembers(a, b) {
  if (a.length !== b.length) return false;
  const members = new Set(a);
  return b.every((term) => members.has(term));
}
