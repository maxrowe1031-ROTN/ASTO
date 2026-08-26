// art-run.js's argv parsing — the only logic the CLI adapter owns.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseArgv } from '../../studio/art-run.js';

test('prompt needs a register; states default to all three', () => {
  const options = parseArgv(['prompt', 'kitchens-food']);
  assert.equal(options.command, 'prompt');
  assert.equal(options.registerId, 'kitchens-food');
  assert.deepEqual(options.states, ['idle', 'miss', 'solved']);
  assert.equal(options.mock, false);

  assert.throws(() => parseArgv(['prompt']), /register/);
  assert.throws(() => parseArgv(['prompt', 'a', 'b']), /register/);
});

test('--state narrows to one state and rejects unknowns', () => {
  assert.deepEqual(parseArgv(['prompt', 'landscapes', '--state', 'miss']).states, ['miss']);
  assert.throws(() => parseArgv(['prompt', 'landscapes', '--state', 'smug']), /--state/);
});

test('collect takes --focus-y between 0 and 1', () => {
  assert.equal(parseArgv(['collect']).focusY, 0.5);
  assert.equal(parseArgv(['collect', '--focus-y', '0.3']).focusY, 0.3);
  assert.throws(() => parseArgv(['collect', '--focus-y', '2']), /focus-y/);
  assert.throws(() => parseArgv(['collect', 'extra']), /positional/);
});

test('an unknown command is refused with usage', () => {
  assert.throws(() => parseArgv(['deploy']), /usage/);
  assert.throws(() => parseArgv([]), /usage/);
});
