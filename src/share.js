// Sharing a result.
//
// buildShareText is PURE and spoiler-free by construction: it emits one tier-colored
// square per solved set, in solve order, and never touches a board word. A shared result
// should make someone want to play the puzzle, not tell them the answers.
//
// share() is the impure half — navigator.share, falling back to the clipboard.

import { difficultyToTier } from './engine/tiers.js';

const SQUARE = {
  green: '🟩',
  yellow: '🟨',
  red: '🟥',
  black: '⬛'
};

/** e.g. "ASTO — First Light\n4/4 · 2 beans\n🟩🟨🟥⬛" */
export function buildShareText(state) {
  const solved = state.solvedSetIds.map((id) => {
    const set = state.puzzle.sets.find((s) => s.id === id);
    return SQUARE[difficultyToTier(set.difficulty)];
  });

  const lines = [
    `ASTO — ${state.puzzle.title}`,
    `${solved.length}/${state.puzzle.sets.length} · ${beans(state.mistakes)}`
  ];
  if (solved.length > 0) lines.push(solved.join(''));
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
