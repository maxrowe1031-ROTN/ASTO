// The survey's decision half, tested headlessly. Importing the module in node is itself
// an assertion (it must load with no DOM — the constructor is where the DOM is touched),
// and the two message functions are what keep the status line from ever looking frozen.
//
// The bugs these pin down, both from playtest feedback:
//   1. (2026-09-05) Send returned silently on an empty box, so players who tapped their
//      ratings and pressed Send saw nothing and concluded nothing had been captured.
//   2. (2026-09-05, same day) The first fix said a fixed "Thanks — got it." on every
//      tap, so the SECOND tap repainted an identical string — the line looked frozen and
//      the tap looked ignored. The same invisibility, one layer in.

import test from 'node:test';
import assert from 'node:assert/strict';

import { acknowledge, ratingAck, QUESTIONS } from '../src/view/survey-view.js';

test('the module is import-safe with no DOM', () => {
  assert.equal(typeof acknowledge, 'function');
  assert.equal(typeof ratingAck, 'function');
});

// --- what a tapped dot says ---

test('a tap names the question and the value, so it reads as a receipt', () => {
  const said = ratingAck({ label: 'Difficulty', value: 3, answered: 1, total: 3 });
  assert.match(said, /Difficulty/);
  assert.match(said, /3/);
});

test('consecutive taps on DIFFERENT questions never repaint the same string', () => {
  const first = ratingAck({ label: 'Difficulty', value: 3, answered: 1, total: 3 });
  const second = ratingAck({ label: 'Delight', value: 3, answered: 2, total: 3 });
  assert.notEqual(first, second, 'the second tap must visibly change the line');
});

test('changing your mind on the SAME question also changes the line', () => {
  const before = ratingAck({ label: 'Fairness', value: 4, answered: 1, total: 3 });
  const after = ratingAck({ label: 'Fairness', value: 2, answered: 1, total: 3 });
  assert.notEqual(before, after, 'a corrected answer must look recorded too');
});

test('no two distinct answers anywhere in the survey produce the same message', () => {
  const seen = new Map();
  for (const { label } of QUESTIONS) {
    for (const value of [1, 2, 3, 4]) {
      // answered is held fixed: the label and value alone must carry the difference,
      // because a player can re-tap one row without the count ever moving.
      const said = ratingAck({ label, value, answered: 1, total: 3 });
      assert.ok(!seen.has(said), `collision: ${label} ${value} reads like ${seen.get(said)}`);
      seen.set(said, `${label} ${value}`);
    }
  }
  assert.equal(seen.size, QUESTIONS.length * 4);
});

test('the last answer earns a completion beat, and earlier ones do not', () => {
  const partway = ratingAck({ label: 'Delight', value: 2, answered: 2, total: 3 });
  const done = ratingAck({ label: 'Fairness', value: 2, answered: 3, total: 3 });
  assert.ok(!/all three/.test(partway), 'must not claim completion at two of three');
  assert.match(done, /all three/);
});

test('the "all three" copy stays true: the survey really does ask three questions', () => {
  // If a question is ever added or removed, this fails before the copy becomes a lie.
  assert.equal(QUESTIONS.length, 3);
});

// --- what Send says ---

test('a note is acknowledged as a note', () => {
  assert.equal(acknowledge({ hasNote: true, ratingCount: 0 }), 'Thanks for the note.');
  assert.equal(acknowledge({ hasNote: true, ratingCount: 3 }), 'Thanks for the note.');
});

test('an empty box with ratings given says the ratings are in — the reported confusion', () => {
  assert.equal(acknowledge({ hasNote: false, ratingCount: 2 }), 'Thanks — your ratings are in.');
  assert.equal(acknowledge({ hasNote: false, ratingCount: 3 }), 'Thanks — your ratings are in.');
});

test('one rating is reported in the singular', () => {
  assert.equal(acknowledge({ hasNote: false, ratingCount: 1 }), 'Thanks — your rating is in.');
});

test('an empty box and nothing rated asks for something, rather than thanking for nothing', () => {
  const said = acknowledge({ hasNote: false, ratingCount: 0 });
  assert.equal(said, 'Tap a number above, or add a note.');
  assert.ok(!/thank/i.test(said), 'nothing was captured, so it must not claim otherwise');
});

test('no branch of either function answers with silence', () => {
  for (const hasNote of [true, false]) {
    for (const ratingCount of [0, 1, 2, 3]) {
      const said = acknowledge({ hasNote, ratingCount });
      assert.ok(said.trim().length > 0, `silent Send: note=${hasNote} count=${ratingCount}`);
    }
  }
  for (const { label } of QUESTIONS) {
    for (const value of [1, 2, 3, 4]) {
      for (const answered of [1, 2, 3]) {
        const said = ratingAck({ label, value, answered, total: 3 });
        assert.ok(said.trim().length > 0, `silent tap: ${label} ${value}`);
      }
    }
  }
});
