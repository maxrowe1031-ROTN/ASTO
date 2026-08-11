// Hint · Shuffle · Clear · Confirm. READ-ONLY — renders gating from state, emits intents.
//
// Confirm is the one primary action on screen, so it alone gets the ink fill. Enabled
// state is read off the state — the view holds no bookkeeping of its own.

export class ControlsView {
  constructor(root, { onConfirm, onClear, onShuffle, onHint }) {
    // Hint · Shuffle · Clear · Confirm — least committal to most, ending on the primary
    // action under the right thumb.
    root.innerHTML = `
      <button class="pill" data-action="hint">Hint</button>
      <button class="pill" data-action="shuffle">Shuffle</button>
      <button class="pill" data-action="clear">Clear</button>
      <button class="pill primary" data-action="confirm">Confirm</button>`;
    this.confirmEl = root.querySelector('[data-action="confirm"]');
    this.clearEl = root.querySelector('[data-action="clear"]');
    this.shuffleEl = root.querySelector('[data-action="shuffle"]');
    this.hintEl = root.querySelector('[data-action="hint"]');

    this.confirmEl.addEventListener('click', onConfirm);
    this.clearEl.addEventListener('click', onClear);
    this.shuffleEl.addEventListener('click', onShuffle);
    this.hintEl.addEventListener('click', onHint);
  }

  update(state) {
    const playing = state.status === 'playing';
    this.confirmEl.disabled = !playing || state.selectedTerms.length !== 4;
    this.clearEl.disabled = !playing || state.selectedTerms.length === 0;
    this.shuffleEl.disabled = !playing;

    // Hidden outright where hints don't exist (the tutorial), so no dead button shows.
    this.hintEl.hidden = state.rules.hintsAllowed === 0;
    this.hintEl.disabled = !playing || state.hintsUsed >= state.rules.hintsAllowed;
  }
}
