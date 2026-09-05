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

/** A tapped dot has already been filed by the time the dot fills. Say so. */
export const RATING_ACK = 'Thanks — got it.';

/**
 * What Send puts on the status line. Pure, so it is tested without a DOM.
 *
 * Send never does nothing. With a note there is something to file; with an empty box
 * there is not, but the ratings already went as they were tapped — so the line reports
 * whichever of those is true instead of staying quiet.
 */
export function acknowledge({ hasNote, hasRating }) {
  if (hasNote) return 'Thanks for the note.';
  if (hasRating) return 'Thanks — your ratings are in.';
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

    // Whether this board has had any dot tapped, so Send can tell "your ratings are in"
    // from "nothing has been captured yet" — the difference the player is asking about.
    this.rated = false;

    this.inputEl = root.querySelector('.survey-input');
    this.sendEl = root.querySelector('[data-action="send-comment"]');
    this.feedbackEl = root.querySelector('.survey-feedback');

    root.addEventListener('click', (event) => {
      const dot = event.target.closest('.survey-dot');
      if (!dot) return;
      this.select(dot);
      this.rated = true;
      this.feedbackEl.textContent = RATING_ACK;
      onRate(dot.dataset.question, Number(dot.dataset.value));
    });

    const send = () => {
      const note = this.inputEl.value.trim();
      const hasNote = note.length > 0;
      this.feedbackEl.textContent = acknowledge({ hasNote, hasRating: this.rated });
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
    this.rated = false;
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
