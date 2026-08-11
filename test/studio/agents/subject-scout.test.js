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
