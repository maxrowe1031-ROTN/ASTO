// The result icons: the vocabulary the calendar and the statistics screen both
// speak, so there is one set of paths rather than two that drift apart.
//
// D-16's addendum is the whole grammar of this file: the POSE says how a board
// ENDED (steaming cup won, spilled cup lost, pot not yet played), and the COLOUR
// says how it was PLAYED — white for a clean board, brown for one where the
// player took the hint. The colour lives in components.css, keyed off the
// `is-hinted` class the caller adds; these constants are pose only.
//
// Extracted from calendar-view.js when the statistics screen needed the same
// four cups (2026-08-18). They reached calendar-view from the retired
// select-view before that; their design history lives in the git record of both.

// A PAPER cup, not a mug — a mug on its side reads as a handbag at this size —
// and the spilled pose is the same two paths rotated over a puddle. Steam is
// static: the GDD's no-list bans ambient motion.
const PAPER_CUP = `
  <path class="cup-body" d="M7.4 8 H16.6 L14.9 18.8 A1.2 1.2 0 0 1 13.7 19.9 H10.3 A1.2 1.2 0 0 1 9.1 18.8 Z"/>
  <rect class="cup-rim" x="6.5" y="6.8" width="11" height="2.3" rx="1.15"/>`;

export const CUP_STEAMING = `
  <svg class="result-cup" viewBox="0 0 24 24" aria-hidden="true">
    <g class="cup-steam">
      <path d="M9 5.2 c1.4-1 -1.4-2.2 0-3.2"/>
      <path d="M12 5 c1.4-1.1 -1.4-2.4 0-3.5"/>
      <path d="M15 5.2 c1.4-1 -1.4-2.2 0-3.2"/>
    </g>
    ${PAPER_CUP}
  </svg>`;

export const CUP_SPILLED = `
  <svg class="result-cup" viewBox="0 0 24 24" aria-hidden="true">
    <ellipse class="cup-spill" cx="14.4" cy="20.4" rx="7.4" ry="1.8"/>
    <g transform="translate(-0.6 -1.2) rotate(105 12 13.3)">${PAPER_CUP}</g>
  </svg>`;

// A POT OF COFFEE for a board not yet played (Max's call at review, drawn to
// his reference): the diner carafe — round glass belly, coffee sitting in the
// bottom half, flat tilted lid with a pour spout at the left, and a solid
// D-handle on the right. The coffee fill is what keeps it apart from the white
// cups at grid size: an unplayed day reads as a full pot waiting to be poured.
// Iterated live against the alternatives (tapered pot, arc handle, level lid);
// this one read as "coffee pot" at both 18px and 64px.
export const POT = `
  <svg class="result-cup" viewBox="0 0 24 24" aria-hidden="true">
    <path class="pot-handle" d="M17 9 C21.2 9.2 21.4 14.8 17.6 15.6 L17.2 13.9 C19.4 13.3 19.3 10.7 16.7 10.7 Z"/>
    <path class="pot-glass" d="M7.9 7.8 C5.4 9.3 4.2 11.9 4.3 14.2 C4.5 17.7 7.3 20 11.3 20 C15.3 20 18.1 17.7 18.3 14.2 C18.4 11.9 17.2 9.3 14.7 7.8 Z"/>
    <path class="pot-coffee" d="M5 13.8 H17.6 C17.3 16.9 14.8 19.4 11.3 19.4 C7.8 19.4 5.3 16.9 5 13.8 Z"/>
    <path class="pot-lid" d="M8.2 5.2 L15 4.2 L15.3 6.6 L8.5 7.6 Z"/>
    <path class="pot-lid" d="M8.2 5.2 L6.5 6.2 L8.5 7.6 Z"/>
  </svg>`;

/** The icon for a day's state: pot waiting, cup steaming, or cup spilled. */
export const iconFor = (result) =>
  result === null ? POT : result.status === 'won' ? CUP_STEAMING : CUP_SPILLED;

