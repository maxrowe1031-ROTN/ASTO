// The end-screen survey. READ-ONLY — renders three 1–4 rows and a comment line, emits
// onRate/onComment intents. It never touches the network or storage: whether it shows,
// and what a tap means, are app-level decisions (D-21).
//
// The selections it repaints are view-local ephemera, like the share feedback line —
// they exist only so a tapped dot LOOKS tapped. The record of answers lives in Supabase
// rows and the ratedBoards slug set, neither of which this module knows about.

export const QUESTIONS = [
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'delight', label: 'Delight' },
  { key: 'fairness', label: 'Fairness' }
];

const SCALE = [1, 2, 3, 4];

export class SurveyView {
  constructor(root, { onRate, onComment }) {
    this.root = root;
    root.innerHTML = `
      <p class="survey-lede">How was this one?</p>
      ${QUESTIONS.map(
        ({ key, label }) => `
      <div class="survey-row">
        <span class="survey-label">${label}</span>
        <div class="survey-dots">
          ${SCALE.map(
            (value) => `
          <button class="survey-dot" data-question="${key}" data-value="${value}"
                  aria-pressed="false" aria-label="${label} ${value} of 4">${value}</button>`
          ).join('')}
        </div>
      </div>`
      ).join('')}
      <div class="survey-comment">
        <input class="survey-input" type="text" maxlength="280"
               placeholder="Anything else?" aria-label="Anything else?">
        <button class="text-action" data-action="send-comment">Send</button>
      </div>
      <p class="survey-feedback" role="status" aria-live="polite"></p>`;

    this.inputEl = root.querySelector('.survey-input');
    this.sendEl = root.querySelector('[data-action="send-comment"]');
    this.feedbackEl = root.querySelector('.survey-feedback');

    root.addEventListener('click', (event) => {
      const dot = event.target.closest('.survey-dot');
      if (!dot) return;
      this.select(dot);
      onRate(dot.dataset.question, Number(dot.dataset.value));
    });

    const send = () => {
      const note = this.inputEl.value.trim();
      if (note.length === 0) return;
      onComment(note);
      // One line, sent once — the input retires for this board. reset() revives it.
      this.inputEl.disabled = true;
      this.sendEl.disabled = true;
      this.feedbackEl.textContent = 'Thanks.';
    };
    this.sendEl.addEventListener('click', send);
    this.inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') send();
    });
  }

  /** A tap fills its dot and empties the rest of its row — one answer per question. */
  select(dot) {
    for (const other of this.root.querySelectorAll(
      `.survey-dot[data-question="${dot.dataset.question}"]`
    )) {
      other.setAttribute('aria-pressed', String(other === dot));
    }
  }

  /** A fresh, unrated board just finished: blank slate, visible. */
  reset() {
    for (const dot of this.root.querySelectorAll('.survey-dot')) {
      dot.setAttribute('aria-pressed', 'false');
    }
    this.inputEl.value = '';
    this.inputEl.disabled = false;
    this.sendEl.disabled = false;
    this.feedbackEl.textContent = '';
    this.root.hidden = false;
  }

  /** Already rated, or the tutorial — the end screen simply doesn't ask. */
  hide() {
    this.root.hidden = true;
  }
}
