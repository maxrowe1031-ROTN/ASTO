// Board integrity. PURE — imports only its engine siblings.
//
// Every ordered 4-tuple of the board's words (16·15·14·13 = 43,680) is pushed through the
// real engine.submit(). A clean board accepts exactly sixteen of them — four derived
// orders for each of four sets — and nothing else.
//
// Two honest notes about what this does and does not prove:
//
//   * It samples the ENGINE, not a copy of the schema rules. That is the point. If a
//     future change ever sorted a submission, or widened acceptance in any other way, the
//     accepted count would balloon past sixteen and every board in puzzles/ would fail on
//     the next `npm test`.
//   * It is mechanical. It cannot tell you that a human would find some unintended
//     reading plausible. That risk is real (design.md, risk 1) and only playtest eyes
//     catch it.

import { acceptedOrders, deriveWords } from './arrangements.js';
import { initGame, submit } from './engine.js';

export function checkBoard(puzzle) {
  const words = deriveWords(puzzle.sets);
  const duplicateWords = [...new Set(words.filter((word, i) => words.indexOf(word) !== i))];
  const tiles = [...new Set(words)];

  const state = initGame(puzzle);
  const solved = [];
  let soCloseCount = 0;
  let tuplesChecked = 0;

  const n = tiles.length;
  for (let a = 0; a < n; a += 1) {
    for (let b = 0; b < n; b += 1) {
      if (b === a) continue;
      for (let c = 0; c < n; c += 1) {
        if (c === a || c === b) continue;
        for (let d = 0; d < n; d += 1) {
          if (d === a || d === b || d === c) continue;

          const tuple = [tiles[a], tiles[b], tiles[c], tiles[d]];
          tuplesChecked += 1;

          const { outcome } = submit(state, tuple);
          if (outcome.type === 'solved') solved.push(tuple);
          else if (outcome.type === 'so-close') soCloseCount += 1;
        }
      }
    }
  }

  // Attribute the handful of accepted tuples back to sets, so a tuple that two sets both
  // claim is reported rather than silently assigned to whichever matched first.
  const accepted = solved.map((order) => ({
    order,
    setIds: puzzle.sets
      .filter((set) => acceptedOrders(set.pairs).some((candidate) => sameOrder(candidate, order)))
      .map((set) => set.id)
  }));
  const collisions = accepted.filter((entry) => entry.setIds.length !== 1);
  const expectedAccepted = puzzle.sets.length * 4;

  return {
    ok: duplicateWords.length === 0 && accepted.length === expectedAccepted && collisions.length === 0,
    words,
    duplicateWords,
    tuplesChecked,
    acceptedCount: accepted.length,
    expectedAccepted,
    accepted,
    collisions,
    soCloseCount
  };
}

function sameOrder(a, b) {
  return a.length === b.length && a.every((term, i) => term === b[i]);
}
