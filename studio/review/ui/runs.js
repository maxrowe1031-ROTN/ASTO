// runs.js — the Runs screen (D-35): every run, filtered, searched and grouped,
// with each batch's yield and spend on its header row.
//
// String builders first, one thin wiring function last, the feedback.js
// pattern: everything above `wireRuns` is pure and tested under node. The
// rows read the summary shape GET /api/runs serves and decide nothing —
// what a status means, whether a board is publishable, what a slug becomes,
// are the server's calls and arrive already made.

import { escape, money, shortDate } from './dom.js';
import { applyFilter, filterCounts, groupRuns } from './rollups.js';

const FILTER_LABELS = [
  ['all', 'All'],
  ['awaiting', 'Awaiting review'],
  ['running', 'Running'],
  ['approved', 'Approved'],
  ['published', 'Published'],
  ['rejected', 'Rejected'],
  ['failed', 'Failed'],
  ['mockVerify', 'Mock & verify'],
  ['archived', 'Archived'],
];

const VERDICT_LABELS = {
  'approve-board': 'publishable',
  'revise-board': 'after a fix',
  'reject-board': 'not publishable',
};

const pressed = (on) => (on ? ' aria-pressed="true"' : ' aria-pressed="false"');

export function filterChips(counts, active) {
  return `<div class="filter-chips" role="group" aria-label="Filter runs">${FILTER_LABELS.filter(
    ([key]) => key !== 'archived' || counts.archived > 0,
  )
    .map(
      ([key, label]) =>
        `<button type="button" class="chip chip-filter" data-filter="${key}"${pressed(key === active)}>${escape(
          label,
        )}<span class="chip-count">${counts[key] ?? 0}</span></button>`,
    )
    .join('')}</div>`;
}

export function groupControl(by) {
  return `<div class="seg" role="group" aria-label="Group runs">${[
    ['batch', 'By batch'],
    ['date', 'By date'],
    ['status', 'By status'],
  ]
    .map(([key, label]) => `<button type="button" data-group="${key}"${pressed(key === by)}>${label}</button>`)
    .join('')}</div>`;
}

/** The evaluators' read in four chips; honest about what did not run. */
export function machineChipsHtml(machine) {
  if (!machine) return '<span class="studio-muted chip-note">no machine read</span>';
  const chips = [];
  if (machine.validator) {
    const { clear, total } = machine.validator;
    chips.push(`<span class="chip ${clear === total ? 'chip-good' : 'chip-flag'}">validator ${clear}/${total}</span>`);
  }
  if (machine.solver) {
    chips.push(`<span class="chip ${machine.solver === 'clear' ? 'chip-good' : 'chip-flag'}">solver ${machine.solver}</span>`);
  }
  if (machine.testPlayer) {
    const n = machine.testPlayer.gated;
    chips.push(
      n === 0
        ? '<span class="chip chip-good">test player clear</span>'
        : `<span class="chip chip-flag">${n} gated word${n === 1 ? '' : 's'}</span>`,
    );
  }
  if (machine.unity) chips.push(`<span class="chip">unity ${escape(machine.unity)}</span>`);
  return `<span class="chips chips-inline">${chips.join('')}</span>`;
}

/** Max's latest word on the board, or a dash until he has one. */
export function yourReadChip(yourRead) {
  if (!yourRead || (!yourRead.boardVerdict && !yourRead.taste)) return '<span class="studio-muted">—</span>';
  const parts = [];
  if (yourRead.taste) {
    parts.push(`<span class="chip ${yourRead.taste === 'delightful' ? 'chip-good' : ''}">${escape(yourRead.taste)}</span>`);
  }
  if (yourRead.boardVerdict) {
    parts.push(`<span class="chip">${escape(VERDICT_LABELS[yourRead.boardVerdict] ?? yourRead.boardVerdict)}</span>`);
  }
  return `<span class="chips chips-inline">${parts.join('')}</span>`;
}

/**
 * @param {object} run
 * @param {Map<string,string>} [dates]  slug → release date from the schedule, for
 *   publish records written before the date rode along (D-35). A join, not a rule.
 */
export function statusChip(run, dates = new Map()) {
  if (run.status === 'approved' && run.published) {
    const slug = String(run.published.publishedAs ?? '').replace(/\.json$/, '');
    const date = run.published.date ?? dates.get(slug) ?? null;
    const when = date ? ` · ${shortDate(date)}` : '';
    return `<span class="status status-approved status-published">published${when}</span>`;
  }
  return `<span class="status status-${escape(run.status)}">${escape(run.status.replace('-', ' '))}</span>`;
}

const titleOf = (run) => run.theme ?? run.runId.slice(run.runId.indexOf('Z-') + 2);

export function runRow(run, dates) {
  const href = `#/runs/${encodeURIComponent(run.runId)}`;
  const reviewable = run.status === 'awaiting-review' || run.reviewableAttemptId;
  const sub = run.reviewableAttemptId
    ? `<span class="studio-muted row-sub">attempt ${escape(run.reviewableAttemptId)} is reviewable</span>`
    : run.subjectRegister
      ? `<span class="studio-muted row-sub">${escape(run.subjectRegister)}</span>`
      : '';
  return `<div class="run-row" data-run-id="${escape(run.runId)}">
    <span class="row-title"><strong>${escape(titleOf(run))}</strong>${sub}</span>
    <span>${statusChip(run, dates)}</span>
    <span class="row-num">${run.attemptCount}</span>
    <span class="row-num">${money(run.costUsd)}</span>
    <span>${machineChipsHtml(run.machine)}</span>
    <span>${yourReadChip(run.yourRead)}</span>
    <span class="row-actions">${
      reviewable
        ? `<a class="pill small primary" href="${href}">Review</a>`
        : `<a class="pill small quiet" href="${href}">Open</a>`
    }</span>
  </div>`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function groupHeader(group, collapsed) {
  const t = group.totals;
  const parts = [plural(t.count, 'run')];
  if (t.approved) parts.push(`${t.approved} approved`);
  if (t.rejected) parts.push(`${t.rejected} rejected`);
  if (t.failed) parts.push(`${t.failed} failed`);
  if (t.awaiting) parts.push(`${t.awaiting} waiting`);
  parts.push(money(t.costUsd));
  return `<div class="run-group">
    <strong>${escape(group.label)}</strong><span>${parts.join(' · ')}</span>
    <button type="button" class="pill small quiet" data-act="${collapsed ? 'expand' : 'collapse'}" data-group-key="${escape(
      group.key,
    )}">${collapsed ? 'Show' : 'Hide'}</button>
  </div>`;
}

const matches = (run, query) => {
  if (!query) return true;
  const q = query.toLowerCase();
  return [run.theme, run.runId, run.subjectRegister, run.batch?.label].some((s) => String(s ?? '').toLowerCase().includes(q));
};

/**
 * @param {object[]} runs  the summary rows, newest first
 * @param {{filter, groupBy, query, collapsed: Set<string>}} state
 * @param {{dates?: Map<string,string>}} [extras]  the schedule's slug → date join
 */
export function runsHtml(runs, state, { dates = new Map() } = {}) {
  const counts = filterCounts(runs);
  const shown = applyFilter(runs, state.filter).filter((run) => matches(run, state.query));
  const groups = groupRuns(shown, state.groupBy);
  const table = groups.length === 0
    ? '<p class="studio-muted">No runs match.</p>'
    : groups
        .map((group) => {
          const collapsed = state.collapsed.has(group.key);
          return groupHeader(group, collapsed) + (collapsed ? '' : group.runs.map((run) => runRow(run, dates)).join(''));
        })
        .join('');
  return `<section class="panel runs-panel">
    <div class="runs-toolbar">
      ${filterChips(counts, state.filter)}
      <span class="toolbar-gap"></span>
      ${groupControl(state.groupBy)}
      <input class="field" type="search" name="query" placeholder="search a board, theme or batch" value="${escape(state.query)}" />
    </div>
    <div class="run-row run-head studio-muted">
      <span>Board</span><span>Status</span><span class="row-num">Attempts</span><span class="row-num">Cost</span><span>Machine read</span><span>Your read</span><span></span>
    </div>
    ${table}
  </section>`;
}

/** Filter, group and search clicks re-render locally; nothing here refetches. */
export function wireRuns(root, state, rerender) {
  root.addEventListener('click', (event) => {
    const filter = event.target.closest('[data-filter]');
    if (filter) {
      state.filter = filter.dataset.filter;
      return rerender();
    }
    const group = event.target.closest('[data-group]');
    if (group) {
      state.groupBy = group.dataset.group;
      return rerender();
    }
    const toggle = event.target.closest('[data-act="expand"], [data-act="collapse"]');
    if (toggle) {
      const key = toggle.dataset.groupKey;
      if (state.collapsed.has(key)) state.collapsed.delete(key);
      else state.collapsed.add(key);
      return rerender();
    }
    return undefined;
  });
  root.addEventListener('input', (event) => {
    if (event.target.name === 'query') {
      state.query = event.target.value;
      rerender({ keepFocus: true });
    }
  });
}
