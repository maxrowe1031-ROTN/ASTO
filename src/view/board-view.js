// The 4×4 tile board. READ-ONLY — renders state, emits tap intents via callback.
//
// One persistent <button> per term, created once and kept in a Map. Updates reorder and
// remove existing nodes, never recreate them — Phase 3's FLIP animations depend on tiles
// being the same DOM node across renders.

export class BoardView {
  constructor(root, { onTileTap }) {
    this.root = root;
    this.tiles = new Map(); // term → <button>, for the life of the game
    this.onTileTap = onTileTap;
  }

  update(state) {
    // Create any tile we have never seen (first render).
    for (const term of state.boardTerms) {
      if (!this.tiles.has(term)) {
        const tile = document.createElement('button');
        tile.className = 'tile';
        tile.textContent = term;
        tile.addEventListener('click', () => this.onTileTap(term));
        this.tiles.set(term, tile);
      }
    }

    // Remove tiles whose words left the board (their set was solved).
    const onBoard = new Set(state.boardTerms);
    for (const [term, tile] of this.tiles) {
      if (!onBoard.has(term)) {
        tile.remove();
        this.tiles.delete(term);
      }
    }

    // Append in boardTerms order — appending an existing child moves it, so shuffle
    // reorders the same nodes in place.
    for (const term of state.boardTerms) {
      this.root.appendChild(this.tiles.get(term));
    }

    const selected = new Set(state.selectedTerms);
    const over = state.status !== 'playing';
    for (const [term, tile] of this.tiles) {
      tile.classList.toggle('selected', selected.has(term));
      tile.setAttribute('aria-pressed', String(selected.has(term)));
      tile.disabled = over;
    }
  }
}
