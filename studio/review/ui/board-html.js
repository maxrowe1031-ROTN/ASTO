// board-html.js — a candidate board, rendered the way the game renders one.
//
// ═══ INTENTIONAL DUPLICATION ═══
// This re-emits the markup that src/view/board-view.js and
// src/view/solved-sets-view.js produce, and it is a deliberate copy, not an
// oversight (Studio spec, amendment 2). Those views own persistent keyed DOM
// nodes so FLIP animations can survive a re-render; the Studio needs none of
// that and forcing them into dual service would complicate the thing the game
// actually depends on. The cost of the copy is that the two can drift, so:
//
//   * the CLASSES here must stay the game's — .board, .tile, .solved-card,
//     .tier-badge, .analogy, .relationship, .explanation. The Studio links the
//     game's real stylesheets, so a renamed class shows up immediately as an
//     unstyled page rather than a subtle difference.
//   * the DERIVATIONS are imported from the engine, never reimplemented:
//     deriveWords, canonicalOrder, difficultyToTier, fisherYates, mulberry32.
//     Nothing about what a board MEANS is duplicated — only how it is spelled.
//   * parity is checked side by side in the browser at each gate.
//
// If you change this file, look at src/view/solved-sets-view.js. If you change
// that one, look at this.

// Relative, not absolute: the server mirrors the repo layout for the paths it
// mounts, so these same specifiers resolve under node (for the tests) and in
// the browser (from /studio/review/ui/).
import { canonicalOrder, deriveWords } from '../../../src/engine/arrangements.js';
import { difficultyToTier } from '../../../src/engine/tiers.js';
import { fisherYates, mulberry32 } from '../../../src/engine/rng.js';

// A board is model output. It is rendered, so it is escaped.
const escape = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Stable per board, so re-opening a run shows the same layout rather than
// reshuffling under Max between visits.
const seedOf = (id) => {
  let hash = 2166136261;
  for (const char of String(id ?? '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** The sixteen words in the order a player would meet them. */
export function tilesFor(board) {
  if (!board?.sets) return [];
  return fisherYates(deriveWords(board.sets), mulberry32(seedOf(board.id)));
}

/** The board as a player sees it, before anything is solved. */
export function tilesHtml(board) {
  const tiles = tilesFor(board)
    .map((word) => `    <button class="tile" type="button" disabled>${escape(word)}</button>`)
    .join('\n');
  return `  <div class="board">\n${tiles}\n  </div>`;
}

/**
 * The four sets as the game reveals them once solved.
 *
 * `promotions` is the one thing here a player never sees. The builder may
 * label its hardest available set Black even when the rater graded it lower,
 * and that judgement is exactly what the review loop is meant to sharpen — so
 * it is shown to the reviewer rather than absorbed into a tier badge.
 */
export function setsHtml(board, promotions = []) {
  const promotedBy = new Map(
    (promotions ?? []).map((promotion) => [promotion.setId, promotion]),
  );

  return (board?.sets ?? [])
    .slice()
    .sort((a, b) => a.difficulty - b.difficulty)
    .map((set) => {
      const tier = difficultyToTier(set.difficulty);
      const promotion = promotedBy.get(set.id);
      const promotionHtml = promotion
        ? `\n    <div class="promotion">graded ${escape(promotion.gradedDifficulty)} — promoted to ${escape(
            tier.charAt(0).toUpperCase() + tier.slice(1),
          )}</div>`
        : '';
      const analogy = canonicalOrder(set.pairs).join(' : ').replace(/^(\S+ : \S+) : /, '$1 :: ');
      return [
        `  <article class="solved-card" data-tier="${escape(tier)}" data-set-id="${escape(set.id)}">`,
        `    <span class="tier-badge">${escape(tier)}</span>${promotionHtml}`,
        `    <div class="analogy">${escape(analogy)}</div>`,
        `    <div class="relationship">${escape(set.relationshipLabel)}</div>`,
        `    <div class="explanation">${escape(set.explanation)}</div>`,
        '  </article>',
      ].join('\n');
    })
    .join('\n');
}

export function boardHtml(board, promotions = []) {
  if (!board?.sets) return '';
  return `${tilesHtml(board)}\n<div class="solved-sets">\n${setsHtml(board, promotions)}\n</div>`;
}
