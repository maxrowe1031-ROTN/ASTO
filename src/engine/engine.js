// The PuzzleEngine. PURE — no DOM, no fetch, no globals, no unseeded randomness.
// It imports only its own siblings, and it is the only place game rules are decided.
//
// State shape:
//   { puzzle, rules, boardTerms, selectedTerms, solvedSetIds, mistakes, status }
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
 * config change, not an engine change.
 */
export const DEFAULT_RULES = Object.freeze({
  maxMistakes: MAX_MISTAKES,
  soCloseCostsMistake: true,
  clearSelectionOnFail: true
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
 * The one reducer. Guard, then ordered comparison, then resolve.
 *
 * Returns `{ state, outcome }` where outcome.type is one of:
 *   solved    — carries { setId, canonicalOrder } for the snap-to-canonical animation
 *   so-close  — right four words, wrong order. Carries NOTHING else, deliberately: a
 *               payload naming the set would let the view leak which tier the player
 *               nearly had.
 *   miss      — anything else
 *   invalid   — malformed submission. A true no-op: no mistake, same state back.
 */
export function submit(state, orderedTerms) {
  const reason = guard(state, orderedTerms);
  if (reason) return { state, outcome: { type: 'invalid', reason } };

  const unsolved = state.puzzle.sets.filter((set) => !state.solvedSetIds.includes(set.id));

  for (const set of unsolved) {
    // Ordered comparison against each derived accepted order. Never sorted — order is
    // the game.
    if (acceptedOrders(set.pairs).some((order) => sameOrder(order, orderedTerms))) {
      return resolveSolved(state, set);
    }
  }

  const rightWordsWrongOrder = unsolved.some((set) => sameMembers(set.pairs.flat(), orderedTerms));
  return resolveFailure(state, rightWordsWrongOrder ? 'so-close' : 'miss');
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

function resolveFailure(state, type) {
  const costsMistake = type === 'miss' || state.rules.soCloseCostsMistake;
  const mistakes = state.mistakes + (costsMistake ? 1 : 0);
  return {
    state: nextState(state, {
      mistakes,
      selectedTerms: state.rules.clearSelectionOnFail ? [] : state.selectedTerms,
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
  return Object.freeze(state);
}
