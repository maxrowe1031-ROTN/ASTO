// Header: wordmark, puzzle title, coffee-bean mistake pips. READ-ONLY — renders state,
// emits nothing.
//
// Beans fill roast brown as mistakes are used. Never red; that is spec, not taste.

const BEAN_SVG = `
  <svg class="bean" viewBox="0 0 20 20" aria-hidden="true">
    <ellipse class="bean-body" cx="10" cy="10" rx="6.5" ry="8.5" transform="rotate(28 10 10)"/>
    <path class="bean-crease" d="M6.5 4.5 C 11 8, 9 12, 13.5 15.5" transform="rotate(28 10 10)"/>
  </svg>`;

export class HeaderView {
  constructor(root) {
    root.innerHTML = `
      <span class="wordmark">ASTO</span>
      <span class="puzzle-title"></span>
      <span class="beans" role="img"></span>`;
    this.titleEl = root.querySelector('.puzzle-title');
    this.beansEl = root.querySelector('.beans');
    this.beanEls = [];
  }

  update(state) {
    this.titleEl.textContent = state.puzzle.title;

    // Bean count follows the rules, so the tutorial's Infinity never renders pips here
    // (that phase hides them via a view flag anyway; guard against rendering ∞ beans).
    const total = Number.isFinite(state.rules.maxMistakes) ? state.rules.maxMistakes : 0;
    if (this.beanEls.length !== total) {
      this.beansEl.innerHTML = BEAN_SVG.repeat(total);
      this.beanEls = [...this.beansEl.querySelectorAll('.bean')];
    }
    this.beanEls.forEach((bean, i) => bean.classList.toggle('used', i < state.mistakes));
    this.beansEl.setAttribute('aria-label', `${state.mistakes} of ${total} mistakes used`);
  }
}
