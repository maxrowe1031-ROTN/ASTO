// The GameController — the ONLY module that calls engine functions.
//
// It holds the current (frozen) state reference, translates view intents into engine
// calls, and hands the new state to every view. It owns no game logic: whether a tap
// registers, what a submission costs, when the game ends — the engine already decided
// all of that, and the views just draw it.
//
// Randomness enters the game here and only here: shuffle(state, this.rand).

import {
  clearSelection,
  deselect,
  initGame,
  reorderSelected,
  select,
  shuffle,
  submit
} from '../engine/engine.js';

export class GameController {
  /**
   * @param {object} puzzle   validated puzzle (schema v1.0)
   * @param {object[]} views  anything with update(state, outcome?)
   * @param {object} [options] { rules, rand } — rand defaults to Math.random
   */
  constructor(puzzle, views, { rules = {}, rand = Math.random } = {}) {
    this.views = views;
    this.rand = rand;
    this.state = initGame(puzzle, rules);
  }

  /** Shuffle the fresh board and render — the entry point app.js calls. */
  start() {
    this.state = shuffle(this.state, this.rand);
    this.render();
  }

  // --- intents (wired to view callbacks) ---

  tileTapped(term) {
    // A tap on a selected tile means "take it back"; otherwise it's a select. The
    // engine ignores anything invalid (5th tap, off-board term, game over).
    this.state = this.state.selectedTerms.includes(term)
      ? deselect(this.state, term)
      : select(this.state, term);
    this.render();
  }

  slotTapped(index) {
    const term = this.state.selectedTerms[index];
    if (term === undefined) return;
    this.state = deselect(this.state, term);
    this.render();
  }

  reorderRequested(from, to) {
    this.state = reorderSelected(this.state, from, to);
    this.render();
  }

  confirmPressed() {
    const { state, outcome } = submit(this.state, this.state.selectedTerms);
    this.state = state;
    this.render(outcome);
  }

  clearPressed() {
    this.state = clearSelection(this.state);
    this.render();
  }

  shufflePressed() {
    this.state = shuffle(this.state, this.rand);
    this.render();
  }

  // --- output ---

  render(outcome) {
    for (const view of this.views) {
      view.update(this.state, outcome);
    }
  }
}
