// Counts plays: one `start` when a board comes on screen, one `finish` when it ends (D-34).
//
// A non-view in the controller's `views` array, exactly like ResultsRecorder: update(state)
// is the one hook the controller offers, and a thing that only READS state cannot break
// the boundary law. It calls no engine function and mutates nothing. It sits AFTER the
// recorder, so a finish is only ever reported for a game already saved locally.
//
// The sends go through the ratings seam (src/ratings.js), which owns the network and
// swallows every failure — a counter that can break a board is worse than no counter.

export class PlayReporter {
  /**
   * @param {{ sendPlay(row): any }} seam  the Ratings instance (or anything shaped like it)
   * @param {() => string|null} currentSlug  which board is on screen; null for the tutorial
   */
  constructor(seam, currentSlug) {
    this.seam = seam;
    this.currentSlug = currentSlug;
    this.startedPuzzle = null; // the puzzle object whose current game has a start on record
    this.finishedFor = null; // the finished state object already reported
  }

  update(state) {
    if (state.status === 'playing') {
      // A start is owed when a new board arrives, or when the same board comes back to
      // `playing` after a finish (restart). Every state object is fresh, so identity of
      // the PUZZLE is the thing that survives a game, and the finish guard tells restart
      // from an ordinary repaint mid-game.
      const newBoard = state.puzzle !== this.startedPuzzle;
      const restarted = this.finishedFor !== null;
      if (newBoard || restarted) {
        this.startedPuzzle = state.puzzle;
        this.finishedFor = null;
        this.send({ event: 'start' });
      }
      return;
    }

    // The controller re-renders a finished game whenever anything repaints, so the guard
    // is on the STATE OBJECT, not the status: the same finished game reports once.
    if (this.finishedFor === state) return;
    this.finishedFor = state;
    // A board that arrives already finished (a reload onto an end screen) owes no start.
    this.startedPuzzle = state.puzzle;

    // Learning Mode (D-33): marked only when help was actually USED.
    const learning = Boolean(state.rules?.learningMode) && (state.vocabRevealed?.length ?? 0) > 0;
    this.send({
      event: 'finish',
      won: state.status === 'won',
      mistakes: state.mistakes,
      hintsUsed: state.hintsUsed ?? 0,
      learning
    });
  }

  send(row) {
    const slug = this.currentSlug();
    if (!slug) return;
    this.seam.sendPlay({ slug, ...row });
  }
}
