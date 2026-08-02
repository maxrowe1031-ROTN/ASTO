// The agent registry — the one place the eight modules are named.
//
// pipeline.js resolves agents through here rather than importing them
// individually, so adding or renaming an agent is a change in exactly two
// places: the stage registry and this map.

import * as pairAuthor from './pair-author.js';
import * as themeGrouper from './theme-grouper.js';
import * as difficultyRater from './difficulty-rater.js';
import * as boardBuilder from './board-builder.js';
import * as analogyValidator from './analogy-validator.js';
import * as adversarialSolver from './adversarial-solver.js';
import * as testPlayer from './test-player.js';
import * as styleGuide from './style-guide.js';

export const AGENTS = Object.freeze({
  'pair-author': pairAuthor,
  'theme-grouper': themeGrouper,
  'difficulty-rater': difficultyRater,
  'board-builder': boardBuilder,
  'analogy-validator': analogyValidator,
  'adversarial-solver': adversarialSolver,
  'test-player': testPlayer,
  'style-guide': styleGuide,
});

export function loadAgent(agentId) {
  const agent = AGENTS[agentId];
  if (!agent) throw new Error(`unknown agent: ${agentId}`);
  return agent;
}
