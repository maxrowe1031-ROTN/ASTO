// Accepted-order derivation. PURE — imports nothing, touches nothing.
//
// A set is stored as two ordered pairs, [[A, B], [C, D]], and that is the single source
// of truth. The four logically equivalent orders are derived here at runtime so no human
// ever hand-types an answer list (GDD §7.2–7.3).

/** The four orders a set accepts, given its stored pairs. */
export function acceptedOrders(pairs) {
  const [[a, b], [c, d]] = assertPairs(pairs);
  return [
    [a, b, c, d], // as stored
    [c, d, a, b], // both sides swapped
    [b, a, d, c], // both relationships reversed
    [d, c, b, a] // swapped and reversed
  ];
}

/**
 * The other two ways to group a set's own four words — the readings the engine REFUSES.
 *
 * `acceptedOrders` says which readings play; this says which ones a human might still
 * find convincing while the engine marks them wrong. That gap is real:
 * `ignition : shutdown :: departure : arrival` also reads `ignition : departure ::
 * shutdown : arrival`, and a player who sees the second loses a mistake for it.
 * `board-integrity.js` says in its own header that exhaustive search cannot catch this
 * (design.md risk 1) — because the words ARE distinct, so the sweep sees a clean board.
 *
 * Two candidates, not twenty-four. Four words admit exactly three pairings: the intended
 * one and these. Every other rearrangement is one of the same three CLAIMS read backwards
 * or with its halves swapped, which the engine already treats as equivalent.
 *
 * Deliberately blind to whether a reading is any good — enumerating is mechanical,
 * judging is not. The Studio's adversarial solver is handed these strings and asked,
 * one closed question each, whether they read as valid analogies.
 */
export function crossPairings(pairs) {
  const [[a, b], [c, d]] = assertPairs(pairs);
  return [
    [a, c, b, d], // A : C :: B : D — the classic wrong reading
    [a, d, b, c] // A : D :: B : C
  ];
}

/**
 * The stored order — what a solved card always displays, whichever accepted order the
 * player actually confirmed. Relationship labels are directional, so the display
 * normalizes even though the engine accepts all four.
 */
export function canonicalOrder(pairs) {
  const [[a, b], [c, d]] = assertPairs(pairs);
  return [a, b, c, d];
}

/**
 * The board's words, derived from its sets. There is no `words[]` in the data — the 16
 * tiles are a consequence of the pairs, which is what keeps them from ever disagreeing.
 */
export function deriveWords(sets) {
  if (!Array.isArray(sets)) {
    throw new TypeError('deriveWords expects an array of sets');
  }
  return sets.flatMap((set) => assertPairs(set?.pairs).flat());
}

function assertPairs(pairs) {
  const shaped =
    Array.isArray(pairs) &&
    pairs.length === 2 &&
    pairs.every((pair) => Array.isArray(pair) && pair.length === 2);
  if (!shaped) {
    throw new TypeError('pairs must be exactly two ordered pairs: [[A, B], [C, D]]');
  }
  return pairs;
}
