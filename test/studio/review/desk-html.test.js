// The Desk's string builders (D-35). Pure: a model in, markup out.

import test from 'node:test';
import assert from 'node:assert/strict';

import { deskHtml, launcherBody, launcherHtml, playersPanel, queueRows, runwayPanel, statTiles } from '../../../studio/review/ui/desk.js';

const TODAY = '2026-09-08';
const run = (over = {}) => ({
  runId: '2026-08-18T21-16-38.666Z-the-last-day-of-the-fair',
  status: 'awaiting-review', theme: 'the last day of the fair', createdAt: '2026-08-18T21:16:38.666Z',
  currentAttemptId: '0001', attemptCount: 1, revisionCount: 0, reviewableAttemptId: null,
  costUsd: 0.58, durationMs: 232000, mock: false, autoRevise: true, subjectRegister: 'landscapes', subjectStyle: 'lens',
  batch: { id: 'date:2026-08-18', label: 'Unbatched · 18 Aug' }, yourRead: null, published: null,
  machine: { validator: { clear: 4, total: 4 }, solver: 'clear', testPlayer: { gated: 1 }, unity: 'adequate' },
  inProcess: null, ...over,
});
const schedule = {
  today: { slug: 'the-locksmith-s-trade', title: "The Locksmith's Trade", date: TODAY },
  lastScheduled: '2026-09-19', queuedAhead: 11, runway: 12, gaps: [], datelessSlugs: [], nextFreeDate: '2026-09-20',
  entries: [
    { slug: 'the-locksmith-s-trade', title: "The Locksmith's Trade", date: TODAY },
    { slug: 'signs', title: 'Signs of the Turning Season', date: '2026-09-09' },
    { slug: 'curing', title: 'The Curing Room', date: '2026-09-19' },
  ],
};
const REGISTERS = [{ id: 'landscapes', label: 'landscapes' }];

test('the stat tiles say what is waiting, what is in flight, the runway and the spend', () => {
  // A manifest stuck on `running` with no process behind it is not in flight.
  const html = statTiles([run(), run({ status: 'running', inProcess: { running: true } }), run({ status: 'running', inProcess: { running: false } }), run({ status: 'approved', costUsd: 0.7, createdAt: '2026-09-07T10:00:00Z' })], schedule, TODAY);
  assert.match(html, /1<\/div>[^]*?boards? waiting for your read/);
  assert.match(html, /1<\/div>[^]*?runs? in flight/);
  assert.match(html, /12 days/);
  assert.match(html, /runs dry 19 Sep/);
  assert.match(html, /\$0\.70[^]*?spent this week/);
});

test('queue rows carry title, batch, cost, the machine chips and the two actions', () => {
  const html = queueRows([run()], REGISTERS);
  assert.match(html, /The Last Day Of The Fair|the last day of the fair/);
  assert.match(html, /Unbatched · 18 Aug · landscapes · attempt 0001 · \$0\.58/);
  assert.match(html, /validator 4\/4/);
  assert.match(html, /solver clear/);
  assert.match(html, /1 gated word/);
  assert.match(html, /unity adequate/);
  assert.match(html, /data-act="play"/);
  assert.match(html, /href="#\/runs\/2026-08-18T21-16-38\.666Z-the-last-day-of-the-fair"/);
});

test('a mock or verify run in the queue offers Archive, disabled until Phase C, instead of Play', () => {
  const html = queueRows([run({ mock: true, machine: null })], REGISTERS);
  assert.match(html, /data-act="archive"[^>]*disabled/);
  assert.match(html, /mock run · no machine read/);
  assert.doesNotMatch(html, /data-act="play"/);
});

test('a failed run with a reviewable attempt is in the queue and says which attempt', () => {
  const html = queueRows([run({ status: 'failed', reviewableAttemptId: '0001' })], REGISTERS);
  assert.match(html, /attempt 0001 is reviewable/);
});

test('an empty queue says so', () => {
  assert.match(queueRows([], REGISTERS), /Nothing waiting/);
});

test('the runway lists today, the queued days, the last day and the next free slots', () => {
  const html = runwayPanel(schedule, TODAY);
  assert.match(html, /Today[^]*?The Locksmith/);
  assert.match(html, /Wed 9[^]*?Signs of the Turning Season/);
  assert.match(html, /Sat 19[^]*?The Curing Room[^]*?last/);
  assert.match(html, /Sun 20[^]*?next free/);
  assert.match(html, /publish fills the next free day/);
});

test('the runway warns about a gap and a dry queue in plain words', () => {
  assert.match(runwayPanel({ ...schedule, gaps: ['2026-09-10'] }, TODAY), /1 dark day/);
  assert.match(runwayPanel({ ...schedule, today: null, runway: 0, entries: [], lastScheduled: null, queuedAhead: 0 }, TODAY), /NO BOARD today/);
});

test('the launcher offers the batch sizes and pair counts and labels its estimate as one', () => {
  const html = launcherHtml([run({ status: 'approved', costUsd: 0.6 }), run({ status: 'rejected', costUsd: 0.5 })]);
  assert.match(html, /data-count="6"[^>]*aria-pressed="true"/);
  assert.match(html, /data-pairs="14"[^>]*aria-pressed="true"/);
  assert.match(html, /≈ <strong>\$2\.64 – \$3\.96/);
  assert.match(html, /from the last 2 real runs/);
  assert.match(html, /Start 6 runs/);
  assert.match(html, /name="mock"/);
  assert.match(html, /name="autoRevise"[^>]*checked/);
});

test('the launcher body is what POST \/api\/runs accepts, one per requested board', () => {
  const bodies = launcherBody({ count: 3, themes: 'tide pools\n  \nletterpress', pairs: 14, mock: true, autoRevise: false });
  assert.deepEqual(bodies, [
    { theme: 'tide pools', count: 14, mock: true, autoRevise: false },
    { theme: 'letterpress', count: 14, mock: true, autoRevise: false },
    { theme: null, count: 14, mock: true, autoRevise: false },
  ]);
});

test('the players panel shows the counter when it answered and says so when it did not', () => {
  const plays = { totals: { starts: 12, finishes: 9, completionRate: 0.75, clients: 5, returningClients: 2 }, days: [], boards: [] };
  const ratings = [{ slug: 'a', players: 3, winRate: 1, ratings: { difficulty: { count: 3, average: 2.3 }, delight: { count: 3, average: 3.1 }, fairness: { count: 3, average: 3.4 } }, comments: [] }];
  const html = playersPanel(plays, ratings);
  assert.match(html, /12<\/div>[^]*?plays/);
  assert.match(html, /9<\/div>[^]*?finished/);
  assert.match(html, /2<\/div>[^]*?came back/);
  assert.match(html, /delight 3\.1/);
  assert.match(playersPanel(null, null), /not wired|unavailable/i);
});

test('the whole desk composes and carries the four sections', () => {
  const html = deskHtml({ runs: [run()], schedule, todayKey: TODAY, registers: REGISTERS, config: { effortProfile: 'p', pricingVersion: 'v' } });
  for (const id of ['stat-tiles', 'queue', 'launcher', 'runway', 'players']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /effort p · pricing v/);
});
