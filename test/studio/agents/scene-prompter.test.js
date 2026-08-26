// The Scene Prompter (design.md D-31) — authors the image prompt for one
// register in one state.
//
// The whole agent exists because the band is a hostile canvas: 375×60 is
// 6.25:1, no image API emits that aspect, and Mochi has to be IN the scene
// (D-31) rather than composited over it. So the prompt has to do three jobs at
// once — describe a place, keep Mochi on-model, and force a composition that
// survives a crop to a letterbox. The semantic checks below are the mechanical
// half of that: D-7's lesson is that an instruction is only a request, so
// anything load-bearing is validated as well as asked for.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as prompter from '../../../studio/agents/scene-prompter.js';

const input = {
  register: {
    id: 'kitchens-food',
    label: 'kitchens, bakeries & food',
    ask: 'Register for THIS pick: FOOD AND ITS PLACES — a kitchen, a bakery, a cuisine.',
  },
  state: 'idle',
};

const validate = (output) => prompter.validateOutput(output, { input });

const good = () => ({
  scene: {
    register: 'kitchens-food',
    state: 'idle',
    prompt:
      'A wide horizontal band scene of a village bakery at dawn. Mochi, a small white cat ' +
      'with a red scarf, sits on the counter beside a coffee mug, looking content. Warm light ' +
      'from the left, empty pale sky filling the upper third, dark counter line running the ' +
      'full width. Clean 2D mascot illustration, flat colour, minimal shading, soft linework.',
    composition:
      'Content confined to a horizontal band through the vertical centre; empty sky above and ' +
      'plain ground below so the frame can be cropped to a letterbox without losing anything.',
    clearSide: 'right',
    mochiPose: 'sitting',
  },
});

// --- the prompt the agent SENDS -------------------------------------------

test('the prompt carries the register, the state, and Mochi identity', () => {
  const text = prompter.buildPrompt(input, {});
  assert.match(text, /kitchens, bakeries & food/);
  assert.match(text, /idle/i);
  assert.match(text, /white cat/i);
  assert.match(text, /red scarf/i);
});

test('the prompt states the band constraint in numbers, not adjectives', () => {
  const text = prompter.buildPrompt(input, {});
  assert.match(text, /375/);
  assert.match(text, /60/);
  assert.match(text, /6\.25:1|letterbox/i);
});

test('the prompt forbids the things Max\'s brief forbids', () => {
  const text = prompter.buildPrompt(input, {});
  assert.match(text, /tabby|stripes/i);
  assert.match(text, /photoreal|realistic/i);
});

test('each state asks for a different Mochi mood', () => {
  const idle = prompter.buildPrompt({ ...input, state: 'idle' }, {});
  const miss = prompter.buildPrompt({ ...input, state: 'miss' }, {});
  const solved = prompter.buildPrompt({ ...input, state: 'solved' }, {});
  assert.notEqual(idle, miss);
  assert.notEqual(miss, solved);
  assert.match(miss, /disappoint|droop|slump|wince/i);
  assert.match(solved, /celebrat|delight|proud|joy/i);
});

test('an unknown state is refused rather than silently prompted', () => {
  assert.throws(() => prompter.buildPrompt({ ...input, state: 'smug' }, {}), /state/i);
});

// --- the output the agent PARSES ------------------------------------------

test('a well-formed scene validates', () => {
  const result = validate(good());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('the scene must echo the register and state it was asked for', () => {
  const wrongRegister = good();
  wrongRegister.scene.register = 'landscapes';
  assert.equal(validate(wrongRegister).ok, false);

  const wrongState = good();
  wrongState.scene.state = 'solved';
  assert.equal(validate(wrongState).ok, false);
});

test('a prompt that never mentions Mochi is refused — D-31 puts Mochi IN the scene', () => {
  const output = good();
  output.scene.prompt = output.scene.prompt.replace(/Mochi[^.]*\./, 'The bakery is quiet.');
  const result = validate(output);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /mochi/i);
});

test('a prompt that drops the red scarf is refused — it is the signature', () => {
  const output = good();
  output.scene.prompt = output.scene.prompt.replace('with a red scarf', 'with green eyes');
  const result = validate(output);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /scarf/i);
});

test('clearSide must be left or right — the status strip has to live somewhere', () => {
  const output = good();
  output.scene.clearSide = 'middle';
  assert.equal(validate(output).ok, false);
});

test('a prompt too short to carry a composition is refused', () => {
  const output = good();
  output.scene.prompt = 'A bakery with Mochi in a red scarf.';
  assert.equal(validate(output).ok, false);
});

// --- parsing ---------------------------------------------------------------

test('parse pulls the object out of a fenced reply', () => {
  const fenced = '```json\n' + JSON.stringify(good()) + '\n```';
  const parsed = prompter.parse(fenced);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.scene.register, 'kitchens-food');
});

test('parse fails cleanly on prose', () => {
  assert.equal(prompter.parse('Here is a lovely bakery!').ok, false);
});

// --- purity ----------------------------------------------------------------

test('the module is pure — no fetch, no fs, no globals', () => {
  const source = prompter.buildPrompt(input, {});
  assert.equal(typeof source, 'string');
  assert.equal(prompter.id, 'scene-prompter');
  assert.equal(prompter.stageId, '01-scene-prompter');
});
