// The controller, driven headlessly: fake views that record what they were
// handed. It owns no rules — every assertion here is about ROUTING.

import test from 'node:test';
import assert from 'node:assert/strict';

import { GameController } from '../../src/controller/game-controller.js';
import { board } from '../fixtures/board.js';

const puzzle = {
  ...board,
  definitions: [{ word: 'Seed', definition: 'a plant starts from one' }]
};

function recorder() {
  const paints = [];
  return { paints, update: (state, outcome) => paints.push({ state, outcome }) };
}

const settle = (controller) => controller.queue;

test('a tile tap selects when the board is not armed', async () => {
  const view = recorder();
  const controller = new GameController(puzzle, [view], { rules: { learningMode: true }, rand: () => 0 });
  controller.tileTapped('Seed');
  await settle(controller);
  assert.deepEqual(controller.state.selectedTerms, ['Seed']);
  assert.deepEqual(controller.state.vocabRevealed, []);
});

test('a tile tap while armed defines the word and selects nothing', async () => {
  const view = recorder();
  const controller = new GameController(puzzle, [view], { rules: { learningMode: true }, rand: () => 0 });
  controller.vocabPressed();
  controller.tileTapped('Seed');
  await settle(controller);
  assert.deepEqual(controller.state.selectedTerms, []);
  assert.deepEqual(controller.state.vocabRevealed, ['Seed']);
  assert.equal(controller.state.vocabArmed, false);
  assert.deepEqual(view.paints.at(-1).outcome, { type: 'vocab' });
});

test('rulesChanged reaches the live game and survives a restart', async () => {
  const view = recorder();
  const controller = new GameController(puzzle, [view], { rules: {}, rand: () => 0 });
  controller.rulesChanged({ learningMode: true });
  await settle(controller);
  assert.equal(controller.state.rules.learningMode, true);

  controller.restart();
  await settle(controller);
  assert.equal(controller.state.rules.learningMode, true, 'restart keeps the changed rule');
});

test('turning learning mode off while armed disarms the board', async () => {
  const view = recorder();
  const controller = new GameController(puzzle, [view], { rules: { learningMode: true }, rand: () => 0 });
  controller.vocabPressed();
  controller.rulesChanged({ learningMode: false });
  await settle(controller);
  assert.equal(controller.state.vocabArmed, false);
});
