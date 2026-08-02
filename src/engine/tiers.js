// Difficulty → tier. PURE — imports nothing.
//
// Boards carry `difficulty` 1–4 and nothing else; the tier is derived. Schema v1.0 has no
// `tier` field precisely so the two can never disagree. Tiers are revealed on solve and
// are never shown on the board (GDD §9).

export const TIERS = Object.freeze(['green', 'yellow', 'red', 'black']);

export function difficultyToTier(difficulty) {
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 4) {
    throw new RangeError(`difficulty must be an integer 1–4, received ${String(difficulty)}`);
  }
  return TIERS[difficulty - 1];
}
