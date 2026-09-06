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
    // The LATEST revealed word still on the board. In one-word mode that is the
    // gloss; in Learning Mode it is whichever tile was tapped last (D-33).
    const word = [...state.vocabRevealed].reverse().find((term) => state.boardTerms.includes(term));

    if (!word) {
      this.root.hidden = true;
      this.root.textContent = '';
      return;
    }

    // The leak-checked gloss outranks the Learning Mode definition for the same
    // word — it is the better-edited sentence.
    const entry =
      (state.puzzle.glossary ?? []).find((candidate) => candidate.word === word) ??
      (state.puzzle.definitions ?? []).find((candidate) => candidate.word === word);

    this.root.hidden = false;
    this.root.innerHTML = '';
    const strong = document.createElement('strong');
    strong.textContent = word;
    this.root.append(strong, ` — ${entry ? entry.definition : 'No definition for this one.'}`);
  }
}
