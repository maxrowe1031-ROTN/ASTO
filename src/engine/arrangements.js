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
