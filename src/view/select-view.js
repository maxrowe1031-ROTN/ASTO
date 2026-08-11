// The puzzle select screen — GDD Screen 6. READ-ONLY: it renders the list and emits a
// pick, and knows nothing about how a board loads or what a result means.
//
// Like TitleView it is not state-driven and has no update(state): it is a door, shown
// before a game exists. app.js hands it the manifest and the saved results and it draws
// them; that is the whole contract.
//
// A played row carries the four tier dots from the wireframe — filled for a solved set,
// hollow for one that got away. They do double duty: on a win all four are lit, and on a
// loss the row shows how far the player got without spending a word on it. Tier colours
// are the SET colours the end screen already uses; the mistake vocabulary is still beans,
// and beans are still never red.
//
// How the board went is a coffee cup rather than words, because coffee is already this
// game's whole vocabulary for it: mistakes are beans, and a loss is "Out of beans". The
// cost is that a cup cannot say HOW MANY mistakes, so the list no longer distinguishes a
// clean solve from a scrappy one — a deliberate trade for a calmer row (design.md D-10).
// The count is not lost to assistive tech: the row's aria-label still says the sentence.

import { settleIn, staggerStep } from './motion.js';

const TIERS = ['green', 'yellow', 'red', 'black'];

// Inline SVG constants, following BEAN_SVG in header-view.js: the glyph is aria-hidden
// (the row already carries the sentence), and every colour comes from a class against a
// token — never a hex here.
//
// Steam is static by choice: the GDD's no-list bans particles and pins motion at
// 120–180ms, and a looping drift across nine rows is ambient motion nothing else in the
// game does.
//
// A PAPER cup, not a mug, and the handle is the reason. A mug tipped on its side puts its
// handle over a rounded body and renders as a HANDBAG at this size — tried, and it needed
// three rounds of geometry to almost escape. A takeaway cup has no handle to misread: it
// is an overhanging rim on a tapered cone, and the rim is what tells you which end is
// open, upright or on its side.
//
// So both states are literally the SAME two paths — the spilled one is that cup rotated
// over a puddle. Same size, same colour, one object in two poses.
// The body starts UNDER the rim rather than below it. A hairline gap is invisible upright
// but, once the cup is on its side, the rim reads as a detached stick beside the cone.
const PAPER_CUP = `
  <path class="cup-body" d="M7.4 8 H16.6 L14.9 18.8 A1.2 1.2 0 0 1 13.7 19.9 H10.3 A1.2 1.2 0 0 1 9.1 18.8 Z"/>
  <rect class="cup-rim" x="6.5" y="6.8" width="11" height="2.3" rx="1.15"/>`;

const CUP_STEAMING = `
  <svg class="result-cup" viewBox="0 0 24 24" aria-hidden="true">
    <g class="cup-steam">
      <path d="M9 5.2 c1.4-1 -1.4-2.2 0-3.2"/>
      <path d="M12 5 c1.4-1.1 -1.4-2.4 0-3.5"/>
      <path d="M15 5.2 c1.4-1 -1.4-2.2 0-3.2"/>
    </g>
    ${PAPER_CUP}
  </svg>`;

// Knocked over, base up-left, rim down-right with the coffee run out of it. 105° is just
// past lying flat, so the rim clears the puddle instead of floating above it.
const CUP_SPILLED = `
  <svg class="result-cup" viewBox="0 0 24 24" aria-hidden="true">
    <ellipse class="cup-spill" cx="14.4" cy="20.4" rx="7.4" ry="1.8"/>
    <g transform="translate(-0.6 -1.2) rotate(105 12 13.3)">${PAPER_CUP}</g>
  </svg>`;

export class SelectView {
  constructor(root, { onPick, onBack }) {
    root.innerHTML = `
      <div class="select-head">
        <h1>
          <button class="wordmark" data-action="home"
                  aria-label="ASTO — back to the title screen">ASTO</button>
        </h1>
        <p class="select-count">Puzzles</p>
      </div>
      <div class="puzzle-list"></div>
      <button class="text-action" data-action="back-to-title">Back</button>`;

    this.listEl = root.querySelector('.puzzle-list');
    this.onPick = onPick;

    // Both doors home. The wordmark because every site has trained players that a logo in
    // the top-left goes back — the same intent HeaderView emits from the play screen — and
    // the text action because a list wants a visible way out at the bottom of a scroll.
    root.querySelector('[data-action="home"]').addEventListener('click', onBack);
    root.querySelector('[data-action="back-to-title"]').addEventListener('click', onBack);

    // One delegated listener rather than one per row: the list is rebuilt every time the
    // screen is shown, and re-binding nine handlers each time is how listeners leak.
    this.listEl.addEventListener('click', (event) => {
      const row = event.target.closest('.puzzle-row');
      if (row) this.onPick(row.dataset.slug);
    });
  }

  /**
   * @param {{slug: string, title: string}[]} puzzles  manifest order — the play order
   * @param {object} results  { slug: {status, mistakes, solvedCount} }, from storage
   */
  render(puzzles, results) {
    this.listEl.innerHTML = '';
    puzzles.forEach((puzzle, i) => {
      const row = buildRow(puzzle, results[puzzle.slug] ?? null);
      this.listEl.appendChild(row);
      settleIn(row, i * staggerStep());
    });
  }
}

function buildRow(puzzle, result) {
  const row = document.createElement('button');
  row.className = 'puzzle-row';
  row.dataset.slug = puzzle.slug;
  if (result) row.dataset.played = result.status;

  const title = document.createElement('span');
  title.className = 'puzzle-row-title';
  title.textContent = puzzle.title;

  const status = document.createElement('span');
  status.className = 'puzzle-row-status';

  if (result) {
    status.appendChild(buildDots(result.solvedCount));

    const cup = document.createElement('span');
    cup.className = 'result-cup-slot';
    // Colour says HOW the board went the way the pose says how it ended: white is a
    // clean board, brown means the player took the hint — "needed a coffee" (D-16
    // addendum). Results saved before hints existed have no field and read clean.
    if ((result.hintsUsed ?? 0) > 0) cup.classList.add('is-hinted');
    cup.innerHTML = result.status === 'won' ? CUP_STEAMING : CUP_SPILLED;
    status.appendChild(cup);
  } else {
    // The wireframe's chevron. Decorative — the row is a button and already reads as one.
    status.className = 'puzzle-row-status is-unplayed';
    status.textContent = '›';
    status.setAttribute('aria-hidden', 'true');
  }

  row.append(title, status);
  // The visible row is a title and some dots; a screen reader gets the sentence.
  row.setAttribute('aria-label', `${puzzle.title}. ${spokenResult(result)}`);
  return row;
}

/** Four dots in tier order, lit up to the number of sets the player actually solved. */
function buildDots(solvedCount) {
  const dots = document.createElement('span');
  dots.className = 'tier-dots';
  TIERS.forEach((tier, i) => {
    const dot = document.createElement('span');
    dot.className = 'tier-dot';
    dot.dataset.tier = tier;
    // Difficulty 1–4 maps to the same four tiers the solved cards use; a set that was
    // never solved leaves its dot hollow.
    if (i < solvedCount) dot.dataset.solved = 'true';
    dots.appendChild(dot);
  });
  return dots;
}

/** The cup says won-or-lost; this is where the detail the cup dropped still lives. */
function spokenResult(result) {
  if (!result) return 'Not played yet.';
  // The cup's colour axis, spoken: the visual drops the words, the sentence keeps them.
  const hinted = (result.hintsUsed ?? 0) > 0 ? ' A hint was used.' : '';
  if (result.status !== 'won') return `Lost, ${result.solvedCount} of 4 sets solved.${hinted}`;
  const base = result.mistakes === 0
    ? 'Solved with no mistakes.'
    : `Solved with ${result.mistakes} mistake${result.mistakes === 1 ? '' : 's'}.`;
  return `${base}${hinted}`;
}

/**
 * The next board worth handing someone: the first in play order they have not yet won,
 * skipping the one they just finished. Null when there is nothing left — the caller turns
 * that into "Back to puzzles".
 *
 * A LOST board still counts as unfinished, which is the point: losing is how you find the
 * board you want another go at.
 *
 * Lives here beside the view because it is the same question the list answers — which
 * board is next — and it is a pure function of the manifest and the results, so it is
 * tested without a DOM.
 */
export function nextUnfinished(puzzles, results, afterSlug = null) {
  const unfinished = puzzles.filter((puzzle) => results[puzzle.slug]?.status !== 'won');
  if (unfinished.length === 0) return null;

  // Prefer something after the board just played, so a session moves forward through the
  // list rather than bouncing back to the top on every win.
  const at = puzzles.findIndex((puzzle) => puzzle.slug === afterSlug);
  const ahead = at === -1 ? [] : unfinished.filter((p) => puzzles.indexOf(p) > at);

  const next = (ahead.length > 0 ? ahead : unfinished).find((p) => p.slug !== afterSlug);
  return next ?? null;
}
