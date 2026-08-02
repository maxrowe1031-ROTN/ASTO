// Bootstrap: load the puzzle through the source seam, build the views, wire the
// controller, start. Screen routing stays trivial until the select screen (Phase 5).

import { GameController } from './controller/game-controller.js';
import { buildShareText, share } from './share.js';
import { LocalJsonSource } from './source/local-json-source.js';
import { BoardView } from './view/board-view.js';
import { ControlsView } from './view/controls-view.js';
import { EndView } from './view/end-view.js';
import { FrameView } from './view/frame-view.js';
import { HeaderView } from './view/header-view.js';
import { SolvedSetsView } from './view/solved-sets-view.js';
import { StatusView } from './view/status-view.js';

const PUZZLE_PATH = 'puzzles/first-light.json';

async function main() {
  const source = new LocalJsonSource();
  const puzzle = await source.loadPuzzle(PUZZLE_PATH);

  // Views receive intent callbacks bound to a controller that doesn't exist yet, so wire
  // them through a late-bound reference.
  let controller;

  const endView = new EndView(document.getElementById('screen-end'), {
    onShare: async () => {
      endView.showShareResult(await share(buildShareText(controller.state)));
    },
    onPlayAgain: () => controller.restart()
  });

  // Order matters: the controller awaits each view in turn, so the solve beat plays out
  // frame → board → card, and the screen only swaps once the motion has finished.
  const views = [
    new HeaderView(document.getElementById('header')),
    new ControlsView(document.getElementById('controls'), {
      onConfirm: () => controller.confirmPressed(),
      onClear: () => controller.clearPressed(),
      onShuffle: () => controller.shufflePressed()
    }),
    new StatusView(document.getElementById('status')),
    new FrameView(document.getElementById('frame'), {
      onSlotTap: (index) => controller.slotTapped(index),
      onReorder: (from, to) => controller.reorderRequested(from, to)
    }),
    new BoardView(document.getElementById('board'), {
      onTileTap: (term) => controller.tileTapped(term)
    }),
    new SolvedSetsView(document.getElementById('solved-sets')),
    // The router runs BEFORE the end view so the end screen is already on-screen when its
    // cards settle in — animating a hidden section just throws the motion away.
    new ScreenRouter(),
    endView
  ];

  controller = new GameController(puzzle, views);
  controller.start();
}

/** Shows the play screen while playing, the end screen once the game is over. */
class ScreenRouter {
  constructor() {
    this.play = document.getElementById('screen-play');
    this.end = document.getElementById('screen-end');
  }

  update(state) {
    const over = state.status !== 'playing';
    this.play.hidden = over;
    this.end.hidden = !over;
    if (over) globalThis.scrollTo?.({ top: 0 });
  }
}

main().catch((error) => {
  console.error(error);
  document.getElementById('screen-play').hidden = true;
  const errorScreen = document.getElementById('screen-error');
  errorScreen.hidden = false;
  document.getElementById('error-message').textContent = error.message;
});
