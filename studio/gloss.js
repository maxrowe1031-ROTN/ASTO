// gloss.js — the one derivation of "which glossary entries ride on this board".
//
// Stage 09 writes definitions for the board it saw; a hand-edit (D-22) can
// remove the very word a definition points at, and validate-puzzle rightly
// rejects a glossary word that is not on the board. This module filters the
// glossary against the board's actual words and REPORTS what it dropped, so
// the drop lands in Max's face at edit time and on the publish record — never
// as a confusing schema error at the end.
//
// Shared by the server's publish path and the review page's play/preview
// (server.js serves it to the browser for the same reason it serves slug.js:
// the gloss the page previews and the gloss publish ships must be one
// derivation). Pure: no fs, no fetch, board never mutated.

/** The same case-insensitive rule validate-puzzle applies. */
const wordsOf = (board) =>
  new Set(board.sets.flatMap((set) => set.pairs.flat()).map((word) => word.toLowerCase()));

/**
 * @returns {{ board, dropped }} — `board` carries `glossary` only when at
 * least one entry survives; `dropped` lists the entries whose word left.
 */
export function mergeGlossary(board, glossary) {
  const entries = Array.isArray(glossary) ? glossary : [];
  const words = wordsOf(board);
  const kept = entries.filter((entry) => words.has(entry.word.toLowerCase()));
  const dropped = entries.filter((entry) => !words.has(entry.word.toLowerCase()));

  const { glossary: _previous, ...bare } = board;
  return {
    board: kept.length > 0 ? { ...bare, glossary: kept } : bare,
    dropped
  };
}
