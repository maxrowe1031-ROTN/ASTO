// The PuzzleEngine. PURE — no DOM, no fetch, no globals, no unseeded randomness.
// It imports only its own siblings, and it is the only place game rules are decided.
//
// State shape:
//   { puzzle, rules, boardTerms, selectedTerms, solvedSetIds, hintedSetIds, hintsUsed,
//     vocabRevealed, mistakes, status }
//
// `boardTerms` holds unsolved tiles only. Solving removes those four words, so grid
// shrink, shuffle-unsolved-only, and the can't-resubmit-a-solved-set guard all fall out
// by construction rather than needing their own rules.
//
// Every export returns a new frozen state and never mutates its arguments.

import { acceptedOrders, canonicalOrder, deriveWords } from './arrangements.js';
import { fisherYates } from './rng.js';

export const MAX_MISTAKES = 4;

/**
 * Tunable rules. `maxMistakes: Infinity` is how the first-run tutorial becomes no-lose
 * without forking the engine — mistakes still increment, so the "So close!" beat still
 * teaches, they just never end the game.
 *
 * `soCloseCostsMistake` and `clearSelectionOnFail` are the two GDD §8.3 playtest
 * hypotheses. They default to the shipped behaviour and exist so revisiting them is a
 * config change, not an engine change. Revised 2026-08-25 (Max): a failure whose
 * WORDS are right no longer clears — see clearsSelection() below.
 */
export const DEFAULT_RULES = Object.freeze({
  maxMistakes: MAX_MISTAKES,
  soCloseCostsMistake: true,
  clearSelectionOnFail: true,
  hintsAllowed: 1
});

/**
 * Start a game. Deterministic on purpose — the board comes out in derived order and the
 * controller calls shuffle() with an injected RNG, keeping randomness at one seam.
 */
export function initGame(puzzle, rules = {}) {
  return freezeState({
    puzzle,
    rules: { ...DEFAULT_RULES, ...rules },
    boardTerms: deriveWords(puzzle?.sets),
    selectedTerms: [],
    solvedSetIds: [],
    hintedSetIds: [],
    hintsUsed: 0,
    vocabRevealed: [],
    failedAttempts: [],
    mistakes: 0,
    status: 'playing'
  });
}

/** Tap a tile. The fourth tap fills the frame; it never submits (GDD §5, §6). */
export function select(state, term) {
  if (state.status !== 'playing') return state;
  if (state.selectedTerms.length >= 4) return state;
  if (state.selectedTerms.includes(term)) return state;
  if (!state.boardTerms.includes(term)) return state;
  return nextState(state, { selectedTerms: [...state.selectedTerms, term] });
}

/** Remove a term from the frame; the remaining terms keep their relative order. */
export function deselect(state, term) {
  if (state.status !== 'playing') return state;
  if (!state.selectedTerms.includes(term)) return state;
  return nextState(state, { selectedTerms: state.selectedTerms.filter((t) => t !== term) });
}

/**
 * Commit a drag-to-reorder. Order is game-semantic — it decides "so close" versus solved
 * — so it lives here and not in the view.
 */
export function reorderSelected(state, from, to) {
  if (state.status !== 'playing') return state;
  const count = state.selectedTerms.length;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return state;
  if (from < 0 || from >= count || to < 0 || to >= count || from === to) return state;

  const selectedTerms = [...state.selectedTerms];
  const [moved] = selectedTerms.splice(from, 1);
  selectedTerms.splice(to, 0, moved);
  return nextState(state, { selectedTerms });
}

/** Clear the frame. Always free — it is not a submission. */
export function clearSelection(state) {
  if (state.status !== 'playing') return state;
  if (state.selectedTerms.length === 0) return state;
  return nextState(state, { selectedTerms: [] });
}

/** Reshuffle the unsolved tiles. The selection is deliberately left alone. */
export function shuffle(state, rand) {
  if (typeof rand !== 'function') {
    throw new TypeError('shuffle requires an injected rand() function');
  }
  if (state.status !== 'playing') return state;
  return nextState(state, { boardTerms: fisherYates(state.boardTerms, rand) });
}

/**
 * Spend a hint: mark one random unsolved, not-yet-hinted set as hinted. The reveal is
 * state (`hintedSetIds`) — views tint those tiles in the set's tier colour, a sanctioned
 * exception (2026-08-11) to "tiers are never shown on the board". The outcome carries
 * only its type; the outcome-payload no-leak rule stays intact.
 *
 * Free by design (GDD §8.3's non-penalty hypothesis) and bounded by `rules.hintsAllowed`.
 * Returns `{ state, outcome: null }` unchanged when no hint can be given.
 */
export function hint(state, rand) {
  if (typeof rand !== 'function') {
    throw new TypeError('hint requires an injected rand() function');
  }
  if (state.status !== 'playing') return { state, outcome: null };
  if (state.hintsUsed >= state.rules.hintsAllowed) return { state, outcome: null };

  const candidates = state.puzzle.sets.filter(
    (set) => !state.solvedSetIds.includes(set.id) && !state.hintedSetIds.includes(set.id)
  );
  if (candidates.length === 0) return { state, outcome: null };

  const picked = candidates[Math.floor(rand() * candidates.length)];
  return {
    state: nextState(state, {
      hintedSetIds: [...state.hintedSetIds, picked.id],
      hintsUsed: state.hintsUsed + 1
    }),
    outcome: { type: 'hint' }
  };
}

/**
 * Reveal the definition of the board's glossed word (design.md D-18). Free and
 * deterministic — the puzzle data names the word, so unlike hint() there is no
 * RNG seam. Reveals the first glossary entry whose word is still on the board;
 * the view renders it persistently from `vocabRevealed` (the hint lesson:
 * transient help is a memory test). No-ops when there is nothing to reveal.
 */
export function revealVocab(state) {
  if (state.status !== 'playing') return { state, outcome: null };

  const entry = (state.puzzle.glossary ?? []).find(
    (candidate) =>
      state.boardTerms.includes(candidate.word) && !state.vocabRevealed.includes(candidate.word)
  );
  if (!entry) return { state, outcome: null };

  return {
    state: nextState(state, { vocabRevealed: [...state.vocabRevealed, entry.word] }),
    outcome: { type: 'vocab' }
  };
}

/**
 * The one reducer. Guard, then ordered comparison, then resolve.
 *
 * Returns `{ state, outcome }` where outcome.type is one of:
 *   solved        — carries { setId, canonicalOrder } for the snap-to-canonical animation
 *   so-close      — right four words, wrong order. Carries NOTHING else, deliberately: a
 *                   payload naming the set would let the view leak which tier the player
 *                   nearly had.
 *   miss          — anything else
 *   already-tried — the exact ordered submission of an earlier charged failure. Free:
 *                   the same mistake never costs twice (2026-08-01 playtest rule). The
 *                   same four words in a DIFFERENT order is a new claim and evaluates
 *                   normally. Carries only its type, like so-close.
 *   invalid       — malformed submission. A true no-op: no mistake, same state back.
 */
export function submit(state, orderedTerms) {
  const reason = guard(state, orderedTerms);
  if (reason) return { state, outcome: { type: 'invalid', reason } };

  const unsolved = state.puzzle.sets.filter((set) => !state.solvedSetIds.includes(set.id));
  // Right words, wrong order — computed before the history check because BOTH
  // failure paths need it: a selection whose words are right survives every
  // failure (Max's 2026-08-25 revision of the GDD §8.3 bet), and that must
  // include the free identical resubmit, or the frame the player is reordering
  // would vanish under them mid-thought.
  const rightWordsWrongOrder = unsolved.some((set) => sameMembers(set.pairs.flat(), orderedTerms));

  // Accepted orders can never be in the history — they would have solved — so this
  // check can safely come before the set comparison.
  if (state.failedAttempts.some((attempt) => sameOrder(attempt, orderedTerms))) {
    return {
      state: nextState(state, {
        selectedTerms: clearsSelection(state.rules, rightWordsWrongOrder)
          ? []
          : state.selectedTerms
      }),
      outcome: { type: 'already-tried' }
    };
  }

  for (const set of unsolved) {
    // Ordered comparison against each derived accepted order. Never sorted — order is
    // the game.
    if (acceptedOrders(set.pairs).some((order) => sameOrder(order, orderedTerms))) {
      return resolveSolved(state, set);
    }
  }

  return resolveFailure(state, rightWordsWrongOrder ? 'so-close' : 'miss', orderedTerms);
}

/**
 * Does this failure clear the frame? Only when the WORDS are wrong. A so-close
 * has the right four words in the wrong order, so the player's next move is
 * reordering exactly these tiles — clearing would send them hunting for words
 * the game just told them were right (Max, 2026-08-25, revising the original
 * §8.3 playtest bet that cleared on every failure). `clearSelectionOnFail:
 * false` still means what it always meant: nothing clears, ever — the
 * tutorial's wrong answer stays in the frame.
 */
function clearsSelection(rules, rightWordsWrongOrder) {
  return rules.clearSelectionOnFail && !rightWordsWrongOrder;
}

function guard(state, terms) {
  if (state.status !== 'playing') return 'not-playing';
  if (!Array.isArray(terms) || terms.length !== 4) return 'wrong-length';
  if (new Set(terms).size !== 4) return 'duplicate-terms';
  if (terms.some((term) => !state.boardTerms.includes(term))) return 'off-board';
  return null;
}

function resolveSolved(state, set) {
  const solvedSetIds = [...state.solvedSetIds, set.id];
  const solvedWords = new Set(set.pairs.flat());
  return {
    state: nextState(state, {
      boardTerms: state.boardTerms.filter((term) => !solvedWords.has(term)),
      selectedTerms: [],
      solvedSetIds,
      status: solvedSetIds.length === state.puzzle.sets.length ? 'won' : state.status
    }),
    outcome: { type: 'solved', setId: set.id, canonicalOrder: canonicalOrder(set.pairs) }
  };
}

function resolveFailure(state, type, orderedTerms) {
  const costsMistake = type === 'miss' || state.rules.soCloseCostsMistake;
  const mistakes = state.mistakes + (costsMistake ? 1 : 0);
  return {
    state: nextState(state, {
      mistakes,
      selectedTerms: clearsSelection(state.rules, type === 'so-close') ? [] : state.selectedTerms,
      // Detached copy: the history must not alias an array the caller can still mutate.
      failedAttempts: [...state.failedAttempts, Object.freeze([...orderedTerms])],
      status: mistakes >= state.rules.maxMistakes ? 'lost' : state.status
    }),
    outcome: { type }
  };
}

function sameOrder(a, b) {
  return a.length === b.length && a.every((term, i) => term === b[i]);
}

function sameMembers(a, b) {
  if (a.length !== b.length) return false;
  const members = new Set(a);
  return b.every((term) => members.has(term));
}

function nextState(state, changes) {
  return freezeState({ ...state, ...changes });
}

/**
 * Freeze what the engine owns. The puzzle is referenced, not frozen — freezing is a
 * mutation, and the engine does not modify what the caller handed it.
 */
function freezeState(state) {
  Object.freeze(state.rules);
  Object.freeze(state.boardTerms);
  Object.freeze(state.selectedTerms);
  Object.freeze(state.solvedSetIds);
  Object.freeze(state.hintedSetIds);
  Object.freeze(state.vocabRevealed);
  Object.freeze(state.failedAttempts);
  return Object.freeze(state);
}
