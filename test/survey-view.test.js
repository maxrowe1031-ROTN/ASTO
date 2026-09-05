// The survey's decision half, tested headlessly. Importing the module in node is itself
// an assertion (it must load with no DOM — the constructor is where the DOM is touched),
// and acknowledge() is the rule that keeps Send from ever doing nothing.
//
// The bug this pins down (2026-09-05, from playtest feedback): Send used to return
// silently on an empty box, so players who tapped their ratings and pressed Send saw
// nothing happen and concluded nothing had been captured. It had been — one post per
// tap — but the UI never said so.

import test from 'node:test';
import assert from 'node:assert/strict';

import { acknowledge, RATING_ACK, QUESTIONS } from '../src/view/survey-view.js';

test('the module is import-safe with no DOM', () => {
  assert.equal(typeof acknowledge, 'function');
  assert.equal(QUESTIONS.length, 3);
});

test('a note is acknowledged as a note', () => {
  assert.equal(acknowledge({ hasNote: true, hasRating: false }), 'Thanks for the note.');
  assert.equal(acknowledge({ hasNote: true, hasRating: true }), 'Thanks for the note.');
});

test('an empty box with ratings given says the ratings are in — the reported confusion', () => {
  const said = acknowledge({ hasNote: false, hasRating: true });
  assert.equal(said, 'Thanks — your ratings are in.');
  assert.notEqual(said, '', 'Send must never answer with silence');
});

test('an empty box and nothing rated asks for something, rather than thanking for nothing', () => {
  const said = acknowledge({ hasNote: false, hasRating: false });
  assert.equal(said, 'Tap a number above, or add a note.');
  assert.ok(!/thank/i.test(said), 'nothing was captured, so it must not claim otherwise');
});

test('every branch answers with something the status line can show', () => {
  for (const hasNote of [true, false]) {
    for (const hasRating of [true, false]) {
      const said = acknowledge({ hasNote, hasRating });
      assert.equal(typeof said, 'string');
      assert.ok(said.trim().length > 0, `silent branch: note=${hasNote} rating=${hasRating}`);
    }
  }
});

test('a tapped dot has its own acknowledgement, distinct from the Send replies', () => {
  assert.ok(RATING_ACK.trim().length > 0);
  const sendReplies = [
    acknowledge({ hasNote: true, hasRating: true }),
    acknowledge({ hasNote: false, hasRating: true }),
    acknowledge({ hasNote: false, hasRating: false })
  ];
  assert.ok(!sendReplies.includes(RATING_ACK), 'a tap and a Send should not read identically');
});
