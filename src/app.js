// Bootstrap: load the puzzle through the source seam, build the views, wire the
// controller, start. Screen routing stays trivial until the select screen (Phase 5).

import { GameController } from './controller/game-controller.js';
import { LocalJsonSource } from './source/local-json-source.js';
import { BoardView } from './view/board-view.js';
import { ControlsView } from './view/controls-view.js';
import { FrameView } from './view/frame-view.js';
import { HeaderView } from './view/header-view.js';
import { SolvedSetsView } from './view/solved-sets-view.js';
import { StatusView } from './view/status-view.js';

const PUZZLE_PATH = 'puzzles/first-light.json';

async function main() {
  const source = new LocalJsonSource();
  const puzzle = await source.loadPuzzle(PUZZLE_PATH);

  // Views receive their intent callbacks bound to a controller that doesn't exist yet,
  // so wire them through a late-bound reference.
  let controller;

  const views = [
    new HeaderView(document.getElementById('header')),
    new StatusView(document.getElementById('status')),
    new FrameView(document.getElementById('frame'), {
      onSlotTap: (index) => controller.slotTapped(index),
      onReorder: (from, to) => controller.reorderRequested(from, to)
    }),
    new BoardView(document.getElementById('board'), {
      onTileTap: (term) => controller.tileTapped(term)
    }),
    new ControlsView(document.getElementById('controls'), {
      onConfirm: () => controller.confirmPressed(),
      onClear: () => controller.clearPressed(),
      onShuffle: () => controller.shufflePressed()
    }),
    new SolvedSetsView(document.getElementById('solved-sets'))
  ];

  controller = new GameController(puzzle, views);
  controller.start();
}

main().catch((error) => {
  console.error(error);
  document.getElementById('screen-play').hidden = true;
  const errorScreen = document.getElementById('screen-error');
  errorScreen.hidden = false;
  document.getElementById('error-message').textContent = error.message;
});
