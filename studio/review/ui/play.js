// play.js — play a candidate board inside the Review Studio.
//
// ═══ THE OPPOSITE OF board-html.js ═══
// The static preview next door is a deliberate COPY of the game's markup,
// because it only has to be looked at. This file is a deliberate NON-copy: it
// imports the game's real views and the real GameController and drives them
// over the candidate board. Nothing here knows what a mistake costs, what
// counts as "so close", or when the game ends — the engine decides all of it,
// exactly as it does in the game.
//
// That makes this file the sharpest test the boundary law has. The game is
// supposed to be composable from a validated puzzle with the main view off and
// the app shell absent; if that were only aspirational, this page could not
// exist without dragging app.js, storage and routing along with it. It does not.
//
// What is deliberately NOT reused is EndView. It is a full-screen takeover that
// reveals every set with its explanation — which the review page is already
// showing underneath, and which Max has often read before pressing Play. So the
// end state here is a one-line banner that reads state.status and decides
// nothing.

import { GameController } from '../../../src/controller/game-controller.js';
import { BoardView } from '../../../src/view/board-view.js';
import { VocabView } from '../../../src/view/vocab-view.js';
import { ControlsView } from '../../../src/view/controls-view.js';
import { FrameView } from '../../../src/view/frame-view.js';
import { HeaderView } from '../../../src/view/header-view.js';
import { SolvedSetsView } from '../../../src/view/solved-sets-view.js';
import { StatusView } from '../../../src/view/status-view.js';

/**
 * The play area's skeleton.
 *
 * Pure and exported so it can be unit-tested under node — the game's views
 * need a DOM, but the shape of the scaffold they are handed does not. Every
 * class here is the game's own, so the game's stylesheets dress it with no
 * Studio CSS involved; only the wrapper and the bar are Studio chrome.
 */
export function playScaffold() {
  return `
    <div class="play-bar">
      <button class="pill" data-act="exit-play">Back to preview</button>
      <span class="studio-muted">playing the candidate board</span>
    </div>
    <div class="play-area">
      <header class="header" data-play="header"></header>
      <div class="status" role="status" aria-live="polite" data-play="status"></div>
      <div class="frame" aria-label="Analogy frame" data-play="frame"></div>
      <main class="board" aria-label="Word tiles" data-play="board"></main>
      <div class="vocab-line" role="note" data-play="vocab" hidden></div>
      <div class="controls" data-play="controls"></div>
      <div class="play-banner" data-play="banner" hidden></div>
      <div class="solved-sets" aria-label="Solved sets" data-play="solved"></div>
    </div>`;
}

/**
 * The end-of-game line. A view like any other — it is handed state and renders
 * it, and it is last in the list so it speaks after the board has finished
 * animating.
 */
class BannerView {
  constructor(root, { onPlayAgain }) {
    this.root = root;
    this.onPlayAgain = onPlayAgain;
    root.addEventListener('click', (event) => {
      if (event.target.dataset?.act === 'play-again') this.onPlayAgain();
    });
  }

  update(state) {
    if (state.status === 'playing') {
      this.root.hidden = true;
      this.root.innerHTML = '';
      return;
    }
    const solved = state.solvedSetIds.length;
    const line =
      state.status === 'won'
        ? `Solved with ${state.mistakes} mistake${state.mistakes === 1 ? '' : 's'}.`
        : `Out of beans — ${solved} of 4 sets solved.`;
    this.root.innerHTML = `<span>${line}</span>
      <button class="pill" data-act="play-again">Play again</button>`;
    this.root.hidden = false;
  }
}

/**
 * Mount a playable game into `container` for `board`.
 *
 * @returns {{destroy: () => void}} — destroy() drops the controller and empties
 *   the container. The views hold listeners only on nodes inside it, so
 *   clearing it is enough; there is nothing bound to document or window.
 */
/**
 * A view that renders to a data structure instead of the DOM.
 *
 * The playtest literature is consistent that what a player DOES outranks what
 * they recall afterwards, and Max plays every board here, through the game's
 * real controller — so the observation is free. He narrates solve order by hand
 * in about a third of his notes ("this was the second puzzle i solved"); this
 * records it every time, and gives the difficulty rater a ground-truth target
 * to be calibrated against.
 *
 * It is a view, which is the whole trick: the contract is `update(state,
 * outcome)`, views are read-only by the boundary law, and the controller
 * already awaits each in turn. Nothing about the game changes to be watched.
 */
export function createRecorder() {
  const solvedOrder = [];
  let mistakes = 0;
  let soClose = 0;
  let submissions = 0;
  let finished = null;

  return {
    async update(state, outcome) {
      if (outcome?.type === 'solved' && outcome.setId && !solvedOrder.includes(outcome.setId)) {
        solvedOrder.push(outcome.setId);
      }
      // `so-close` carries no setId on purpose (the outcome must not leak which
      // set was nearly right), so it is counted, not attributed.
      if (outcome?.type === 'so-close') soClose += 1;
      if (outcome?.type === 'so-close' || outcome?.type === 'miss') mistakes += 1;
      if (outcome?.type && outcome.type !== 'invalid' && outcome.type !== 'already-tried') {
        submissions += 1;
      }
      if (state?.status === 'won' || state?.status === 'lost') {
        finished = state.status;
      }
    },
    /** The record, or null if the board was never actually played to a finish. */
    result() {
      if (!finished) return null;
      return { solvedOrder, mistakes, soClose, submissions, outcome: finished };
    },
  };
}

export function startPlay(container, board, { onExit, recorder = null } = {}) {
  container.innerHTML = playScaffold();
  const at = (name) => container.querySelector(`[data-play="${name}"]`);

  // Late-bound exactly as app.js does it: the views take intent callbacks that
  // close over a controller which does not exist until they do.
  let controller;

  const views = [
    // The wordmark is the game's way back to the title screen. There is no
    // title screen here, so it does nothing rather than pretending to.
    new HeaderView(at('header'), { onHome: () => {} }),
    new ControlsView(at('controls'), {
      onConfirm: () => controller.confirmPressed(),
      onClear: () => controller.clearPressed(),
      onShuffle: () => controller.shufflePressed(),
      onHint: () => controller.hintPressed(),
      onVocab: () => controller.vocabPressed(),
    }),
    new StatusView(at('status')),
    // Order matters, and for the same reason it does in the game: the
    // controller awaits each view in turn, so the solve beat plays out
    // frame → board → card, and the banner speaks only once it has.
    new FrameView(at('frame'), {
      onSlotTap: (index) => controller.slotTapped(index),
      onReorder: (from, to) => controller.reorderRequested(from, to),
    }),
    new BoardView(at('board'), { onTileTap: (term) => controller.tileTapped(term) }),
    new VocabView(at('vocab')),
    new SolvedSetsView(at('solved')),
    new BannerView(at('banner'), { onPlayAgain: () => controller.restart() }),
    // Last, so it observes the state every visible view has already rendered.
    ...(recorder ? [recorder] : []),
  ];

  controller = new GameController(board, views);
  controller.start();

  container.querySelector('[data-act="exit-play"]').addEventListener('click', () => onExit?.());

  return {
    destroy() {
      controller = null;
      container.innerHTML = '';
    },
  };
}
