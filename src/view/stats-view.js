// The statistics screen. READ-ONLY — it renders the model and emits back/home,
// and it computes NOTHING: every number on this screen was decided by
// src/stats.js, which is where the arithmetic is tested. The view's only
// arithmetic is bar width, which is presentation.
//
// Reached from the calendar's header rather than the title screen: these numbers
// summarise the calendar, so they sit one tap deeper than the thing they
// describe, and the front door stays two buttons (D-24's review call).
//
// Back returns to the CALENDAR, not the title screen — back means the door you
// came through. The wordmark still goes home, as it does on every screen.

import { settleIn, staggerStep } from './motion.js';
import { CUP_SPILLED, CUP_STEAMING } from './result-icons.js';

/** The four tiles, in reading order. `note` is optional second-line context. */
const TILES = [
  { key: 'played', label: 'Played', note: (s) => `of ${s.totalReleased}` },
  { key: 'winPercent', label: 'Win %' },
  { key: 'currentStreak', label: 'Current streak' },
  { key: 'maxStreak', label: 'Max streak' },
];

/**
 * The four cups, named (Max's copy, 2026-08-18). These are VISIBLE labels, not
 * aria-labels: the words are on screen, so they are already the row's accessible
 * name — an aria-label here would override the very text a sighted player reads,
 * and the two would be free to drift apart.
 */
const OUTCOME_LABELS = {
  'won-clean': 'Won with no hint',
  'won-hinted': 'Won with hint',
  'lost-clean': 'Lost with no hint',
  'lost-hinted': 'Lost with hint',
};

/** What a bar means, spoken. The visible column is a numeral; this is the sentence. */
const rowLabel = (bucket, count) => {
  if (bucket.mistakes === null) return `Lost: ${count}`;
  const beans = bucket.mistakes === 1 ? '1 bean' : `${bucket.mistakes} beans`;
  const wins = count === 1 ? '1 win' : `${count} wins`;
  return `${beans} used: ${wins}`;
};

export class StatsView {
  constructor(root, { onBack, onHome }) {
    root.innerHTML = `
      <div class="select-head">
        <h1>
          <button class="wordmark" data-action="home"
                  aria-label="ASTO — back to the title screen">ASTO</button>
        </h1>
      </div>
      <h2 class="stats-title">Statistics</h2>
      <div class="stat-tiles"></div>
      <ul class="stat-outcomes"></ul>
      <p class="stats-empty" hidden>Play a puzzle and your record starts here.</p>
      <div class="stats-chart">
        <h3 class="stats-chart-title">Mistake distribution</h3>
        <p class="stats-chart-note">Beans used on the puzzles you solved.</p>
        <ul class="stat-bars"></ul>
      </div>
      <button class="text-action" data-action="back">Back</button>`;

    this.tilesEl = root.querySelector('.stat-tiles');
    this.outcomesEl = root.querySelector('.stat-outcomes');
    this.emptyEl = root.querySelector('.stats-empty');
    this.chartEl = root.querySelector('.stats-chart');
    this.barsEl = root.querySelector('.stat-bars');

    root.querySelector('[data-action="home"]').addEventListener('click', onHome);
    root.querySelector('[data-action="back"]').addEventListener('click', onBack);
  }

  /**
   * @param {object} stats  exactly what src/stats.js summarize() returned
   *
   * Repainted on every showing (app.js recomputes), so a result that landed
   * since last time is already in the numbers — the same rule showPours follows.
   */
  render(stats) {
    this.tilesEl.innerHTML = '';
    TILES.forEach((tile, i) => {
      const el = this.buildTile(tile, stats);
      this.tilesEl.appendChild(el);
      settleIn(el, i * staggerStep());
    });

    // Nothing played: the tiles are honest zeros, and the chart would be five
    // empty tracks saying nothing. One sentence does the job better.
    const bare = stats.played === 0;
    this.emptyEl.hidden = !bare;
    this.chartEl.hidden = bare;
    this.outcomesEl.hidden = bare;
    if (bare) return;

    // The four cups, in the calendar's vocabulary — the same icons, so a player
    // reads this row with what the grid already taught them.
    this.outcomesEl.innerHTML = '';
    stats.outcomes.forEach((outcome, i) => {
      const item = this.buildOutcome(outcome);
      this.outcomesEl.appendChild(item);
      settleIn(item, (TILES.length + i) * staggerStep());
    });

    // Bars are relative to the BIGGEST bucket, not to `played`: with 40 wins
    // spread over four buckets every bar would be a stub, and the shape of a
    // player's record is the thing this chart exists to show.
    const tallest = Math.max(...stats.distribution.map((bucket) => bucket.count));

    this.barsEl.innerHTML = '';
    stats.distribution.forEach((bucket, i) => {
      const row = this.buildRow(bucket, tallest);
      this.barsEl.appendChild(row);
      settleIn(row, (TILES.length + stats.outcomes.length + i) * staggerStep());
    });
  }

  buildTile({ key, label, note }, stats) {
    const tile = document.createElement('div');
    tile.className = 'stat-tile';

    const value = document.createElement('span');
    value.className = 'stat-value';
    value.textContent = key === 'winPercent' ? `${stats[key]}%` : String(stats[key]);

    const name = document.createElement('span');
    name.className = 'stat-label';
    name.textContent = label;

    tile.append(value, name);

    if (note) {
      const sub = document.createElement('span');
      sub.className = 'stat-note';
      sub.textContent = note(stats);
      tile.appendChild(sub);
    }
    return tile;
  }

  buildOutcome(outcome) {
    const item = document.createElement('li');
    item.className = 'stat-outcome';
    // The colour is the hint, exactly as on the calendar: the class does it, so
    // the pose and the colour never have to be kept in step by hand.
    if (outcome.hinted) item.dataset.hinted = 'true';

    const top = document.createElement('span');
    top.className = 'stat-outcome-top';

    const icon = document.createElement('span');
    icon.className = `stat-outcome-icon${outcome.hinted ? ' is-hinted' : ''}`;
    icon.innerHTML = outcome.status === 'won' ? CUP_STEAMING : CUP_SPILLED;

    const count = document.createElement('span');
    count.className = 'stat-outcome-count';
    count.textContent = String(outcome.count);

    top.append(icon, count);

    const label = document.createElement('span');
    label.className = 'stat-outcome-label';
    label.textContent = OUTCOME_LABELS[outcome.key];

    item.append(top, label);
    return item;
  }

  buildRow(bucket, tallest) {
    const row = document.createElement('li');
    row.className = 'stat-bar-row';
    // The visible label column is a bare numeral so it stays narrow at 375px;
    // the sentence lives here, where a screen reader gets the whole meaning.
    row.setAttribute('aria-label', rowLabel(bucket, bucket.count));
    if (bucket.mistakes === null) row.dataset.lost = 'true';

    const label = document.createElement('span');
    label.className = 'stat-bar-label';
    label.textContent = bucket.label;

    const track = document.createElement('span');
    track.className = 'stat-bar-track';

    const fill = document.createElement('span');
    fill.className = 'stat-bar-fill';
    // A zero bucket gets no sliver — an empty bar must read as empty.
    fill.style.width = bucket.count === 0 ? '0' : `${(bucket.count / tallest) * 100}%`;
    track.appendChild(fill);

    const count = document.createElement('span');
    count.className = 'stat-bar-count';
    count.textContent = String(bucket.count);

    row.append(label, track, count);
    return row;
  }
}
