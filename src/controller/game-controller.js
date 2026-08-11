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
  hint,
  initGame,
  reorderSelected,
  revealVocab,
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
    this.rules = rules;
    this.state = initGame(puzzle, rules);
    this.queue = Promise.resolve();
  }

  /** Shuffle the fresh board and render — the entry point app.js calls. */
  start() {
    this.state = shuffle(this.state, this.rand);
    this.render();
  }

  /** Play the same puzzle again from scratch, freshly shuffled. */
  restart() {
    this.state = initGame(this.state.puzzle, this.rules);
    this.start();
  }

  /**
   * Swap in a different board — how the tutorial hands off to a real puzzle, and how the
   * title screen starts one.
   *
   * The rules change with the board (the tutorial runs `maxMistakes: Infinity`), so they
   * are replaced wholesale rather than merged; a leftover rule from the previous game is
   * exactly the kind of bug that only shows up three screens later.
   *
   * Every view absorbs this without special-casing: the board treats all sixteen old
   * words as departing tiles, the solved-set list clears on an empty solvedSetIds, and
   * the header rebuilds its pips when the bean count changes.
   */
  loadPuzzle(puzzle, rules = {}) {
    this.rules = rules;
    this.state = initGame(puzzle, rules);
    this.start();
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

  hintPressed() {
    const { state, outcome } = hint(this.state, this.rand);
    this.state = state;
    this.render(outcome);
  }

  vocabPressed() {
    const { state, outcome } = revealVocab(this.state);
    this.state = state;
    this.render(outcome);
  }

  // --- output ---

  /**
   * Update every view, in order, awaiting any that animate.
   *
   * The sequencing the GDD asks for on a solve — frame settles into canonical order, the
   * board closes around the departing tiles, then the card arrives — falls out of view
   * ORDER rather than any timing code here. A view that doesn't animate returns
   * undefined and the await passes straight through.
   *
   * Renders are SERIALIZED. Since a render can now await animation, a fast second tap
   * would otherwise start a concurrent pass and let two loops paint interleaved state.
   * Each queued pass reads `this.state` when it actually runs, so it always paints the
   * latest truth rather than a snapshot from when it was queued.
   */
  render(outcome) {
    this.queue = this.queue
      .then(() => this.paint(outcome))
      .catch((error) => console.error('render failed', error));
    return this.queue;
  }

  async paint(outcome) {
    for (const view of this.views) {
      await view.update(this.state, outcome);
    }
  }
}
