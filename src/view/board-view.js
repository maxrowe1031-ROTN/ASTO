// The 4×4 tile board. READ-ONLY — renders state, emits tap intents via callback.
//
// One persistent <button> per term, created once and kept in a Map. Updates reorder and
// remove existing nodes, never recreate them — FLIP needs the same DOM node before and
// after, which is exactly why Phase 2 built it this way.

// Importing a pure derivation is the same move SolvedSetsView makes: difficultyToTier
// decides no rules, it just names the colour a difficulty maps to.
import { difficultyToTier } from '../engine/tiers.js';
import { fadeOut, flip, pulse, shake, staggerIn } from './motion.js';

const SHAKES = new Set(['miss', 'so-close', 'already-tried']);

/**
 * "Every tile on this board was born this pass" — the entrance detector, pure so the
 * timing promise is testable headlessly.
 *
 * True on first load, on a loadPuzzle swap, and on post-win Play again (the fourth
 * solve emptied the Map). False on a resume-repaint (the nodes persisted) — returning
 * to an in-progress board must not replay the entrance — and false after a loss's Play
 * again, where only the solved sets' tiles are recreated: a partial stagger would read
 * as broken, so a partially-recreated board simply appears, the accepted degrade.
 */
export function isFreshBoard(createdCount, boardCount) {
  return boardCount > 0 && createdCount === boardCount;
}

export class BoardView {
  constructor(root, { onTileTap, flight }) {
    this.root = root;
    this.tiles = new Map(); // term → <button>, for the life of the game
    this.onTileTap = onTileTap;
    this.flight = flight ?? null; // the solve transit — presentation state, no rules
  }

  async update(state, outcome) {
    // A failed submission shakes the tiles the player had chosen, then they settle back
    // onto the board (the engine has already cleared the selection).
    if (SHAKES.has(outcome?.type)) {
      const chosen = this.wereSelected?.map((term) => this.tiles.get(term)).filter(Boolean) ?? [];
      await shake(chosen);
    }

    let created = 0;
    for (const term of state.boardTerms) {
      if (this.tiles.has(term)) continue;
      this.tiles.set(term, this.createTile(term));
      created += 1;
    }

    // Words whose set was just solved leave the board: fade them, then FLIP the survivors
    // into their new positions so the grid closes smoothly instead of snapping.
    const onBoard = new Set(state.boardTerms);
    const departing = [...this.tiles].filter(([term]) => !onBoard.has(term));

    if (isFreshBoard(created, state.boardTerms.length)) {
      // A brand-new board (2026-08-26 polish brief): any old tiles leave, then the
      // sixteen newcomers stagger in — an entrance, not a FLIP, because nothing on
      // screen has a "before". Disabled until the entrance settles; the paint loop
      // below runs after the await and restores the real disabled state, so the gate
      // costs no bookkeeping. Under reduced motion staggerIn resolves at once and the
      // board is simply there, interactive immediately.
      if (departing.length > 0) await fadeOut(departing.map(([, tile]) => tile));
      for (const [term, tile] of departing) {
        tile.remove();
        this.tiles.delete(term);
      }
      const tiles = state.boardTerms.map((term) => this.tiles.get(term));
      for (const tile of tiles) tile.disabled = true;
      this.appendInOrder(state.boardTerms);
      await staggerIn(tiles);
    } else if (departing.length > 0) {
      // A solved set's four tiles LAUNCH — clones lift off and hover while the grid
      // closes, then SolvedSetsView lands them on the card (2026-08-26 polish brief).
      // Every other departure (a board swap's sixteen) fades as before. In canonical
      // order, so the clones fan onto the card the way the analogy reads.
      const flying = outcome?.type === 'solved' && this.flight
        ? outcome.canonicalOrder.map((term) => this.tiles.get(term)).filter(Boolean)
        : [];
      const survivors = state.boardTerms.map((term) => this.tiles.get(term));
      const close = () =>
        flip(survivors, () => {
          for (const [term, tile] of departing) {
            tile.remove();
            this.tiles.delete(term);
          }
          this.appendInOrder(state.boardTerms);
        });

      if (flying.length === departing.length) {
        await this.flight.launch(flying);
        // NOT awaited: flip mutates the DOM synchronously, so the layout — and the
        // card's landing spot — is final the moment it starts. The grid then closes
        // WHILE the clones travel; the render chain waits on the landing instead
        // (SolvedSetsView runs next), which takes exactly as long. Awaiting both in
        // turn read as the clones hovering dead for the whole reflow.
        close().catch((error) => console.error('board reflow failed', error));
      } else {
        await fadeOut(departing.map(([, tile]) => tile));
        await close();
      }
    } else {
      await flip([...this.tiles.values()], () => this.appendInOrder(state.boardTerms));
    }

    const selected = new Set(state.selectedTerms);
    const over = state.status !== 'playing';

    // A hinted set's tiles carry its tier colour until solved — the sanctioned early
    // tier reveal (2026-08-11). Derived from state every pass, so the tint survives
    // shuffles and re-renders without any bookkeeping here.
    const tierByTerm = new Map();
    for (const set of state.puzzle.sets) {
      if (!state.hintedSetIds.includes(set.id)) continue;
      if (state.solvedSetIds.includes(set.id)) continue;
      for (const term of set.pairs.flat()) tierByTerm.set(term, difficultyToTier(set.difficulty));
    }

    for (const [term, tile] of this.tiles) {
      tile.classList.toggle('selected', selected.has(term));
      tile.setAttribute('aria-pressed', String(selected.has(term)));
      tile.disabled = over;

      const tier = tierByTerm.get(term);
      tile.classList.toggle('hinted', tier !== undefined);
      if (tier !== undefined) {
        tile.dataset.tier = tier;
      } else {
        delete tile.dataset.tier;
      }
    }
    this.wereSelected = [...state.selectedTerms];

    // The tint entrance: one gentle pulse on the newly revealed four (the latest hinted
    // set only — earlier hints keep still). The colour itself is stylesheet state, so
    // under reduced motion the reveal still lands — just still.
    if (outcome?.type === 'hint') {
      const newest = state.puzzle.sets.find((set) => set.id === state.hintedSetIds.at(-1));
      const revealed = (newest?.pairs.flat() ?? []).map((term) => this.tiles.get(term));
      await pulse(revealed.filter(Boolean));
    }
  }

  createTile(term) {
    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.textContent = term;
    tile.addEventListener('click', () => this.onTileTap(term));
    return tile;
  }

  /** Appending an existing child moves it, so a shuffle reorders the same nodes. */
  appendInOrder(terms) {
    for (const term of terms) this.root.appendChild(this.tiles.get(term));
  }
}
