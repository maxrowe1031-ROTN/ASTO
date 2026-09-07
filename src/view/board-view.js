// The 4×4 tile board. READ-ONLY — renders state, emits tap intents via callback.
//
// One persistent <button> per term, created once and kept in a Map. Updates reorder and
// remove existing nodes, never recreate them — FLIP needs the same DOM node before and
// after, which is exactly why Phase 2 built it this way.

// Importing a pure derivation is the same move SolvedSetsView makes: difficultyToTier
// decides no rules, it just names the colour a difficulty maps to.
import { difficultyToTier } from '../engine/tiers.js';
import { fadeOut, flip, pulse, shake } from './motion.js';
import { fitTerm } from './fit-text.js';

const SHAKES = new Set(['miss', 'so-close', 'already-tried']);
// A tile is 78px wide at 375px. Below 10px the stylesheet hyphenates instead.
const TILE_FIT = { max: 14, min: 10 };

export class BoardView {
  constructor(root, { onTileTap }) {
    this.root = root;
    this.tiles = new Map(); // term → <button>, for the life of the game
    this.onTileTap = onTileTap;
    // The web font lands after first paint; a term measured against the fallback face
    // is re-measured once the real one is in, so the fit is to the face players see.
    globalThis.document?.fonts?.ready?.then(() => {
      for (const tile of this.tiles.values()) fitTerm(tile, TILE_FIT);
    });
  }

  async update(state, outcome) {
    // A failed submission shakes the tiles the player had chosen, then they settle back
    // onto the board (the engine has already cleared the selection).
    if (SHAKES.has(outcome?.type)) {
      const chosen = this.wereSelected?.map((term) => this.tiles.get(term)).filter(Boolean) ?? [];
      await shake(chosen);
    }

    const created = [];
    for (const term of state.boardTerms) {
      if (this.tiles.has(term)) continue;
      const tile = this.createTile(term);
      this.tiles.set(term, tile);
      created.push(tile);
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

    // Fit once the tile is in the grid — measuring needs a laid-out box. Persistent
    // nodes keep their fit for the life of the game.
    for (const tile of created) fitTerm(tile, TILE_FIT);

    const selected = new Set(state.selectedTerms);
    const over = state.status !== 'playing';

    // Learning Mode's armed state is a stylesheet state on the board, so every
    // tile shows it at once and no bookkeeping lives here (D-33).
    this.root.classList.toggle('defining', Boolean(state.vocabArmed) && !over);

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
