// The end-screen survey. READ-ONLY — renders three 1–4 rows and a comment line, emits
// onRate/onComment intents. It never touches the network or storage: whether it shows,
// and what a tap means, are app-level decisions (D-21).
//
// The selections it repaints are view-local ephemera, like the share feedback line —
// they exist only so a tapped dot LOOKS tapped. The record of answers lives in Supabase
// rows and the ratedBoards slug set, neither of which this module knows about.
//
// The status line is load-bearing, not decoration (2026-09-05). Ratings post the instant
// a dot is tapped, so there is no form to submit — but three rows and a Send button read
// like one, and Send used to return silently on an empty box. Players concluded nothing
// had been captured. Every interaction now answers: a tap confirms, and Send is never
// dead.

export const QUESTIONS = [
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'delight', label: 'Delight' },
  { key: 'fairness', label: 'Fairness' }
];

const SCALE = [1, 2, 3, 4];

/**
 * What a tapped dot puts on the status line. Pure, so it is tested without a DOM.
 *
 * It NAMES the answer rather than thanking generically (2026-09-05, second pass). A
 * fixed "Thanks — got it." repainted identically on the second tap, so the line looked
 * frozen and the tap looked ignored — the same invisibility the first pass fixed, one
 * layer in. Saying "Delight 4" after "Difficulty 3" changes on every tap that changes
 * an answer, and it also tells the player exactly what was filed.
 */
export function ratingAck({ label, value, answered, total }) {
  const said = `${label} ${value} — got it.`;
  // A completion beat, so the player knows there is nothing left to tap.
  return answered >= total ? `${said} That's all three.` : said;
}

/**
 * What Send puts on the status line. Pure, so it is tested without a DOM.
 *
 * Send never does nothing. With a note there is something to file; with an empty box
 * there is not, but the ratings already went as they were tapped — so the line reports
 * whichever of those is true instead of staying quiet.
 */
export function acknowledge({ hasNote, ratingCount }) {
  if (hasNote) return 'Thanks for the note.';
  if (ratingCount === 1) return 'Thanks — your rating is in.';
  if (ratingCount > 1) return 'Thanks — your ratings are in.';
  return 'Tap a number above, or add a note.';
}

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
        <input class="survey-input" type="text" maxlength="280" autocomplete="off"
               placeholder="Anything else?" aria-label="Anything else?">
        <button class="pill" data-action="send-comment">Send</button>
      </div>
      <p class="survey-feedback" role="status" aria-live="polite"></p>`;

    // The answers given for THIS board, question -> value. Held so the status line can
    // name what just landed and count how far along the player is; Send reads its size
    // to tell "your ratings are in" from "nothing has been captured yet". Cleared by
    // reset(). The authoritative record is still the Supabase rows, not this map.
    this.answers = new Map();
    this.labels = new Map(QUESTIONS.map(({ key, label }) => [key, label]));

    this.inputEl = root.querySelector('.survey-input');
    this.sendEl = root.querySelector('[data-action="send-comment"]');
    this.feedbackEl = root.querySelector('.survey-feedback');

    root.addEventListener('click', (event) => {
      const dot = event.target.closest('.survey-dot');
      if (!dot) return;
      const question = dot.dataset.question;
      const value = Number(dot.dataset.value);
      this.select(dot);
      this.answers.set(question, value);
      this.feedbackEl.textContent = ratingAck({
        label: this.labels.get(question),
        value,
        answered: this.answers.size,
        total: QUESTIONS.length
      });
      onRate(question, value);
    });

    const send = () => {
      const note = this.inputEl.value.trim();
      const hasNote = note.length > 0;
      this.feedbackEl.textContent = acknowledge({ hasNote, ratingCount: this.answers.size });
      // An empty box files nothing, but the button still answered — and the input stays
      // live, because pressing Send early is not a reason to lock someone out of typing.
      if (!hasNote) return;
      onComment(note);
      // One line, sent once — the input retires for this board. reset() revives it.
      this.inputEl.disabled = true;
      this.sendEl.disabled = true;
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
    this.answers.clear();
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
