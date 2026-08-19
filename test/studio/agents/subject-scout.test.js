// The scout's creative ask, pinned where it has drifted in practice.
//
// Batch two titled 6/6 subjects "the …" — D-15's tone-rut trigger, fired twice.
// The fix is a form-variety requirement in the prompt; these tests pin that the
// ask is actually made (an instruction can drift out of a prompt as silently as
// it drifted in — see style-guide.test.js for the same discipline).

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPrompt } from '../../../studio/agents/subject-scout.js';
import { REGISTERS } from '../../../studio/corpus/registers.js';

// The five tests that stood here pinned the D-15 and D-17 amendment PROSE:
// "'the <thing>' must not be the reflex", "cozy everyday places are this
// game's HOME REGISTER", and the keyed-off-the-recent-list phrasing of both.
//
// They are replaced rather than deleted because the prose they guarded was
// measured and did not work (design.md D-15 second amendment, 2026-08-18):
// across the 31 scout picks made while every one of those lines was in the
// prompt, 74% still opened "the <thing>" (7% in the era before the scout) and
// proper nouns appeared ZERO times (17% before). A test can only hold a
// prompt's WORDING; it could never have caught that the wording was ignored.
// What replaces them asserts the mechanism that did hold under measurement —
// the caller-assigned register — plus the shape ask that survives in short form.

test('the assigned register carries its own ask into the prompt, for both styles', () => {
  for (const style of ['world', 'lens']) {
    for (const register of REGISTERS) {
      const prompt = buildPrompt({ used: [], style, register: register.id });
      assert.match(prompt, /Register for THIS pick/, `${register.id}/${style} lost its register ask`);
      assert.ok(prompt.includes(register.ask), `${register.id}/${style} did not carry its own words`);
    }
  }
});

test('the registers that exist to widen the map name what Max asked for', () => {
  // His D-17 words: "a tropical island, or mars, or egypt... or harry potter,
  // or the yankees". Prose asking for these produced none in 31 picks; now each
  // is a register the rotation must eventually assign.
  const all = REGISTERS.map((r) => `${r.id} ${r.label} ${r.ask}`).join(' ').toLowerCase();
  assert.match(all, /marrakech|lisbon|desert|polar/, 'far places');
  assert.match(all, /myth|folklore|ancient/, 'history and myth');
  assert.match(all, /fantasy|wizard|superhero|sci-fi|science fiction/, 'fiction and fandom');
  assert.match(all, /baseball|sport|climbing/, 'sport');
  assert.match(all, /mars|starship|space/, 'space — the literal "or mars" of his ask');
});

test('an unknown or missing register falls back to a real one rather than breaking the prompt', () => {
  // A run created before this axis existed, or against a retired id, must still
  // produce a usable prompt — run creation may never wedge on the scout.
  for (const register of [undefined, null, 'a-register-that-was-retired']) {
    const prompt = buildPrompt({ used: [], style: 'world', register });
    assert.match(prompt, /Register for THIS pick/);
  }
});

test('the shape ask survives in short form, both styles', () => {
  for (const style of ['world', 'lens']) {
    const prompt = buildPrompt({ used: [], style, register: REGISTERS[0].id });
    assert.match(prompt, /gerund/i, `${style} prompt should still name gerunds`);
    assert.match(prompt, /bare noun/i, `${style} prompt should still name bare noun phrases`);
  }
});
