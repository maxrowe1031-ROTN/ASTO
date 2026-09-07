// fit-text: a long word steps its font size down only as far as it must, and never
// below the floor. The chooser is pure; fitTerm is driven with a fake element and a
// fake measurer — style.fontSize and style.whiteSpace are the whole element contract.

import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSize, fitTerm } from '../src/view/fit-text.js';

test('chooseSize returns the largest size that fits', () => {
  const fits = (size) => size <= 12;
  assert.equal(chooseSize({ fits, max: 14, min: 10 }), 12);
});

test('chooseSize returns max when max fits, and never measures smaller sizes', () => {
  const asked = [];
  const size = chooseSize({ fits: (s) => (asked.push(s), true), max: 14, min: 10 });
  assert.equal(size, 14);
  assert.deepEqual(asked, [14]);
});

test('chooseSize returns min when nothing fits', () => {
  assert.equal(chooseSize({ fits: () => false, max: 14, min: 10 }), 10);
});

// widthAt(size) -> the text's single-line width at that font size; the box is 74px.
function fake(widthAt) {
  const el = { style: { fontSize: '', whiteSpace: '' } };
  const measure = (e) => ({ text: widthAt(Number.parseFloat(e.style.fontSize) || 14), box: 74 });
  return { el, measure };
}

test('fitTerm leaves the inline size empty when the word fits at the default', () => {
  const { el, measure } = fake(() => 60);
  assert.equal(fitTerm(el, { max: 14, min: 10, measure }), 14);
  assert.equal(el.style.fontSize, '');
});

test('fitTerm steps down to the largest size that fits', () => {
  // 6.5px per size unit: fits at 11 (71.5) but not at 12 (78).
  const { el, measure } = fake((size) => size * 6.5);
  assert.equal(fitTerm(el, { max: 14, min: 10, measure }), 11);
  assert.equal(el.style.fontSize, '11px');
});

test('fitTerm stops at the floor and leaves wrapping to the stylesheet', () => {
  const { el, measure } = fake((size) => size * 9);
  assert.equal(fitTerm(el, { max: 14, min: 10, measure }), 10);
  assert.equal(el.style.fontSize, '10px');
});

test('fitTerm reads the box in the element\'s own white-space, the text on one line, and restores it', () => {
  const { el, measure } = fake(() => 60);
  el.style.whiteSpace = 'normal';
  const seen = [];
  fitTerm(el, { max: 14, min: 10, measure: (e) => (seen.push(e.style.whiteSpace), measure(e)) });
  assert.deepEqual(seen, ['normal', 'nowrap']);
  assert.equal(el.style.whiteSpace, 'normal');
});

test('fitTerm takes the box from the default size, not from a shrunken one', () => {
  // A box that (wrongly) reports wider once the text is on one line must not fool it.
  const el = { style: { fontSize: '', whiteSpace: '' } };
  const measure = (e) => ({
    text: (Number.parseFloat(e.style.fontSize) || 14) * 6.5,
    box: e.style.whiteSpace === 'nowrap' ? 200 : 74
  });
  assert.equal(fitTerm(el, { max: 14, min: 10, measure }), 11);
});

test('fitTerm refits from the top when a word is replaced by a shorter one', () => {
  const { el } = fake(() => 0);
  let width = (size) => size * 9;
  const measure = (e) => ({ text: width(Number.parseFloat(e.style.fontSize) || 14), box: 74 });
  fitTerm(el, { max: 14, min: 10, measure });
  assert.equal(el.style.fontSize, '10px');
  width = () => 40;
  fitTerm(el, { max: 14, min: 10, measure });
  assert.equal(el.style.fontSize, '');
});
