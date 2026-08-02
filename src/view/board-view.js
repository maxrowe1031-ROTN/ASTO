// The 4×4 tile board. READ-ONLY — renders state, emits tap intents via callback.
//
// One persistent <button> per term, created once and kept in a Map. Updates reorder and
// remove existing nodes, never recreate them — FLIP needs the same DOM node before and
// after, which is exactly why Phase 2 built it this way.

import { fadeOut, flip, shake } from './motion.js';

const SHAKES = new Set(['miss', 'so-close', 'already-tried']);

export class BoardView {
  constructor(root, { onTileTap }) {
    this.root = root;
    this.tiles = new Map(); // term → <button>, for the life of the game
    this.onTileTap = onTileTap;
  }

  async update(state, outcome) {
    // A failed submission shakes the tiles the player had chosen, then they settle back
    // onto the board (the engine has already cleared the selection).
    if (SHAKES.has(outcome?.type)) {
      const chosen = this.wereSelected?.map((term) => this.tiles.get(term)).filter(Boolean) ?? [];
      await shake(chosen);
    }

    for (const term of state.boardTerms) {
      if (!this.tiles.has(term)) this.tiles.set(term, this.createTile(term));
    }

    // Words whose set was just solved leave the board: fade them, then FLIP the survivors
    // into their new positions so the grid closes smoothly instead of snapping.
    const onBoard = new Set(state.boardTerms);
    const departing = [...this.tiles].filter(([term]) => !onBoard.has(term));

    if (departing.length > 0) {
      await fadeOut(departing.map(([, tile]) => tile));
      const survivors = state.boardTerms.map((term) => this.tiles.get(term));
      await flip(survivors, () => {
        for (const [term, tile] of departing) {
          tile.remove();
          this.tiles.delete(term);
        }
        this.appendInOrder(state.boardTerms);
      });
    } else {
      await flip([...this.tiles.values()], () => this.appendInOrder(state.boardTerms));
    }

    const selected = new Set(state.selectedTerms);
    const over = state.status !== 'playing';
    for (const [term, tile] of this.tiles) {
      tile.classList.toggle('selected', selected.has(term));
      tile.setAttribute('aria-pressed', String(selected.has(term)));
      tile.disabled = over;
    }
    this.wereSelected = [...state.selectedTerms];
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
