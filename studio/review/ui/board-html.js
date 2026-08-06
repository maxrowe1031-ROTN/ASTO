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
import { resolveShape } from '../../corpus/vocabulary.js';

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

/**
 * A set as "A : B :: C : D", in the order the game accepts as canonical.
 *
 * Shared because the board card and the feedback form both show it, and two
 * copies would drift. Built from the four terms rather than by rewriting a
 * joined string: the earlier inline version matched on `\S+`, so a two-word
 * term like "Gulf Stream" silently lost its "::" and the set read as four
 * things in a row.
 */
export function analogyOf(set) {
  // canonicalOrder throws on a malformed set, which is right for the engine
  // and wrong for a review page — a half-written board should still render
  // enough of itself to be looked at. So the shape is checked here.
  const pairs = set?.pairs;
  if (!Array.isArray(pairs) || pairs.length !== 2) return '';
  if (!pairs.every((pair) => Array.isArray(pair) && pair.length === 2)) return '';

  const [a, b, c, d] = canonicalOrder(pairs);
  return `${a} : ${b} :: ${c} : ${d}`;
}

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
 * The stance line for one set: the kind of question it asks, taught beside
 * the set rather than assumed known. More kinds of output make faults harder
 * to spot, so the card carries the checklist — the vocabulary's paradigm pair
 * and its named failure mode — turning "is this good?" into "is this a good
 * example of THAT kind?", which is a question the reviewer can answer.
 */
function stanceHtml(shapeId) {
  const shape = resolveShape(shapeId);
  if (!shape) return '';
  return [
    `\n    <div class="stance" data-stance="${escape(shape.stance)}">`,
    `      <span class="stance-name">${escape(shape.stance)}</span> · ${escape(shape.description)}, like <em>${escape(shape.paradigm)}</em>`,
    `      <div class="stance-failure">⚠ ${escape(shape.failureMode)}</div>`,
    '    </div>',
  ].join('\n');
}

/**
 * What the evaluators said about ONE set, folded shut.
 *
 * Stages 05 and 06 have been describing real defects in prose for weeks — 05
 * named the cars grain mismatch exactly, 06 flagged the Grateful Dead set as
 * ambiguous-order — and both were reachable only in a collapsed panel at the
 * bottom of the page, filed by stage rather than by set. Max rediscovered both
 * by playing the boards. Their findings are per-set, so this is where they go.
 *
 * Closed by default, deliberately. The review loop exists to capture an
 * unbiased first read — the same reason the Revision Proposer's brief stays
 * hidden until after judgement — so the machine's opinion is one click away
 * rather than in the way.
 *
 * `notes` is [{ source, level, text }] and this file does not know which stage
 * produced what: the caller joins, this renders.
 */
function machineNotesHtml(notes = []) {
  if (notes.length === 0) return '';
  const worst = notes.some((note) => note.level === 'high') ? 'high' : notes[0].level;
  const lines = notes
    .map(
      (note) =>
        `        <li data-level="${escape(note.level)}"><span class="machine-source">${escape(note.source)}</span> ${escape(note.text)}</li>`,
    )
    .join('\n');
  return [
    `\n    <details class="machine-notes" data-level="${escape(worst)}">`,
    `      <summary>${notes.length} machine note${notes.length === 1 ? '' : 's'}</summary>`,
    '      <ul>',
    lines,
    '      </ul>',
    '    </details>',
  ].join('\n');
}

/**
 * The four sets as the game reveals them once solved.
 *
 * `promotions` is the one thing here a player never sees. The builder may
 * label its hardest available set Black even when the rater graded it lower,
 * and that judgement is exactly what the review loop is meant to sharpen — so
 * it is shown to the reviewer rather than absorbed into a tier badge.
 *
 * `shapesBySet` (set id → declared shape id, from the grouper's output) adds
 * the stance line the same way: a judgement the reviewer cannot see is one
 * he cannot correct.
 */
export function setsHtml(board, promotions = [], shapesBySet = {}, notesBySet = {}) {
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
      const analogy = analogyOf(set);
      return [
        `  <article class="solved-card" data-tier="${escape(tier)}" data-set-id="${escape(set.id)}">`,
        `    <span class="tier-badge">${escape(tier)}</span>${promotionHtml}`,
        `    <div class="analogy">${escape(analogy)}</div>`,
        `    <div class="relationship">${escape(set.relationshipLabel)}</div>`,
        `    <div class="explanation">${escape(set.explanation)}</div>${stanceHtml(shapesBySet[set.id])}${machineNotesHtml(notesBySet[set.id])}`,
        '  </article>',
      ].join('\n');
    })
    .join('\n');
}

/**
 * The board's intended shape, readable before playing: its four stances and
 * the style guide's unity verdict with any words it flagged as outside the
 * world. Unity is advisory by design — shown, never a gate.
 */
export function boardShapeHtml({ shapesBySet = {}, unity = null, evocativeness = null } = {}) {
  const stances = [
    ...new Set(
      Object.values(shapesBySet)
        .map((shapeId) => resolveShape(shapeId)?.stance)
        .filter(Boolean),
    ),
  ];
  if (stances.length === 0 && !unity && !evocativeness) return '';

  const outliers = (unity?.outliers ?? [])
    .map((outlier) => `      <div class="unity-outlier">⚠ ${escape(outlier.word)} — ${escape(outlier.note)}</div>`)
    .join('\n');
  // The flat words, each with the sharper one where 08 could name it. This is
  // the actionable half of the verdict: "generic" alone is not something Max
  // can do anything with, "workshop → woodshop" is.
  const generic = (evocativeness?.generic ?? [])
    .map(
      (entry) =>
        `      <div class="evocativeness-generic">⚠ ${escape(entry.word)}${
          entry.suggestion ? ` → <strong>${escape(entry.suggestion)}</strong>` : ''
        } — ${escape(entry.note)}</div>`,
    )
    .join('\n');
  return [
    '  <div class="board-shape">',
    stances.length > 0
      ? `    <div class="board-stances">stances: ${stances.map((s) => `<span class="stance-name">${escape(s)}</span>`).join(' · ')}</div>`
      : '',
    unity
      ? `    <div class="unity" data-verdict="${escape(unity.verdict)}">unity: <strong>${escape(unity.verdict)}</strong> — ${escape(unity.reasoning)}</div>${outliers ? `\n${outliers}` : ''}`
      : '',
    // Beside unity, never folded into it. A board can be strongly unified and
    // completely generic — that combination is precisely the 2026-08-05
    // Grateful Dead board, and showing one verdict without the other is how it
    // reached Max looking healthy.
    evocativeness
      ? `    <div class="evocativeness" data-verdict="${escape(evocativeness.verdict)}">evocativeness: <strong>${escape(evocativeness.verdict)}</strong> — ${escape(evocativeness.reasoning)}</div>${generic ? `\n${generic}` : ''}`
      : '',
    '  </div>',
  ]
    .filter(Boolean)
    .join('\n');
}

export function boardHtml(
  board,
  promotions = [],
  { shapesBySet = {}, unity = null, evocativeness = null, notesBySet = {} } = {},
) {
  if (!board?.sets) return '';
  const shape = boardShapeHtml({ shapesBySet, unity, evocativeness });
  return `${shape ? `${shape}\n` : ''}${tilesHtml(board)}\n<div class="solved-sets">\n${setsHtml(board, promotions, shapesBySet, notesBySet)}\n</div>`;
}
