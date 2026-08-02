// Bootstrap: decide where a player lands, load boards through the source seam, build the
// views once, and drive them all with a single controller.
//
// Routing (Phase 4):
//   first launch  → the tutorial board, forced (GDD §5.2)
//   any later run → the title screen → Play or How to play
// Boards are swapped on ONE controller and ONE set of views via controller.loadPuzzle,
// so nothing is torn down and rebuilt between the tutorial and the real puzzle.

import { GameController } from './controller/game-controller.js';
import { TUTORIAL_RULES } from './controller/tutorial-script.js';
import { buildShareText, share } from './share.js';
import { LocalJsonSource } from './source/local-json-source.js';
import { Storage } from './storage.js';
import { BoardView } from './view/board-view.js';
import { ControlsView } from './view/controls-view.js';
import { EndView } from './view/end-view.js';
import { FrameView } from './view/frame-view.js';
import { HeaderView } from './view/header-view.js';
import { SolvedSetsView } from './view/solved-sets-view.js';
import { StatusView } from './view/status-view.js';
import { TitleView } from './view/title-view.js';
import { TutorialOverlay } from './view/tutorial-overlay.js';

const TUTORIAL_PATH = 'puzzles/tutorial.json';
const PUZZLE_PATH = 'puzzles/first-light.json';

async function main() {
  const source = new LocalJsonSource();
  const storage = new Storage();
  const router = new ScreenRouter();
  const boards = new Map(); // path → puzzle; a re-run of the tutorial refetches nothing

  // Views receive intent callbacks bound to a controller that doesn't exist yet, so wire
  // them through a late-bound reference.
  let controller;

  const loadBoard = async (path) => {
    if (!boards.has(path)) boards.set(path, await source.loadPuzzle(path));
    return boards.get(path);
  };

  /**
   * Is that board still mid-game? Finished boards do not count: after a win or a loss,
   * Play means "again", not "show me the end screen I already read".
   */
  const stillPlaying = (puzzleId) =>
    controller?.state.status === 'playing' && controller.state.puzzle.id === puzzleId;

  /** The one way a game starts, whichever door the player came through. */
  const startGame = async (path, rules, coaching) => {
    const puzzle = await loadBoard(path);
    coach.setActive(coaching);
    router.show('game');

    // Coming back to a board that is still in play RESUMES it. Visiting the title screen
    // is navigation, not forfeiting — the controller has held the state the whole time,
    // and the wordmark sits in the top-left corner where it is easy to hit by accident.
    // Reloading here would throw away solved sets for nothing.
    if (stillPlaying(puzzle.id)) {
      controller.render(); // repaint: the screen was hidden, not torn down
      return;
    }

    if (controller) controller.loadPuzzle(puzzle, rules);
    else {
      controller = new GameController(puzzle, views, { rules });
      controller.start();
    }
  };

  const leaveTutorial = () => {
    storage.markTutorialSeen();
    return startGame(PUZZLE_PATH, {}, false).catch(fail);
  };

  new TitleView(document.getElementById('screen-title'), {
    onPlay: () => startGame(PUZZLE_PATH, {}, false).catch(fail),
    onTutorial: () => startGame(TUTORIAL_PATH, TUTORIAL_RULES, true).catch(fail)
  });

  const coach = new TutorialOverlay(document.getElementById('tutorial-coach'), {
    onSkip: leaveTutorial,
    onContinue: leaveTutorial,
    // Reaching the last coach-mark is what "seen" means — not merely opening the board.
    // Recorded here so a player who wanders off mid-screen isn't taught twice.
    onCoached: () => storage.markTutorialSeen()
  });

  const endView = new EndView(document.getElementById('screen-end'), {
    onShare: async () => {
      endView.showShareResult(await share(buildShareText(controller.state)));
    },
    onPlayAgain: () => controller.restart(),
    onBackToTitle: () => router.show('title')
  });

  // Order matters: the controller awaits each view in turn, so the solve beat plays out
  // frame → board → card, and the screen only swaps once the motion has finished.
  const views = [
    new HeaderView(document.getElementById('header'), {
      onHome: () => router.show('title')
    }),
    new ControlsView(document.getElementById('controls'), {
      onConfirm: () => controller.confirmPressed(),
      onClear: () => controller.clearPressed(),
      onShuffle: () => controller.shufflePressed()
    }),
    new StatusView(document.getElementById('status')),
    // The coach speaks in the same breath as the status strip, and BEFORE the two views
    // that animate. The controller awaits each view in turn, so anything placed after the
    // frame and board waits out both of their shakes — measured at ~900ms, which reads as
    // the tutorial box ignoring you while "So close!" is already on screen.
    coach,
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
    router,
    endView
  ];

  if (storage.hasSeenTutorial()) router.show('title');
  else await startGame(TUTORIAL_PATH, TUTORIAL_RULES, true);
}

/**
 * Title, play, or end. The route is the player's choice of door; within a game, the
 * status decides play versus end — so both inputs are kept and repainted together rather
 * than each fighting the other's `hidden` flags.
 */
class ScreenRouter {
  constructor() {
    this.sections = {
      title: document.getElementById('screen-title'),
      play: document.getElementById('screen-play'),
      end: document.getElementById('screen-end')
    };
    this.route = 'title';
    this.state = null;
  }

  show(route) {
    this.route = route;
    this.paint();
  }

  /** The standard view hook — the controller calls this like any other view. */
  update(state) {
    this.state = state;
    this.paint();
  }

  paint() {
    const over = this.state !== null && this.state.status !== 'playing';
    const showing = this.route === 'title' ? 'title' : over ? 'end' : 'play';

    for (const [name, section] of Object.entries(this.sections)) {
      section.hidden = name !== showing;
    }
    if (showing !== 'play') globalThis.scrollTo?.({ top: 0 });
  }
}

/** Last resort: a board that will not load leaves nothing playable, so say so plainly. */
function fail(error) {
  console.error(error);
  for (const section of document.querySelectorAll('.screen')) section.hidden = true;
  document.getElementById('screen-error').hidden = false;
  document.getElementById('error-message').textContent = error.message;
}

main().catch(fail);
