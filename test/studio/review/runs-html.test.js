// The Runs table's string builders (D-35). Pure.

import test from 'node:test';
import assert from 'node:assert/strict';

import { filterChips, groupControl, machineChipsHtml, runRow, runsHtml, yourReadChip } from '../../../studio/review/ui/runs.js';

const run = (over = {}) => ({
  runId: '2026-08-19T17-23-53.888Z-smokehouse-curing', status: 'approved', theme: 'smokehouse curing',
  createdAt: '2026-08-19T17:23:53.888Z', currentAttemptId: '0002', attemptCount: 2, revisionCount: 1,
  reviewableAttemptId: null, costUsd: 0.74, durationMs: 1, mock: false, autoRevise: true,
  subjectRegister: null, subjectStyle: null, batch: { id: 'date:2026-08-19', label: 'Unbatched · 19 Aug' },
  yourRead: { boardVerdict: 'approve-board', taste: 'delightful' },
  published: { publishedAs: 'the-curing-room.json', publishedId: 'asto-the-curing-room', at: 'x', date: '2026-09-19' },
  machine: { validator: { clear: 4, total: 4 }, solver: 'clear', testPlayer: { gated: 0 }, unity: 'strong' },
  inProcess: null, ...over,
});
const state = { filter: 'all', groupBy: 'batch', query: '', collapsed: new Set() };

test('filter chips carry their counts and mark the active one', () => {
  const html = filterChips({ all: 145, awaiting: 4, running: 0, approved: 61, published: 34, rejected: 41, failed: 12, mockVerify: 27, archived: 0 }, 'awaiting');
  assert.match(html, /data-filter="all"[^>]*>All<span[^>]*>145/);
  assert.match(html, /data-filter="awaiting"[^>]*aria-pressed="true"/);
  assert.match(html, /Mock &amp; verify<span[^>]*>27/);
  assert.doesNotMatch(html, /data-filter="archived"/, 'archived appears only once there is something archived');
  assert.match(filterChips({ all: 1, awaiting: 0, running: 0, approved: 0, published: 0, rejected: 0, failed: 0, mockVerify: 0, archived: 3 }, 'all'), /data-filter="archived"/);
});

test('the group control names its three groupings', () => {
  const html = groupControl('date');
  assert.match(html, /data-group="batch"/);
  assert.match(html, /data-group="date"[^>]*aria-pressed="true"/);
  assert.match(html, /data-group="status"/);
});

test('a row shows the published date on its status, attempts, cost, chips and your read', () => {
  const html = runRow(run());
  assert.match(html, /status-approved[^>]*>published · 19 Sep/);
  assert.match(html, />2</); // attempts
  assert.match(html, /\$0\.74/);
  assert.match(html, /4\/4/);
  assert.match(html, /delightful/);
  assert.match(html, /href="#\/runs\/2026-08-19T17-23-53\.888Z-smokehouse-curing"/);
});

test('a failed row with a reviewable attempt says so under the title, and offers Review', () => {
  const html = runRow(run({ status: 'failed', published: null, reviewableAttemptId: '0001', yourRead: null }));
  assert.match(html, /attempt 0001 is reviewable/);
  assert.match(html, /Review/);
});

test('machine chips fall back honestly', () => {
  assert.match(machineChipsHtml(null), /no machine read/);
  assert.match(machineChipsHtml({ validator: { clear: 3, total: 4 }, solver: 'flag', testPlayer: null, unity: null }), /3\/4[^]*?flag/);
});

test('your read is a dash until you have said something', () => {
  assert.equal(yourReadChip(null), '<span class="studio-muted">—</span>');
  assert.match(yourReadChip({ boardVerdict: 'reject-board', taste: null }), /not publishable/);
  assert.match(yourReadChip({ boardVerdict: null, taste: 'flat' }), /flat/);
});

test('the table groups by batch with a header carrying yield and spend, and honours the filter and search', () => {
  const runs = [
    run(),
    run({ runId: '2026-08-19T16-12-58.697Z-vintage-postcards', theme: 'vintage postcards', status: 'rejected', published: null, costUsd: 0.54, yourRead: { boardVerdict: 'reject-board', taste: 'flat' } }),
    run({ runId: '2026-08-11T10-00-00.000Z-verify-form', theme: 'verify form', status: 'rejected', mock: true, published: null, batch: { id: 'date:2026-08-11', label: 'Unbatched · 11 Aug' } }),
  ];
  const html = runsHtml(runs, state);
  assert.match(html, /Unbatched · 19 Aug[^]*?2 runs · 1 approved · 1 rejected[^]*?\$1\.28/);
  assert.match(html, /Unbatched · 11 Aug/);
  const filtered = runsHtml(runs, { ...state, filter: 'rejected', query: 'postcards' });
  assert.match(filtered, /vintage postcards/);
  assert.doesNotMatch(filtered, /smokehouse/);
  assert.doesNotMatch(filtered, /verify form/);
});

test('a collapsed group shows only its header and a Show button', () => {
  const html = runsHtml([run()], { ...state, collapsed: new Set(['date:2026-08-19']) });
  assert.match(html, /data-act="expand"[^>]*data-group-key="date:2026-08-19"/);
  assert.doesNotMatch(html, /href="#\/runs\//);
});

test('a publish record without a date borrows the calendar\'s, by slug', () => {
  const old = run({ published: { publishedAs: 'the-curing-room.json', publishedId: 'asto-the-curing-room', at: 'x', date: null } });
  const dates = new Map([['the-curing-room', '2026-09-19']]);
  assert.match(runRow(old, dates), /published · 19 Sep/);
  assert.match(runRow(old), /status-published[^>]*>published</);
  assert.match(runsHtml([old], state, { dates }), /published · 19 Sep/);
});
