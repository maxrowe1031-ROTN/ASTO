// Bootstrap: decide where a player lands, load boards through the source seam, build the
// views once, and drive them all with a single controller.
//
// Routing (D-20 retired the forced tutorial; D-24 made the game daily):
//   ?puzzle=<slug>   → straight into that board — unless it is dated in the
//                      future, which lands on the title screen instead
//   everything else  → the title screen → Play (the calendar, today
//                      highlighted) or How to play
// The tutorial is opt-in via "How to play", first visit or fiftieth.
// Boards are swapped on ONE controller and ONE set of views via controller.loadPuzzle,
// so nothing is torn down and rebuilt between the tutorial and the real puzzle.

import { ResultsRecorder } from './results-recorder.js';
import { Ratings } from './ratings.js';
import { GameController } from './controller/game-controller.js';
import { TUTORIAL_RULES } from './controller/tutorial-script.js';
import { buildShareText, share } from './share.js';
import { LocalJsonSource } from './source/local-json-source.js';
import { dateKeyFor, isReleased } from './source/release.js';
import { Storage } from './storage.js';
import { BoardView } from './view/board-view.js';
import { VocabView } from './view/vocab-view.js';
import { ControlsView } from './view/controls-view.js';
import { EndView } from './view/end-view.js';
import { FrameView } from './view/frame-view.js';
import { HeaderView } from './view/header-view.js';
import { CalendarView } from './view/calendar-view.js';
import { SolvedSetsView } from './view/solved-sets-view.js';
import { StatusView } from './view/status-view.js';
import { SurveyView } from './view/survey-view.js';
import { TitleView } from './view/title-view.js';
import { TutorialOverlay } from './view/tutorial-overlay.js';

const MANIFEST_PATH = 'puzzles/index.json';
const DEFAULT_PUZZLE = 'first-light';
// The tutorial teaches on a real board, not a bespoke one (D-20 addendum, Max's call:
// the old Warm Up board is retired). First Light is the natural teacher — its green set
// is the very analogy the coach-marks were written around (Seed : Tree :: Spark : Fire),
// and the script itself never names words, only shapes.
const TUTORIAL_PATH = `puzzles/${DEFAULT_PUZZLE}.json`;

// The slug is matched against the same pattern the publisher and the manifest validator
// enforce, so a crafted query string cannot reach outside puzzles/.
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

const pathFor = (slug) => `puzzles/${slug}.json`;

// The one place the game asks what day it is (D-24): evaluated per use, never
// cached, so a tab left open across Mountain midnight flips without a reload.
const todayKey = () => dateKeyFor(new Date());

/** `?puzzle=<slug>`, when it is one — a deep link into a specific board. */
function requestedSlug() {
  const slug = new URLSearchParams(globalThis.location?.search ?? '').get('puzzle');
  return slug && SLUG.test(slug) ? slug : null;
}

async function main() {
  // Read before anything can rewrite the URL. The tutorial clears `?puzzle=` while it is
  // up (a player can still choose it from the title screen), so if they entered through a
  // deep link, the tutorial's handoff should return them to the board they came for.
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

  /** Show the calendar, always freshly painted — a result may have landed since last time. */
  const showPours = () => {
    calendarView.render(manifest, storage.allResults(), todayKey());
    router.show('pours');
  };

  /**
   * The front door (D-24, revised at Max's review): Play opens the calendar
   * with today selected — today's card is one tap from its board, and a
   * finished today shows its result right on the card. No manifest at all
   * falls back to the one board that always works, as it always has.
   */
  const playDoor = () => (manifest.length > 0 ? showPours() : play(DEFAULT_PUZZLE));

  const leaveTutorial = () => {
    storage.markTutorialSeen();
    // The tutorial IS First Light now, so handing off to DEFAULT_PUZZLE would replay
    // the board the player just left. A deep link still wins; everyone else lands
    // on the calendar, where today is already waiting.
    if (deepLink) return play(deepLink);
    return playDoor();
  };

  new TitleView(document.getElementById('screen-title'), {
    onPlay: playDoor,
    onTutorial: () => startGame(null, TUTORIAL_RULES, true).catch(fail)
  });

  const calendarView = new CalendarView(document.getElementById('screen-pours'), {
    onPick: play,
    onBack: () => router.show('title')
  });

  const coach = new TutorialOverlay(document.getElementById('tutorial-coach'), {
    onSkip: leaveTutorial,
    // Reaching the last coach-mark is what "seen" means — not merely opening the board.
    // Recorded here so a player who wanders off mid-screen isn't taught twice.
    onCoached: () => storage.markTutorialSeen()
  });

  const endView = new EndView(document.getElementById('screen-end'), {
    onShare: async () => {
      endView.showShareResult(await share(buildShareText(controller.state)));
    },
    onPlayAgain: () => controller.restart(),
    onPours: () => (manifest.length > 0 ? showPours() : router.show('title'))
  });

  // --- the end-screen survey (D-21) ---
  //
  // `asking` is the board the on-screen survey speaks for, captured when the end screen
  // appears — not read from currentSlug at tap time, so a survey can never file a tap
  // under a different board than the one it asked about. Null means "not asking":
  // tutorial runs, already-rated boards, and every moment outside an end screen.
  const ratings = new Ratings();
  let asking = null;

  const surveyView = new SurveyView(endView.surveyMount, {
    onRate: (question, value) => {
      if (asking === null) return;
      ratings.sendRating({ slug: asking.slug, question, value, won: asking.won, mistakes: asking.mistakes });
      storage.markRated(asking.slug);
    },
    onComment: (note) => {
      if (asking === null) return;
      ratings.sendComment({ slug: asking.slug, note, won: asking.won });
      storage.markRated(asking.slug);
    }
  });

  // Not a view, same as ResultsRecorder: a reader deciding whether the end screen asks.
  // The first tap marks the board rated, but the survey stays up for the rest of the
  // screen — partial answers are data, and the other rows should still be answerable.
  // Only the NEXT visit finds hasRated true and stays quiet.
  const surveyHost = {
    update(state) {
      if (state.status === 'playing') {
        asking = null;
        surveyView.hide();
        return;
      }
      if (this.shownFor === state) return; // same finished game repainting — leave it be
      this.shownFor = state;
      if (currentSlug !== null && !storage.hasRated(currentSlug)) {
        asking = { slug: currentSlug, won: state.status === 'won', mistakes: state.mistakes };
        surveyView.reset();
      } else {
        asking = null;
        surveyView.hide();
      }
    }
  };

  // Order matters: the controller awaits each view in turn, so the solve beat plays out
  // frame → board → card, and the screen only swaps once the motion has finished.
  const views = [
    new HeaderView(document.getElementById('header'), {
      onHome: () => router.show('title')
    }),
    new ControlsView(document.getElementById('controls'), {
      onConfirm: () => controller.confirmPressed(),
      onClear: () => controller.clearPressed(),
      onShuffle: () => controller.shufflePressed(),
      onHint: () => controller.hintPressed(),
      onVocab: () => controller.vocabPressed()
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
    new VocabView(document.getElementById('vocab')),
    new SolvedSetsView(document.getElementById('solved-sets')),
    // Not a view: a reader that saves the result of a finished game. It sits here for the
    // same reason the router does — update(state) is the hook the controller offers, and
    // something that only READS state cannot break the boundary law. Before the end view,
    // so the result is on disk by the time the end screen offers "Next puzzle".
    new ResultsRecorder(storage, () => currentSlug, todayKey),
    // The router runs BEFORE the end view so the end screen is already on-screen when its
    // cards settle in — animating a hidden section just throws the motion away.
    router,
    // After the recorder (a finished board is already saved) and before the end view's
    // cards paint, the host decides whether this end screen carries the survey.
    surveyHost,
    endView
  ];

  // D-20: everyone lands on the title screen; the tutorial is opt-in through "How to
  // play". A deep link still goes straight to its board — with one D-24 exception: a
  // link to a FUTURE-dated board lands on the title screen instead, no error ceremony.
  // A slug the manifest has never heard of still loads if its file exists (an
  // unlisted board keeps its old links; a genuinely wrong slug fails as it always
  // has, in startGame).
  const linkedEntry = deepLink === null ? null : manifest.find((entry) => entry.slug === deepLink);
  if (deepLink && !(linkedEntry && !isReleased(linkedEntry, todayKey()))) {
    await startGame(deepLink, {}, false);
  } else {
    router.show('title');
  }
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
  static DOORS = ['title', 'pours'];

  constructor() {
    this.sections = {
      title: document.getElementById('screen-title'),
      pours: document.getElementById('screen-pours'),
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
