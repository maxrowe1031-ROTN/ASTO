// The end-screen survey. READ-ONLY — renders three 1–4 rows and a comment line, emits
// onRate/onComment intents. It never touches the network or storage: whether it shows,
// and what a tap means, are app-level decisions (D-21).
//
// The record of answers lives in Supabase rows and the ratedBoards slug set, neither of
// which this module knows about. Everything it repaints is view-local ephemera.
//
// Three passes on one problem, all on 2026-09-05, all from playtest feedback (D-21
// addendum and its amendments). The problem was never that answers went unrecorded —
// they were recorded from the first tap — but that nothing on screen said so:
//
//   1. Send returned silently on an empty box. A dead button.
//   2. Every tap repainted the same "Thanks — got it.", so the second tap looked
//      ignored. The status line now NAMES the answer.
//   3. Text alone was still doing all the work. Now the row itself leaves — it slides
//      out to the right and a receipt takes its place. Motion proves the tap landed.
//
// The receipt is not decoration either: it carries a `change` link, which is what keeps
// a vanishing row from also taking away the player's ability to fix a mis-tap.

import { exitRight, enterLeft } from './motion.js';

export const QUESTIONS = [
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'delight', label: 'Delight' },
  { key: 'fairness', label: 'Fairness' }
];

const SCALE = [1, 2, 3, 4];

/** How much of a 280-character note the receipt shows before it elides. */
const RECEIPT_NOTE_CHARS = 48;

/**
 * What a tapped dot puts on the status line. Pure, so it is tested without a DOM.
 *
 * It NAMES the answer rather than thanking generically. A fixed "Thanks — got it."
 * repainted identically on the second tap, so the line looked frozen and the tap looked
 * ignored. Saying "Delight 4" after "Difficulty 3" changes on every tap that changes an
 * answer, and doubles as a receipt of exactly what was filed.
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

/** A note is shown in full when it fits, and elided when it does not. Pure. */
export function receiptNote(note, limit = RECEIPT_NOTE_CHARS) {
  const trimmed = String(note ?? '').trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit).trimEnd()}…` : trimmed;
}

/** Player text reaches this module and is written into markup. It gets escaped. */
export function escapeText(text) {
  return String(text).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
}

export class SurveyView {
  constructor(root, { onRate, onComment }) {
    this.root = root;
    this.onRate = onRate;
    this.onComment = onComment;

    // The answers given for THIS board, question -> value. The status line reads it to
    // name what just landed and count how far along the player is; Send reads its size
    // to tell "your ratings are in" from "nothing has been captured yet".
    this.answers = new Map();
    this.labels = new Map(QUESTIONS.map(({ key, label }) => [key, label]));

    // The note already filed for this board, so pressing Send again on unchanged text
    // files nothing. `comments` is append-only: a genuine revision is a second row by
    // design, but re-sending identical text would be noise in the report.
    this.sentNote = null;

    // Bumped by every render(). Async handlers capture it before their first await and
    // bail if it has moved — an exit animation outlives the tap that started it, and a
    // reset() landing mid-flight would otherwise be undone by that tap finishing into
    // the freshly built survey.
    this.generation = 0;

    this.render();

    // Delegated, so the handlers survive the re-render that reset() performs.
    this.root.addEventListener('click', (event) => {
      const dot = event.target.closest('.survey-dot');
      if (dot) return void this.tap(dot);

      const change = event.target.closest('[data-action="change"]');
      if (change) return void this.change(change.dataset.target);

      if (event.target.closest('[data-action="send-comment"]')) void this.send();
    });
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.closest('.survey-input')) void this.send();
    });
  }

  // --- markup ---

  render() {
    this.generation += 1;
    this.root.innerHTML = `
      <p class="survey-lede">How was this one?</p>
      <div class="survey-rows">
        ${QUESTIONS.map(({ key }) => this.rowMarkup(key)).join('')}
      </div>
      <div class="survey-slot">${this.commentMarkup()}</div>
      <p class="survey-feedback" role="status" aria-live="polite"></p>`;
    this.feedbackEl = this.root.querySelector('.survey-feedback');
  }

  /** The inside of a row — kept separate so `change` can rebuild it in place. */
  rowInnerMarkup(key, chosen = null) {
    const label = this.labels.get(key);
    return `
        <div class="survey-row-inner">
          <span class="survey-label">${label}</span>
          <div class="survey-dots">
            ${SCALE.map(
              (value) => `
            <button class="survey-dot" data-question="${key}" data-value="${value}"
                    aria-pressed="${String(value === chosen)}"
                    aria-label="${label} ${value} of 4">${value}</button>`
            ).join('')}
          </div>
        </div>`;
  }

  rowMarkup(key) {
    return `
      <div class="survey-row" data-question="${key}">${this.rowInnerMarkup(key)}
      </div>`;
  }

  commentMarkup(value = '') {
    return `
      <div class="survey-comment">
        <input class="survey-input" type="text" maxlength="280" autocomplete="off"
               placeholder="Anything else?" aria-label="Anything else?"
               value="${escapeText(value)}">
        <button class="pill" data-action="send-comment">Send</button>
      </div>`;
  }

  /**
   * The receipt that replaces something which has left. `target` is what its change link
   * reopens — a question key, or `comment`.
   */
  receiptMarkup(target, text) {
    return `
      <div class="survey-receipt">
        <span class="survey-tick" aria-hidden="true">✓</span>
        <span class="survey-receipt-text">${escapeText(text)}</span>
        <button class="survey-change" type="button" data-action="change"
                data-target="${target}" aria-label="Change ${escapeText(text)}">change</button>
      </div>`;
  }

  // --- intents ---

  /** A rating dot was tapped: fill it, file it, then let the row leave. */
  async tap(dot) {
    const question = dot.dataset.question;
    const value = Number(dot.dataset.value);
    const label = this.labels.get(question);
    const row = dot.closest('.survey-row');
    const inner = row.querySelector('.survey-row-inner');
    const hadFocus = document.activeElement === dot;

    for (const other of row.querySelectorAll('.survey-dot')) {
      other.setAttribute('aria-pressed', String(other === dot));
    }
    this.answers.set(question, value);
    this.feedbackEl.textContent = ratingAck({
      label,
      value,
      answered: this.answers.size,
      total: QUESTIONS.length
    });
    this.onRate(question, value);

    const gen = this.generation;
    await exitRight(inner);
    if (gen !== this.generation) return;

    row.innerHTML = this.receiptMarkup(question, `${label} ${value}`);
    // A keyboard user just activated a control that no longer exists. Focus has to land
    // somewhere deliberate or it falls to <body>, losing their place in the survey.
    if (hadFocus) row.querySelector('.survey-change').focus();
    await enterLeft(row.querySelector('.survey-receipt'));
  }

  /** The change link: put back what left, with the current answer still showing. */
  change(target) {
    if (target === 'comment') {
      const slot = this.root.querySelector('.survey-slot');
      slot.innerHTML = this.commentMarkup(this.sentNote ?? '');
      slot.querySelector('.survey-input').focus();
      this.feedbackEl.textContent = 'Edit it and send again.';
      return;
    }

    const row = this.root.querySelector(`.survey-row[data-question="${target}"]`);
    row.innerHTML = this.rowInnerMarkup(target, this.answers.get(target) ?? null);
    row.querySelector('.survey-dot').focus();
    this.feedbackEl.textContent = `${this.labels.get(target)} — pick again.`;
  }

  /** Send: files the note if it is new, and always answers on the status line. */
  async send() {
    const input = this.root.querySelector('.survey-input');
    if (!input) return;
    const note = input.value.trim();
    const hasNote = note.length > 0;

    this.feedbackEl.textContent = acknowledge({ hasNote, ratingCount: this.answers.size });
    // An empty box files nothing, so nothing may leave — pressing Send early is not a
    // reason to take the box away.
    if (!hasNote) return;

    // Re-sending identical text would file a duplicate row for nobody's benefit. A real
    // revision still files a second row, which is what append-only means.
    if (note !== this.sentNote) {
      this.onComment(note);
      this.sentNote = note;
    }

    const gen = this.generation;
    await exitRight(this.root.querySelector('.survey-comment'));
    if (gen !== this.generation) return;

    const slot = this.root.querySelector('.survey-slot');
    slot.innerHTML = this.receiptMarkup('comment', `"${receiptNote(note)}"`);
    await enterLeft(slot.querySelector('.survey-receipt'));
  }

  // --- lifecycle. The contract app.js relies on is unchanged: reset() and hide(). ---

  /** A fresh, unrated board just finished: blank slate, visible. */
  reset() {
    this.answers.clear();
    this.sentNote = null;
    this.render();
    this.root.hidden = false;
  }

  /** Already rated, or the tutorial — the end screen simply doesn't ask. */
  hide() {
    this.root.hidden = true;
  }
}
