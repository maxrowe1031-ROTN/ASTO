// Sharing a result.
//
// buildShareText is PURE and spoiler-free by construction: it emits one tier-colored
// square per solved set, in solve order, and never touches a board word. A shared result
// should make someone want to play the puzzle, not tell them the answers.
//
// The fourth line is the deep link home (D-34). A result pasted anywhere — including
// the itch build, whose origin is not ours — should let its reader PLAY the board, so
// the link is always the home domain and always the slug's own board.
//
// share() is the impure half — navigator.share, falling back to the clipboard.

import { difficultyToTier } from './engine/tiers.js';

/** The home domain, matching CNAME and check-deploy.js. Never the current origin. */
export const SITE_URL = 'https://www.playasto.com/';

const SQUARE = {
  green: '🟩',
  yellow: '🟨',
  red: '🟥',
  black: '⬛'
};

/** Pure: the deep link that lands a reader on exactly this board. */
export function shareUrlFor(slug) {
  return `${SITE_URL}?puzzle=${encodeURIComponent(slug)}`;
}

/**
 * e.g. "ASTO — First Light\n4/4 · 2 beans\n🟩🟨🟥⬛\nhttps://www.playasto.com/?puzzle=first-light"
 * — with " · 📖" on the score line when Learning Mode definitions were looked up (D-33):
 * the light mark, so a reader knows help was taken without the squares giving anything
 * away. The link line appears only when a slug is given; the tutorial has none.
 */
export function buildShareText(state, { slug = null } = {}) {
  const solved = state.solvedSetIds.map((id) => {
    const set = state.puzzle.sets.find((s) => s.id === id);
    return SQUARE[difficultyToTier(set.difficulty)];
  });

  const usedDefinitions = Boolean(state.rules?.learningMode) && state.vocabRevealed.length > 0;
  const lines = [
    `ASTO — ${state.puzzle.title}`,
    `${solved.length}/${state.puzzle.sets.length} · ${beans(state.mistakes)}${usedDefinitions ? ' · 📖' : ''}`
  ];
  if (solved.length > 0) lines.push(solved.join(''));
  if (slug) lines.push(shareUrlFor(slug));
  return lines.join('\n');
}

function beans(mistakes) {
  if (mistakes === 0) return 'no beans';
  return mistakes === 1 ? '1 bean' : `${mistakes} beans`;
}

/**
 * Share the text however this device can. Returns 'shared' | 'copied' | 'failed' so the
 * view can tell the player what happened.
 */
export async function share(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (error) {
      // The player dismissing the sheet is a cancel, not a failure worth falling back on.
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return copyViaSelection(text) ? 'copied' : 'failed';
  }
}

/** Last-resort clipboard path for browsers without the async clipboard API. */
function copyViaSelection(text) {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
  document.body.appendChild(field);
  field.select();

  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  field.remove();
  return ok;
}
