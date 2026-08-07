// Bootstrap: decide where a player lands, load boards through the source seam, build the
// views once, and drive them all with a single controller.
//
// Routing (Phase 5):
//   first launch     → the tutorial board, forced (GDD §5.2)
//   ?puzzle=<slug>   → straight into that board, however the player arrived
//   any later run    → the title screen → Play (the puzzle list) or How to play
// Boards are swapped on ONE controller and ONE set of views via controller.loadPuzzle,
// so nothing is torn down and rebuilt between the tutorial and the real puzzle.

import { ResultsRecorder } from './results-recorder.js';
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
import { nextUnfinished, SelectView } from './view/select-view.js';
import { SolvedSetsView } from './view/solved-sets-view.js';
import { StatusView } from './view/status-view.js';
import { TitleView } from './view/title-view.js';
import { TutorialOverlay } from './view/tutorial-overlay.js';

const MANIFEST_PATH = 'puzzles/index.json';
const TUTORIAL_SLUG = 'tutorial';
const TUTORIAL_PATH = `puzzles/${TUTORIAL_SLUG}.json`;
const DEFAULT_PUZZLE = 'first-light';

// The slug is matched against the same pattern the publisher and the manifest validator
// enforce, so a crafted query string cannot reach outside puzzles/.
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

const pathFor = (slug) => `puzzles/${slug}.json`;

/** `?puzzle=<slug>`, when it is one — a deep link into a specific board. */
function requestedSlug() {
  const slug = new URLSearchParams(globalThis.location?.search ?? '').get('puzzle');
  return slug && SLUG.test(slug) ? slug : null;
}

async function main() {
  // Read before anything can rewrite the URL — the tutorial clears `?puzzle=` while it is
  // up, and a first-time player who followed a link to a specific board should still be
  // handed that board when the tutorial lets go of them.
  const deepLink = requestedSlug();

  const source = new LocalJsonSource();
  const storage = new Storage();
  const router = new ScreenRouter();
  const boards = new Map(); // path → puzzle; a re-run of the tutorial refetches nothing

  // The list of boards, loaded once. A missing or broken manifest must not cost the player
  // the game — it costs them the select screen, and `?puzzle=` and the default board still
  // work. This is the only degrade-and-continue path in the bootstrap.
  let manifest = [];
  try {
    manifest = (await source.loadManifest(MANIFEST_PATH)).puzzles;
  } catch (error) {
    console.error('The puzzle list could not be loaded; falling back to a single board.', error);
  }

  // Which board is on screen. Null while the tutorial is up: it has no row on the select
  // screen and no saved result.
  let currentSlug = null;

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

  /**
   * The one way a game starts, whichever door the player came through.
   *
   * `slug` is null for the tutorial and a board slug for everything else — it is what the
   * results recorder saves under and what the URL carries, so it is set BEFORE the
   * controller can finish a game.
   */
  const startGame = async (slug, rules, coaching) => {
    const puzzle = await loadBoard(slug === null ? TUTORIAL_PATH : pathFor(slug));
    currentSlug = slug;
    rememberInUrl(slug);
    coach.setActive(coaching);
    endView.showNext(nextUnfinished(manifest, storage.allResults(), slug) !== null);
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

  const play = (slug) => startGame(slug, {}, false).catch(fail);

  const leaveTutorial = () => {
    storage.markTutorialSeen();
    return play(deepLink ?? DEFAULT_PUZZLE);
  };

  /** Show the list, always freshly painted — a result may have landed since last time. */
  const showSelect = () => {
    selectView.render(manifest, storage.allResults());
    router.show('select');
  };

  new TitleView(document.getElementById('screen-title'), {
    // With no manifest there is no list worth showing, so Play falls back to the board the
    // tutorial has always handed off to.
    onPlay: () => (manifest.length > 0 ? showSelect() : play(DEFAULT_PUZZLE)),
    onTutorial: () => startGame(null, TUTORIAL_RULES, true).catch(fail)
  });

  const selectView = new SelectView(document.getElementById('screen-select'), {
    onPick: play,
    onBack: () => router.show('title')
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
    // Read at TAP time, not render time: the result of the board just finished is already
    // saved by then, so a board won a moment ago is correctly skipped.
    onNextPuzzle: () => {
      const next = nextUnfinished(manifest, storage.allResults(), currentSlug);
      if (next) play(next.slug);
      else showSelect();
    },
    onBackToPuzzles: () => (manifest.length > 0 ? showSelect() : router.show('title'))
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
    // Not a view: a reader that saves the result of a finished game. It sits here for the
    // same reason the router does — update(state) is the hook the controller offers, and
    // something that only READS state cannot break the boundary law. Before the end view,
    // so the result is on disk by the time the end screen offers "Next puzzle".
    new ResultsRecorder(storage, () => currentSlug),
    // The router runs BEFORE the end view so the end screen is already on-screen when its
    // cards settle in — animating a hidden section just throws the motion away.
    router,
    endView
  ];

  // GDD §5.2: the first launch is the tutorial, and a deep link does not buy a way past
  // it — it decides what the tutorial hands off to instead.
  if (!storage.hasSeenTutorial()) await startGame(null, TUTORIAL_RULES, true);
  else if (deepLink) await startGame(deepLink, {}, false);
  else router.show('title');
}

/**
 * Keep `?puzzle=<slug>` pointing at the board on screen, so a reload comes back to it.
 *
 * replaceState, never pushState: this is bookkeeping, not navigation. Pushing would build
 * a history stack where Back means "the previous board" — a second, invisible router
 * competing with the real one.
 */
function rememberInUrl(slug) {
  const url = new URL(globalThis.location.href);
  if (slug === null) url.searchParams.delete('puzzle');
  else url.searchParams.set('puzzle', slug);
  globalThis.history?.replaceState?.(null, '', url);
}

/**
 * Title, select, play, or end. The route is the player's choice of door; within a game,
 * the status decides play versus end — so both inputs are kept and repainted together
 * rather than each fighting the other's `hidden` flags.
 */
class ScreenRouter {
  // The doors. Standing on one means the game underneath keeps its state and is simply
  // not on screen; only `game` defers to the status.
  static DOORS = ['title', 'select'];

  constructor() {
    this.sections = {
      title: document.getElementById('screen-title'),
      select: document.getElementById('screen-select'),
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
    const showing = ScreenRouter.DOORS.includes(this.route)
      ? this.route
      : over
        ? 'end'
        : 'play';

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
