// desk.js — the Desk (D-35), the Studio's home. Four questions on open: what is
// waiting for my read, what is running, how much calendar is left, what did it
// cost. Then the queue, the batch launcher, the runway and the players.
//
// String builders first, one thin wiring function last. The builders read the
// rows GET /api/runs serves, the report GET /api/schedule serves, and the two
// Supabase panels — and add nothing up that rollups.js does not own.

import { dayLabel, escape, money, shortDate } from './dom.js';
import { estimateCost, inFlight, queueOrder, spend } from './rollups.js';
import { machineChipsHtml } from './runs.js';

const COUNTS = [1, 3, 6, 10];
const PAIRS = [12, 14, 16];
const DEFAULT_COUNT = 6;
const DEFAULT_PAIRS = 14;
const NEXT_FREE_SLOTS = 3;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const isVerify = (run) => run.mock === true || /Z-verify-/.test(run.runId);
const titleOf = (run) => run.theme ?? run.runId.slice(run.runId.indexOf('Z-') + 2);
const registerLabel = (id, registers) => registers.find((r) => r.id === id)?.label ?? id;

export function statTiles(runs, schedule, todayKey) {
  const waiting = queueOrder(runs).length;
  const live = inFlight(runs).length;
  const money$ = spend(runs, todayKey);
  const dry = schedule?.lastScheduled ? ` · runs dry ${shortDate(schedule.lastScheduled)}` : '';
  const runway = schedule ? plural(schedule.runway, 'day') : '—';
  return `<div class="stat-tiles" id="stat-tiles">
    <div class="stat"><div class="stat-n">${waiting}</div><div class="stat-k">${waiting === 1 ? 'board' : 'boards'} waiting for your read</div></div>
    <div class="stat"><div class="stat-n">${live}</div><div class="stat-k">${live === 1 ? 'run' : 'runs'} in flight</div></div>
    <div class="stat"><div class="stat-n${schedule && schedule.runway <= 7 ? ' stat-warn' : ''}">${runway}</div><div class="stat-k">of calendar left${dry}</div></div>
    <div class="stat"><div class="stat-n">${money(money$.week)}</div><div class="stat-k">spent this week · ${money(money$.allTime)} all time</div></div>
  </div>`;
}

export function queueRows(runs, registers = []) {
  const queue = queueOrder(runs);
  if (queue.length === 0) return '<p class="studio-muted">Nothing waiting. Start a batch below, or open the runs.</p>';
  return queue
    .map((run) => {
      const href = `#/runs/${encodeURIComponent(run.runId)}`;
      const verify = isVerify(run);
      // The batch label already names the day for an unbatched run; a
      // labelled batch gets its date beside the label.
      const meta = [
        run.batch.id.startsWith('date:') ? run.batch.label : `${run.batch.label} · ${shortDate(run.createdAt)}`,
        run.reviewableAttemptId ? `attempt ${run.reviewableAttemptId} is reviewable` : `attempt ${run.currentAttemptId ?? '—'}`,
        run.mock ? 'mock' : money(run.costUsd),
      ];
      if (run.subjectRegister) meta.splice(1, 0, registerLabel(run.subjectRegister, registers));
      // A mock run replays fixtures, so it usually HAS a machine read; the note is for when it does not.
      const chips = run.machine ? machineChipsHtml(run.machine) : run.mock ? '<span class="studio-muted chip-note">mock run · no machine read</span>' : machineChipsHtml(null);
      const actions = verify
        ? `<button type="button" class="pill small quiet" data-act="archive" data-run-id="${escape(run.runId)}" disabled title="Archive arrives in Phase C">Archive</button>
           <a class="pill small" href="${href}">Review</a>`
        : `<button type="button" class="pill small" data-act="play" data-run-id="${escape(run.runId)}">Play</button>
           <a class="pill small primary" href="${href}">Review</a>`;
      return `<div class="queue-row" data-run-id="${escape(run.runId)}">
        <span><span class="queue-title">${escape(titleOf(run))}</span><span class="studio-muted row-sub">${meta.map(escape).join(' · ')}</span></span>
        <span>${chips}</span>
        <span class="row-actions">${actions}</span>
      </div>`;
    })
    .join('');
}

const seg = (name, values, active, attr) =>
  `<span class="seg" role="group" aria-label="${name}">${values
    .map((v) => `<button type="button" data-${attr}="${v}" aria-pressed="${v === active ? 'true' : 'false'}">${v}</button>`)
    .join('')}</span>`;

export function estimateLine(runs, count, mock) {
  const est = estimateCost(runs, count, { mock });
  if (mock) return '<span class="studio-muted">mock · no API spend</span>';
  if (!est) return '<span class="studio-muted">no real runs yet to estimate from</span>';
  return `<span class="studio-muted">≈ <strong>${money(est.low)} – ${money(est.high)}</strong> · from the last ${plural(est.basis, 'real run')}</span>`;
}

export function launcherHtml(runs, { count = DEFAULT_COUNT, pairs = DEFAULT_PAIRS, mock = false } = {}) {
  return `<form id="launcher-form" class="launcher">
    <label class="launcher-field">Boards ${seg('Boards', COUNTS, count, 'count')}<input type="hidden" name="count" value="${count}" /></label>
    <label class="launcher-field launcher-themes">Themes
      <textarea name="themes" rows="1" placeholder="leave blank · the scout picks fresh subjects across 18 registers · one theme per line to choose"></textarea>
    </label>
    <label class="launcher-field">Pairs ${seg('Pairs', PAIRS, pairs, 'pairs')}<input type="hidden" name="pairs" value="${pairs}" /></label>
    <label class="chip chip-check"><input type="checkbox" name="autoRevise" checked /> auto-revise structural findings</label>
    <label class="chip chip-check"><input type="checkbox" name="mock"${mock ? ' checked' : ''} /> mock · no API spend</label>
    <span class="launcher-go"><span id="launcher-estimate">${estimateLine(runs, count, mock)}</span>
      <button type="submit" class="pill primary" id="launcher-start">Start ${plural(count, 'run')}</button></span>
  </form>`;
}

/** The form → one POST /api/runs body per board: named themes first, the scout fills the rest. */
export function launcherBody({ count, themes, pairs, mock, autoRevise }) {
  const named = String(themes ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, count);
  return Array.from({ length: count }, (_, i) => ({
    theme: named[i] ?? null,
    count: Number(pairs),
    mock: Boolean(mock),
    autoRevise: Boolean(autoRevise),
  }));
}

const dayRow = (dateKey, todayKey, body, tail = '', cls = '') =>
  `<div class="day ${cls}"><span class="day-d">${dayLabel(dateKey, todayKey)}</span><span>${body}</span><span class="studio-muted day-tail">${tail}</span></div>`;

export function runwayPanel(schedule, todayKey) {
  if (!schedule) return '<p class="studio-muted">The schedule could not be read.</p>';
  const rows = [];
  rows.push(
    schedule.today
      ? dayRow(todayKey, todayKey, `<strong>${escape(schedule.today.title)}</strong>`, '<span class="status status-published">live</span>')
      : dayRow(todayKey, todayKey, '<strong class="stat-warn">NO BOARD today</strong>', 'players see Past Pours'),
  );
  // The next few queued days, then the LAST scheduled day always — the dry
  // date is the number this panel exists to make visible.
  const ahead = schedule.entries.filter((e) => e.date > todayKey);
  const last = ahead.at(-1) ?? null;
  const middle = ahead.slice(0, -1);
  for (const entry of middle.slice(0, 3)) rows.push(dayRow(entry.date, todayKey, escape(entry.title), 'queued'));
  if (middle.length > 3) rows.push(`<div class="day day-more studio-muted">… ${middle.length - 3} more through ${dayLabel(middle.at(-1).date, todayKey)}</div>`);
  if (last) rows.push(dayRow(last.date, todayKey, escape(last.title), 'last'));
  let free = schedule.nextFreeDate;
  for (let i = 0; i < NEXT_FREE_SLOTS && free; i += 1) {
    rows.push(dayRow(free, todayKey, '<span class="day-slot"></span>', i === 0 ? 'next free' : '', 'day-empty'));
    const [y, m, d] = free.split('-').map(Number);
    free = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  }
  const gaps = schedule.gaps.length > 0
    ? `<p class="stat-warn runway-note">${plural(schedule.gaps.length, 'dark day')} before ${shortDate(schedule.lastScheduled)}: ${schedule.gaps.map(shortDate).join(', ')}</p>`
    : '';
  return `<div class="runway">${rows.join('')}${gaps}<p class="studio-muted runway-note">publish fills the next free day · ${plural(schedule.queuedAhead, 'board')} queued</p></div>`;
}

export function playersPanel(plays, ratings) {
  const counter = plays
    ? `<div class="players-tiles">
        <div><div class="stat-n small">${plays.totals.starts}</div><div class="stat-k">plays</div></div>
        <div><div class="stat-n small">${plays.totals.finishes}</div><div class="stat-k">finished</div></div>
        <div><div class="stat-n small">${plays.totals.returningClients}</div><div class="stat-k">came back</div></div>
      </div>`
    : '<p class="studio-muted">The play counter is unavailable on this server (not wired, or Supabase did not answer).</p>';
  let line = '';
  if (Array.isArray(ratings) && ratings.length > 0) {
    const sum = (q) => ratings.reduce((acc, b) => acc + (b.ratings[q].average ?? 0) * b.ratings[q].count, 0);
    const n = (q) => ratings.reduce((acc, b) => acc + b.ratings[q].count, 0);
    const taps = n('difficulty') + n('delight') + n('fairness');
    const avg = (q) => (n(q) ? (sum(q) / n(q)).toFixed(1) : '–');
    line = `<p class="studio-muted players-line">Ratings: ${taps} taps on ${plural(ratings.length, 'board')} · delight ${avg('delight')} · fairness ${avg('fairness')} · <a href="#/players">all boards</a></p>`;
  } else if (ratings === null) {
    line = '<p class="studio-muted players-line">Ratings unavailable.</p>';
  }
  return counter + line;
}

export function deskHtml({ runs, schedule, todayKey, registers = [], config = null, plays = undefined, ratings = undefined }) {
  const server = config
    ? `server · effort ${escape(config.effortProfile ?? '?')} · pricing ${escape(config.pricingVersion ?? '?')}`
    : 'server · settings unavailable';
  return `${statTiles(runs, schedule, todayKey)}
  <div class="desk-grid">
    <div class="desk-main">
      <section class="panel" id="queue">
        <div class="panel-head"><h2>Waiting for your read</h2><span class="studio-muted">oldest first · a board waits until you decide</span><a class="text-action" href="#/runs">all runs</a></div>
        ${queueRows(runs, registers)}
      </section>
      <section class="panel" id="launcher">
        <div class="panel-head"><h2>Start a batch</h2><span class="studio-muted">each run is one board · about four minutes</span><span class="studio-muted server-line">${server}</span></div>
        ${launcherHtml(runs)}
      </section>
    </div>
    <div class="desk-side">
      <section class="panel" id="runway">
        <div class="panel-head"><h2>Runway</h2><span class="studio-muted">the calendar as it stands</span></div>
        ${runwayPanel(schedule, todayKey)}
      </section>
      <section class="panel" id="players">
        <div class="panel-head"><h2>Players</h2><span class="studio-muted">last 14 days</span></div>
        <div id="players-body">${plays === undefined && ratings === undefined ? '<p class="studio-muted">Reading…</p>' : playersPanel(plays, ratings)}</div>
      </section>
    </div>
  </div>`;
}

/**
 * Segmented controls, the estimate line and the start button. `onStart`
 * receives the bodies to POST; `onPlay` a run id. The DOM is the only state.
 */
export function wireDesk(root, { runs, onStart, onPlay }) {
  const form = root.querySelector('#launcher-form');
  if (!form) return;
  const refresh = () => {
    const count = Number(form.count.value);
    const mock = form.mock.checked;
    form.querySelector('#launcher-estimate').innerHTML = estimateLine(runs, count, mock);
    form.querySelector('#launcher-start').textContent = `Start ${plural(count, 'run')}`;
  };
  form.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-count], button[data-pairs]');
    if (!button) return;
    const attr = button.dataset.count !== undefined ? 'count' : 'pairs';
    for (const sibling of button.parentElement.querySelectorAll('button')) sibling.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-pressed', 'true');
    form[attr].value = button.dataset[attr];
    refresh();
  });
  form.addEventListener('change', refresh);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onStart(
      launcherBody({
        count: Number(form.count.value),
        themes: form.themes.value,
        pairs: Number(form.pairs.value),
        mock: form.mock.checked,
        autoRevise: form.autoRevise.checked,
      }),
    );
  });
  root.addEventListener('click', (event) => {
    const play = event.target.closest('[data-act="play"]');
    if (play && onPlay) onPlay(play.dataset.runId);
  });
}
