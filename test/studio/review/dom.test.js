// The Studio's small formatting helpers, shared by every screen (D-35).

import test from 'node:test';
import assert from 'node:assert/strict';

import { dayLabel, elapsed, escape, money, shortDate } from '../../../studio/review/ui/dom.js';

test('escape neutralises the four characters that matter inside markup', () => {
  assert.equal(escape('a<b>&"c"'), 'a&lt;b&gt;&amp;&quot;c&quot;');
  assert.equal(escape(null), '');
  assert.equal(escape(12), '12');
});

test('money formats dollars to cents and says nothing for nothing', () => {
  assert.equal(money(0.6123), '$0.61');
  assert.equal(money(0), '$0.00');
  assert.equal(money(null), '—');
  assert.equal(money(undefined), '—');
});

test('elapsed reads like a stopwatch', () => {
  assert.equal(elapsed(58000), '58s');
  assert.equal(elapsed(232000), '3m 52s');
  assert.equal(elapsed(3725000), '1h 2m');
  assert.equal(elapsed(null), '—');
});

test('a day label is Today, then weekday and day-of-month', () => {
  assert.equal(dayLabel('2026-09-08', '2026-09-08'), 'Today');
  assert.equal(dayLabel('2026-09-09', '2026-09-08'), 'Wed 9');
  assert.equal(dayLabel('2026-09-19', '2026-09-08'), 'Sat 19');
  assert.equal(dayLabel('2026-09-20', '2026-09-08'), 'Sun 20');
});

test('a short date is day and month, from a date key or an ISO instant', () => {
  assert.equal(shortDate('2026-09-19'), '19 Sep');
  assert.equal(shortDate('2026-08-19T16:12:58.697Z'), '19 Aug');
  assert.equal(shortDate(null), '—');
});
