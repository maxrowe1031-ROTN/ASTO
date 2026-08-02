// Header: wordmark, puzzle title, coffee-bean mistake pips. READ-ONLY — renders state,
// emits one intent: the wordmark is the way back to the title screen, the convention
// every site has trained players to expect of a logo in the top-left.
//
// Beans fill roast brown as mistakes are used. Never red; that is spec, not taste.

const BEAN_SVG = `
  <svg class="bean" viewBox="0 0 20 20" aria-hidden="true">
    <ellipse class="bean-body" cx="10" cy="10" rx="6.5" ry="8.5" transform="rotate(28 10 10)"/>
    <path class="bean-crease" d="M6.5 4.5 C 11 8, 9 12, 13.5 15.5" transform="rotate(28 10 10)"/>
  </svg>`;

export class HeaderView {
  constructor(root, { onHome }) {
    root.innerHTML = `
      <button class="wordmark" data-action="home" aria-label="ASTO — back to the title screen">ASTO</button>
      <span class="puzzle-title"></span>
      <span class="beans" role="img"></span>`;
    this.titleEl = root.querySelector('.puzzle-title');
    this.beansEl = root.querySelector('.beans');
    this.beanEls = [];

    root.querySelector('[data-action="home"]').addEventListener('click', onHome);
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

    // With no beans to show there is nothing to announce — "0 of 0 mistakes used" is
    // noise a screen reader would read out on every render of the no-lose tutorial.
    if (total === 0) {
      this.beansEl.removeAttribute('aria-label');
      this.beansEl.removeAttribute('role');
    } else {
      this.beansEl.setAttribute('role', 'img');
      this.beansEl.setAttribute('aria-label', `${state.mistakes} of ${total} mistakes used`);
    }
  }
}
