// Definitions Author (design.md D-33) — one plain definition for EVERY board
// word, for Learning Mode: press Vocab, tap a tile, read what it means.
//
// This is the glossary author's sibling with the leak rule deliberately
// relaxed (Max, 2026-09-05): Learning Mode is an easy mode by intent, so a
// definition may say what a thing does. The one-word gloss stage 09 writes
// keeps D-18's full leak check and is what the default game reveals. What is
// enforced here mechanically is completeness — every word once, nothing extra,
// nothing empty — and a soft steer in the prompt not to spell out pairings.

import { JSON_ONLY, asJsonBlock, composePrompt, parseJson, validateAgainst } from './agent-kit.js';

export const id = 'definitions-author';
export const stageId = '10-definitions-author';

const MAX_DEFINITION_LENGTH = 160;

const SCHEMA = {
  type: 'object',
  required: ['definitions'],
  properties: {
    definitions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['word', 'definition'],
        properties: {
          word: { type: 'string', minLength: 1 },
          definition: { type: 'string', minLength: 1, maxLength: MAX_DEFINITION_LENGTH },
        },
      },
    },
  },
};

export function getOutputSchema() {
  return SCHEMA;
}

const wordsOf = (board) => (board?.sets ?? []).flatMap((set) => (set.pairs ?? []).flat());

export function buildPrompt(input = {}, context) {
  const { board = null } = input;
  const words = wordsOf(board);

  return composePrompt({
    role:
      'You are the Definitions Author for ASTO, a cozy word-analogy puzzle. In Learning Mode a ' +
      'player can tap any tile to read what the word means. You write those definitions — one for ' +
      'each of the sixteen words on the board.',
    context,
    task: [
      'Write exactly sixteen definitions, one per board word, every word once and no others.',
      'Each definition says what the thing IS, as a friend would put it. It may say what it does or what it is for — plain and useful beats careful here.',
      'Do not spell out the puzzle: never say which board words pair up, go together, or belong with each other, and never quote a relationship label. Define the word, not the analogy.',
      `Keep each under ${MAX_DEFINITION_LENGTH} characters. Warm, plain, no dictionary-ese.`,
      'Match each word exactly as it appears on the board.',
    ].join('\n'),
    data: [
      asJsonBlock('The board', board),
      `The sixteen words to define:\n${words.map((word) => `  - ${word}`).join('\n')}`,
    ].join('\n\n'),
    outputRules: [
      'Return { "definitions": [ { "word", "definition" } ] } with EXACTLY sixteen entries.',
      JSON_ONLY,
    ].join(' '),
  });
}

export function parse(text) {
  return parseJson(text);
}

/**
 * Every board word exactly once, nothing else. Called without input it checks
 * shape only, like every agent in the registry.
 */
const everyWordOnce = (output, board) => {
  if (!board) return [];
  const expected = new Map(wordsOf(board).map((word) => [word.toLowerCase(), word]));
  const seen = new Set();
  const errors = [];
  for (const entry of output.definitions) {
    const key = entry.word?.toLowerCase();
    if (!expected.has(key)) {
      errors.push({ path: 'definitions', message: `"${entry.word}" is not one of the sixteen board words` });
      continue;
    }
    if (seen.has(key)) {
      errors.push({ path: 'definitions', message: `"${entry.word}" is defined twice` });
    }
    seen.add(key);
  }
  for (const [key, word] of expected) {
    if (!seen.has(key)) {
      errors.push({ path: 'definitions', message: `"${word}" has no definition — every board word needs one` });
    }
  }
  return errors;
};

/** The schema checker reads shape, not length; the footnote has one line to give. */
const withinLength = (output) =>
  output.definitions
    .filter((entry) => (entry.definition ?? '').length > MAX_DEFINITION_LENGTH)
    .map((entry) => ({
      path: 'definitions',
      message: `the definition of "${entry.word}" runs past ${MAX_DEFINITION_LENGTH} characters`,
    }));

export function validateOutput(output, { input = null } = {}) {
  return validateAgainst(output, SCHEMA, [
    withinLength,
    (value) => everyWordOnce(value, input?.board ?? null),
  ]);
}
