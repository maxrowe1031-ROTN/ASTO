// The revealed definition (design.md D-18). READ-ONLY — renders state, emits nothing.
//
// Derived from state every pass, exactly like the hint tint: the line survives
// shuffles and re-renders because it is a rendering of `vocabRevealed`, not a
// one-shot message. It retires itself when the glossed word's set is solved —
// the word has left the board, so the footnote has nothing to annotate.

export class VocabView {
  constructor(root) {
    this.root = root;
  }

  update(state) {
    const entry = (state.puzzle.glossary ?? []).find(
      (candidate) =>
        state.vocabRevealed.includes(candidate.word) && state.boardTerms.includes(candidate.word)
    );

    if (!entry) {
      this.root.hidden = true;
      this.root.textContent = '';
      return;
    }

    this.root.hidden = false;
    this.root.innerHTML = '';
    const word = document.createElement('strong');
    word.textContent = entry.word;
    this.root.append(word, ` — ${entry.definition}`);
  }
}
