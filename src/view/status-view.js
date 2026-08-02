// The status strip: submission feedback and the Phase 2 minimal end states. READ-ONLY.
//
// Phase 3 replaces the end states with the real end-view (tier cards, Share, loss reveal
// with explanations). Copy per GDD §11.3: short, friendly, no snark.
//
// The so-close line echoes the outcome's deliberate emptiness — it names no set and no
// tier, because the outcome physically carries neither.

const FEEDBACK = {
  solved: { text: 'Correct!', strong: true },
  'so-close': { text: 'So close! Right four words — check the order.', strong: true },
  miss: { text: 'Not quite.', strong: false }
};

export class StatusView {
  constructor(root) {
    this.root = root;
  }

  update(state, outcome) {
    if (state.status === 'won') {
      this.show('Puzzle solved!', true);
    } else if (state.status === 'lost') {
      this.show('Out of beans — better luck next brew.', true);
    } else if (outcome && FEEDBACK[outcome.type]) {
      const { text, strong } = FEEDBACK[outcome.type];
      this.show(text, strong);
    } else if (!outcome) {
      // Fresh render or a non-submission action (select, clear, shuffle): feedback from
      // the previous submission is stale now, so it clears.
      this.clear();
    }
  }

  show(text, strong) {
    this.root.classList.remove('is-empty');
    this.root.innerHTML = '';
    const span = document.createElement('span');
    if (strong) span.className = 'status-strong';
    span.textContent = text;
    this.root.appendChild(span);
  }

  clear() {
    this.root.classList.add('is-empty');
    this.root.textContent = '';
  }
}
