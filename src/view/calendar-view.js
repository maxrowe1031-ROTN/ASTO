// Past Pours — the calendar of every day's puzzle. READ-ONLY: it renders the
// month model and emits a pick, and knows nothing about how a board loads or
// what a result means. Replaces the old select list (D-24); the paper cup and
// the spoken result sentences moved here with the job.
//
// Two parts, one screen: the month grid, and under it the TITLE CARD for the
// selected day. The grid's squares are deliberately small talk — a date and a
// cup — because a 7-column square cannot hold an editorial title. The card is
// where a board's title keeps doing its work: tap a day, read the title and
// how it went, then Play. One extra tap into an old board, by Max's call.
//
// Future days render as empty squares and are not tappable. The model already
// guarantees no future square carries an entry, so this view could not leak a
// title early even by mistake.

import { buildMonth, dayLabel, monthOf, WEEKDAYS } from './calendar-month.js';
import { settleIn } from './motion.js';
import { iconFor } from './result-icons.js';

const TIERS = ['green', 'yellow', 'red', 'black'];

export class CalendarView {
  constructor(root, { onPick, onBack, onStats }) {
    root.innerHTML = `
      <div class="select-head">
        <h1>
          <button class="wordmark" data-action="home"
                  aria-label="ASTO — back to the title screen">ASTO</button>
        </h1>
        <!-- The statistics door. It lives here rather than on the title screen
             because these numbers summarise THIS screen — and the front door
             stays two buttons (D-24's review call). -->
        <button class="text-action select-head-action" data-action="stats">Statistics</button>
      </div>
      <div class="pours-nav">
        <button class="pours-nav-arrow" data-action="prev" aria-label="Earlier month">‹</button>
        <h2 class="pours-month" aria-live="polite"></h2>
        <button class="pours-nav-arrow" data-action="next" aria-label="Later month">›</button>
      </div>
      <div class="pours-weekdays" aria-hidden="true">
        ${WEEKDAYS.map((day) => `<span>${day}</span>`).join('')}
      </div>
      <div class="pours-grid"></div>
      <div class="day-card" hidden></div>
      <button class="text-action" data-action="back-to-title">Back</button>`;

    this.monthEl = root.querySelector('.pours-month');
    this.gridEl = root.querySelector('.pours-grid');
    this.cardEl = root.querySelector('.day-card');
    this.prevEl = root.querySelector('[data-action="prev"]');
    this.nextEl = root.querySelector('[data-action="next"]');
    this.onPick = onPick;

    // What render() was last given; month/selection changes repaint from these.
    this.entries = [];
    this.results = {};
    this.todayKey = null;
    this.viewingMonth = null;
    this.selectedDate = null;

    root.querySelector('[data-action="home"]').addEventListener('click', onBack);
    root.querySelector('[data-action="back-to-title"]').addEventListener('click', onBack);
    root.querySelector('[data-action="stats"]').addEventListener('click', onStats);

    this.prevEl.addEventListener('click', () => this.shiftMonth('prev'));
    this.nextEl.addEventListener('click', () => this.shiftMonth('next'));

    // One delegated listener, as the old list had: the grid repaints per month,
    // and re-binding thirty handlers per page is how listeners leak.
    this.gridEl.addEventListener('click', (event) => {
      const square = event.target.closest('.pours-day[data-date]');
      if (square) this.select(square.dataset.date);
    });
    this.cardEl.addEventListener('click', (event) => {
      const play = event.target.closest('[data-action="play-day"]');
      if (play) this.onPick(play.dataset.slug);
    });
  }

  /**
   * @param {{slug: string, title: string, date: string}[]} entries  the manifest, futures included
   * @param {object} results  { slug: {status, mistakes, solvedCount, hintsUsed} }, from storage
   * @param {string} todayKey  what day it is (app.js computes it once per showing)
   *
   * Each showing lands on the current month with today selected — a returning
   * player's first question is "did I play today?", not "where was I browsing?".
   */
  render(entries, results, todayKey) {
    this.entries = entries;
    this.results = results;
    this.todayKey = todayKey;
    this.viewingMonth = monthOf(todayKey);
    this.selectedDate = todayKey;
    this.paint();
  }

  shiftMonth(direction) {
    const model = this.model();
    const target = direction === 'prev' ? model.prev : model.next;
    if (!target) return;
    this.viewingMonth = target;
    this.selectedDate = null; // the selection was a day on the old page
    this.paint();
  }

  select(dateKey) {
    this.selectedDate = dateKey;
    this.paint();
  }

  model() {
    return buildMonth(this.viewingMonth, this.entries, this.results, this.todayKey);
  }

  paint() {
    const model = this.model();
    this.monthEl.textContent = model.label;
    this.prevEl.disabled = model.prev === null;
    this.nextEl.disabled = model.next === null;

    this.gridEl.innerHTML = '';
    for (let i = 0; i < model.leading; i++) {
      const pad = document.createElement('span');
      pad.className = 'pours-pad';
      this.gridEl.appendChild(pad);
    }
    for (const day of model.days) this.gridEl.appendChild(this.buildSquare(day));

    this.paintCard(model);
  }

  buildSquare(day) {
    if (day.kind !== 'board') {
      // Inert: nothing to tap on a future day or a gap. A span, not a disabled
      // button — these are not actions the player is being denied.
      const square = document.createElement('span');
      square.className = 'pours-day';
      square.dataset.kind = day.kind;
      square.textContent = day.day;
      square.setAttribute('aria-hidden', 'true');
      return square;
    }

    const square = document.createElement('button');
    square.className = 'pours-day';
    square.dataset.kind = 'board';
    square.dataset.date = day.dateKey;
    if (day.result) square.dataset.played = day.result.status;
    if (day.dateKey === this.selectedDate) square.dataset.selected = 'true';
    if (day.dateKey === this.todayKey) square.dataset.today = 'true';

    const number = document.createElement('span');
    number.className = 'pours-day-number';
    number.textContent = day.day;
    square.appendChild(number);

    // Every board day wears its state: a pot still waiting, or the cup that
    // says how it went (brown when the player took the hint, D-16 addendum).
    const icon = document.createElement('span');
    icon.className = 'result-cup-slot';
    if ((day.result?.hintsUsed ?? 0) > 0) icon.classList.add('is-hinted');
    icon.innerHTML = iconFor(day.result);
    square.appendChild(icon);

    // The visible square is a number and maybe a cup; a screen reader gets the
    // sentence. The title is safe here — every board square is released.
    square.setAttribute(
      'aria-label',
      `${dayLabel(day.dateKey)} — ${day.entry.title}. ${spokenResult(day.result)}`,
    );
    return square;
  }

  /** The title card: where a released board's title still does its work. */
  paintCard(model) {
    const day = model.days.find(
      (candidate) => candidate.dateKey === this.selectedDate && candidate.kind === 'board',
    );
    if (!day) {
      this.cardEl.hidden = true;
      this.cardEl.innerHTML = '';
      return;
    }

    const freshlySelected = this.cardEl.dataset.date !== day.dateKey;
    this.cardEl.hidden = false;
    this.cardEl.dataset.date = day.dateKey;
    const hinted = (day.result?.hintsUsed ?? 0) > 0;
    this.cardEl.innerHTML = `
      <div class="day-card-main">
        <p class="day-card-date">${day.dateKey === this.todayKey ? 'Today' : dayLabel(day.dateKey)}</p>
        <h3 class="day-card-title"></h3>
        <div class="day-card-status">
          ${day.result ? dots(day.result.solvedCount) : ''}
          <span class="day-card-result"></span>
        </div>
        <button class="pill primary" data-action="play-day"></button>
      </div>
      <span class="day-card-icon${hinted ? ' is-hinted' : ''}" aria-hidden="true">${iconFor(day.result)}</span>`;

    // textContent for the two strings that come from data, so a title is text,
    // never markup.
    this.cardEl.querySelector('.day-card-title').textContent = day.entry.title;
    this.cardEl.querySelector('.day-card-result').textContent = spokenResult(day.result);

    const play = this.cardEl.querySelector('[data-action="play-day"]');
    play.dataset.slug = day.entry.slug;
    play.textContent = day.result === null ? 'Play' : day.result.status === 'won' ? 'Play again' : 'Another go';

    if (freshlySelected) settleIn(this.cardEl);
  }
}

/** Four dots in tier order, lit up to the number of sets solved — the old row's glyph. */
function dots(solvedCount) {
  const lit = TIERS.map(
    (tier, i) =>
      `<span class="tier-dot" data-tier="${tier}"${i < solvedCount ? ' data-solved="true"' : ''}></span>`,
  );
  return `<span class="tier-dots" aria-hidden="true">${lit.join('')}</span>`;
}

/** The cup says won-or-lost; this is where the detail the cup dropped still lives. */
function spokenResult(result) {
  if (!result) return 'Not played yet.';
  const hinted = (result.hintsUsed ?? 0) > 0 ? ' A hint was used.' : '';
  if (result.status !== 'won') return `Lost, ${result.solvedCount} of 4 sets solved.${hinted}`;
  const base = result.mistakes === 0
    ? 'Solved with no mistakes.'
    : `Solved with ${result.mistakes} mistake${result.mistakes === 1 ? '' : 's'}.`;
  return `${base}${hinted}`;
}
