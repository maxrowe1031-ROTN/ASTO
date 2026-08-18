// Watches finished games and writes the result to storage.
//
// It is pushed into the controller's `views` array, alongside ScreenRouter — which is
// already a non-view living there for the same reason: `update(state)` is the one hook the
// controller offers, and a thing that only ever READS state cannot break the boundary law.
// It calls no engine function and mutates nothing.
//
// Why a module rather than a closure in app.js: this is the only piece of the select
// screen that decides anything, and as a module it is unit-tested headlessly against a
// fake storage. app.js stays wiring.

export class ResultsRecorder {
  /**
   * @param {object} storage       anything with recordResult(slug, result) and appendHistory(entry)
   * @param {() => string|null} currentSlug  which board is on screen; null for the tutorial
   * @param {() => string} todayKey  what day it is in the game's one timezone (D-24)
   */
  constructor(storage, currentSlug, todayKey) {
    this.storage = storage;
    this.currentSlug = currentSlug;
    this.todayKey = todayKey;
    this.recordedFor = null;
  }

  update(state) {
    if (state.status === 'playing') {
      // A new game on the same board must be recordable again — restart() and
      // loadPuzzle() both come back through here as `playing` first.
      this.recordedFor = null;
      return;
    }

    // The controller re-renders a finished game whenever anything repaints, so the guard
    // is on the STATE OBJECT, not the status: the same finished game records once.
    if (this.recordedFor === state) return;
    this.recordedFor = state;

    // The tutorial has no slug and no row on the select screen. It also cannot be lost,
    // so a result for it would be a badge for showing up.
    const slug = this.currentSlug();
    if (!slug) return;

    const result = {
      status: state.status,
      mistakes: state.mistakes,
      solvedCount: state.solvedSetIds.length,
      // ?? 0: a state from before hints existed still records a truthful zero.
      hintsUsed: state.hintsUsed ?? 0
    };
    this.storage.recordResult(slug, result);
    // The best-result write above keeps the cups honest; this row keeps the
    // record. Every finish appends — replays included — because a statistics
    // page counts plays, not bests (D-24).
    this.storage.appendHistory({ slug, dateKey: this.todayKey(), ...result });
  }
}
