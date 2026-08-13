// The first-run coach card. READ-ONLY — it renders whatever tutorial-script.js derives
// and emits the skip intent. It decides nothing: the copy, the sequence, and when
// the coaching is finished all live in the pure script, which is why they are testable.
//
// Importing a pure derivation is the same move SolvedSetsView makes with difficultyToTier
// — never an engine mutator.
//
// It is deliberately NON-BLOCKING: no scrim, no spotlight, no cut-out. The card sits
// between the board and the controls and never covers a tile, so it cannot swallow the
// tap it is asking the player to make. (Appendix D lists the Screen 0 wireframe as
// pending, so this is a Phase 4 design decision, not a spec being followed.)
//
// The entrance animation is fired and NOT awaited: the card is ambient narration, not a
// beat in the solve sequence, and the `done` step appears mid-solve — awaiting it there
// would stall the board closing behind it.

import { tutorialStep } from '../controller/tutorial-script.js';
import { settleIn } from './motion.js';

export class TutorialOverlay {
  // No Continue pill, deliberately (D-20 second addendum): a pill in the coach card sat
  // one row above Confirm and read as part of the game. The tutorial plays out to the
  // end — the end screen is the way out — and "Skip tutorial" is the one early exit, a
  // text link so it can never be mistaken for a game control.
  constructor(root, { onSkip, onCoached }) {
    root.innerHTML = `
      <p class="coach-body"></p>
      <p class="coach-note" hidden></p>
      <div class="coach-actions">
        <button class="text-action coach-action" data-action="skip">Skip tutorial</button>
      </div>`;

    this.root = root;
    this.bodyEl = root.querySelector('.coach-body');
    this.noteEl = root.querySelector('.coach-note');
    this.skipEl = root.querySelector('[data-action="skip"]');
    this.onCoached = onCoached;

    this.skipEl.addEventListener('click', onSkip);

    this.active = false;
    this.shownId = null;
    this.shownKey = null;
    this.coachedFired = false;
    this.root.hidden = true;
  }

  /**
   * Whether this game is the tutorial. app.js owns that fact — it is the module that
   * chose which board to load — so the coach is told rather than sniffing the puzzle id
   * or reading `maxMistakes` and guessing.
   */
  setActive(active) {
    this.active = active;
    this.shownId = null;
    this.shownKey = null;
    this.coachedFired = false;
    if (!active) this.root.hidden = true;
  }

  update(state, outcome) {
    if (!this.active) return;

    const step = tutorialStep(state, outcome);
    if (!step) {
      this.root.hidden = true;
      this.shownId = null;
      this.shownKey = null;
      return;
    }

    // Fires once: the player has been through the whole of the coaching, so the tutorial
    // counts as seen even if they wander off without pressing anything.
    if (step.coached && !this.coachedFired) {
      this.coachedFired = true;
      this.onCoached?.();
    }

    // A submission always gets a visible reply, even when the wording is unchanged. Two
    // cross-paired guesses in a row earn the same diagnosis, and a card that sits
    // perfectly still after you pressed Confirm reads as broken rather than as agreeing.
    const answered = outcome !== undefined && outcome.type !== 'invalid';

    // Otherwise, only re-animate when something actually changed. The key includes the
    // note so a second wrong answer of the same shape still drops the first-time
    // reassurance instead of leaving it stranded on screen.
    const key = `${step.id}|${step.note ?? ''}`;
    if (key === this.shownKey && !answered) return;
    this.shownId = step.id;
    this.shownKey = key;

    this.bodyEl.textContent = step.body;
    this.noteEl.textContent = step.note ?? '';
    this.noteEl.hidden = !step.note;
    this.root.hidden = false;
    settleIn(this.root);
  }
}
