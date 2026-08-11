// The scout's creative ask, pinned where it has drifted in practice.
//
// Batch two titled 6/6 subjects "the …" — D-15's tone-rut trigger, fired twice.
// The fix is a form-variety requirement in the prompt; these tests pin that the
// ask is actually made (an instruction can drift out of a prompt as silently as
// it drifted in — see style-guide.test.js for the same discipline).

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPrompt } from '../../../studio/agents/subject-scout.js';

test('the prompt asks for grammatical variety in the subject shape', () => {
  const prompt = buildPrompt({ used: [], style: 'world' });
  assert.match(prompt, /vary the grammatical shape/i);
  assert.match(prompt, /"the \S+.*must not be the reflex/i);
});

test('the variety ask names concrete alternative shapes, both styles', () => {
  for (const style of ['world', 'lens']) {
    const prompt = buildPrompt({ used: [], style });
    assert.match(prompt, /gerund/i, `${style} prompt should name gerunds`);
    assert.match(prompt, /bare noun/i, `${style} prompt should name bare noun phrases`);
  }
});

test('the anti-rut rule points at the used list, where the rut is visible', () => {
  const prompt = buildPrompt({ used: ['the harvest moon', 'the night train'], style: 'lens' });
  assert.match(prompt, /most recent subjects.*already.*"the/i);
});

// Territory variety (D-17 amendment, 2026-08-11). Grammar variety worked and
// Max named the deeper rut on batch four: every subject was a cozy commonplace
// place. His ask — "we haven't seen anything like a tropical island, or mars,
// or egypt… or harry potter, or the yankees. a large variety and mix is key."
test('the prompt names the territories beyond the cozy home register', () => {
  const prompt = buildPrompt({ used: [], style: 'world' });
  assert.match(prompt, /home register/i);
  assert.match(prompt, /far places|history|myth/i);
  assert.match(prompt, /fiction|fandom/i);
  assert.match(prompt, /sport|pop culture/i);
});

test('the territory rule is keyed off the recent register, like the shape rule', () => {
  const prompt = buildPrompt({ used: ['mending nets', 'sunday morning market'], style: 'lens' });
  assert.match(prompt, /recent subjects.*(one register|same register)/i);
});

test('both styles carry the territory ask', () => {
  for (const style of ['world', 'lens']) {
    assert.match(buildPrompt({ used: [], style }), /home register/i, style);
  }
});
