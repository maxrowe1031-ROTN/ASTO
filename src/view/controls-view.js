// Confirm · Clear · Shuffle. READ-ONLY — renders gating from state, emits intents.
//
// Confirm is the one primary action on screen, so it alone gets the ink fill. Its
// enabled state is read off the state — the view holds no bookkeeping of its own.

export class ControlsView {
  constructor(root, { onConfirm, onClear, onShuffle }) {
    // Shuffle · Clear · Confirm — least committal to most, ending on the primary action
    // under the right thumb.
    root.innerHTML = `
      <button class="pill" data-action="shuffle">Shuffle</button>
      <button class="pill" data-action="clear">Clear</button>
      <button class="pill primary" data-action="confirm">Confirm</button>`;
    this.confirmEl = root.querySelector('[data-action="confirm"]');
    this.clearEl = root.querySelector('[data-action="clear"]');
    this.shuffleEl = root.querySelector('[data-action="shuffle"]');

    this.confirmEl.addEventListener('click', onConfirm);
    this.clearEl.addEventListener('click', onClear);
    this.shuffleEl.addEventListener('click', onShuffle);
  }

  update(state) {
    const playing = state.status === 'playing';
    this.confirmEl.disabled = !playing || state.selectedTerms.length !== 4;
    this.clearEl.disabled = !playing || state.selectedTerms.length === 0;
    this.shuffleEl.disabled = !playing;
  }
}
