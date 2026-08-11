// Hint · Shuffle · Clear · Confirm. READ-ONLY — renders gating from state, emits intents.
//
// Confirm is the one primary action on screen, so it alone gets the ink fill. Enabled
// state is read off the state — the view holds no bookkeeping of its own.

export class ControlsView {
  constructor(root, { onConfirm, onClear, onShuffle, onHint, onVocab }) {
    // Vocab · Hint · Shuffle · Clear · Confirm — least committal to most, ending on
    // the primary action under the right thumb. The two assists lead: they change what
    // you KNOW, the middle two change what you SEE, Confirm commits. ("Vocab" not
    // "Vocabulary" — Max's call, 2026-08-11, for the tighter phone row.)
    root.innerHTML = `
      <button class="pill" data-action="vocab">Vocab</button>
      <button class="pill" data-action="hint">Hint</button>
      <button class="pill" data-action="shuffle">Shuffle</button>
      <button class="pill" data-action="clear">Clear</button>
      <button class="pill primary" data-action="confirm">Confirm</button>`;
    this.confirmEl = root.querySelector('[data-action="confirm"]');
    this.clearEl = root.querySelector('[data-action="clear"]');
    this.shuffleEl = root.querySelector('[data-action="shuffle"]');
    this.hintEl = root.querySelector('[data-action="hint"]');
    this.vocabEl = root.querySelector('[data-action="vocab"]');

    this.confirmEl.addEventListener('click', onConfirm);
    this.clearEl.addEventListener('click', onClear);
    this.shuffleEl.addEventListener('click', onShuffle);
    this.hintEl.addEventListener('click', onHint);
    this.vocabEl.addEventListener('click', onVocab);
  }

  update(state) {
    const playing = state.status === 'playing';
    this.confirmEl.disabled = !playing || state.selectedTerms.length !== 4;
    this.clearEl.disabled = !playing || state.selectedTerms.length === 0;
    this.shuffleEl.disabled = !playing;

    // Hidden outright where hints don't exist (the tutorial), so no dead button shows.
    this.hintEl.hidden = state.rules.hintsAllowed === 0;
    this.hintEl.disabled = !playing || state.hintsUsed >= state.rules.hintsAllowed;

    // Data-driven, not a rule: the pill exists only on a board that ships a glossary
    // (D-18), and spends itself once the reveal is out.
    const glossary = state.puzzle.glossary ?? [];
    const revealable = glossary.some(
      (entry) =>
        state.boardTerms.includes(entry.word) && !state.vocabRevealed.includes(entry.word)
    );
    this.vocabEl.hidden = glossary.length === 0;
    this.vocabEl.disabled = !playing || !revealable;
  }
}
