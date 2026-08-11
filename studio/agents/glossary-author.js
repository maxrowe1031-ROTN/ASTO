// Glossary Author (design.md D-18) — writes the ONE definition the Vocabulary
// button reveals, or declines when the board is open.
//
// The leak is the whole risk: a dictionary gloss of a trade noun usually states
// the noun's FUNCTION, and the function is usually the set's relationship
// ("buttonhook: a tool for pulling buttons through boots" hands over the
// enabling set). So the definition says what the thing IS, and the rules live
// here AND in the validator — D-7's lesson, an instruction is a request. The
// mechanical half of the leak check: a definition may not contain any other
// board word.
//
// Candidates come from 07's knowledgeGated report — the agent whose job is
// naming the words a general player cannot place. No gated words, no glossary:
// an open board needs no footnote (the greenhouse case, 2026-08-11).

import { JSON_ONLY, asJsonBlock, composePrompt, parseJson, validateAgainst } from './agent-kit.js';

export const id = 'glossary-author';
export const stageId = '09-glossary-author';

const MAX_DEFINITION_LENGTH = 160;

const SCHEMA = {
  type: 'object',
  required: ['glossary'],
  properties: {
    glossary: {
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

export function buildPrompt(input = {}, context) {
  const { board = null, knowledgeGated = [] } = input;

  return composePrompt({
    role:
      'You are the Glossary Author for ASTO, a cozy word-analogy puzzle. When a board carries a word ' +
      'that walls out a general player, the game offers ONE definition — the Vocabulary button. You ' +
      'write that definition, or decline when no word needs one.',
    context,
    task: [
      'From the flagged words below, pick THE hardest — the one a curious outsider is least able to place — and write its definition. Return at most one entry; an empty glossary is a real answer and the right one when the flags are weak.',
      'The definition says what the thing IS — a plain noun-phrase gloss, as a friend would say it.',
      'It must NEVER state what the word is FOR in relation to the board: no naming the action it enables, the thing it belongs to, or the word it pairs with. The relationship is the puzzle; a definition that restates it solves a set from the footnote.',
      'Never use any other board word inside the definition — not even casually. That is checked mechanically.',
      `Keep it under ${MAX_DEFINITION_LENGTH} characters. Warm, plain, no dictionary-ese.`,
      'The full board is shown so you know which relationships must not leak — read it to avoid them, never to explain them.',
    ].join('\n'),
    data: [
      asJsonBlock('The board', board),
      knowledgeGated.length > 0
        ? `Words 07 flagged as knowledge-gated (word — what a player would need to know):\n${knowledgeGated
            .map((entry) => `  - ${entry.word} — ${entry.note}`)
            .join('\n')}`
        : 'No words were flagged as knowledge-gated. The board is open; return an empty glossary.',
    ].join('\n\n'),
    outputRules: [
      'Return { "glossary": [ { "word", "definition" } ] } with AT MOST ONE entry, or { "glossary": [] }.',
      JSON_ONLY,
    ].join(' '),
  });
}

export function parse(text) {
  return parseJson(text);
}

const wordsOf = (board) => (board?.sets ?? []).flatMap((set) => (set.pairs ?? []).flat());

/** At most one entry — the button defines one word (D-18's chosen scope). */
const atMostOne = (output) =>
  output.glossary.length > 1
    ? [{ path: 'glossary', message: `at most one entry — received ${output.glossary.length}` }]
    : [];

/**
 * The gloss may only define a word 07 flagged, and when nothing was flagged the
 * glossary must be empty — an open board gets no footnote.
 */
const onlyGatedWords = (output, knowledgeGated) => {
  if (!knowledgeGated) return []; // called without input — shape only
  const gated = new Set(knowledgeGated.map((entry) => entry.word.toLowerCase()));
  return output.glossary
    .filter((entry) => !gated.has(entry.word.toLowerCase()))
    .map((entry) => ({
      path: 'glossary',
      message:
        gated.size === 0
          ? `nothing was flagged as knowledge-gated — return an empty glossary, not "${entry.word}"`
          : `"${entry.word}" was not flagged as knowledge-gated — define a flagged word or none`,
    }));
};

/**
 * The mechanical half of the leak rule: no OTHER board word inside the
 * definition, whole-word matched, case-insensitive. The prompt asks for this
 * too, but a check is what makes it true.
 */
const noBoardWordLeaks = (output, board) => {
  if (!board) return []; // called without input — shape only
  const errors = [];
  for (const entry of output.glossary) {
    for (const word of wordsOf(board)) {
      if (word.toLowerCase() === entry.word?.toLowerCase()) continue;
      const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (pattern.test(entry.definition ?? '')) {
        errors.push({
          path: 'glossary',
          message: `the definition of "${entry.word}" contains the board word "${word}" — a gloss must not point at other tiles`,
        });
      }
    }
  }
  return errors;
};

export function validateOutput(output, { input = null } = {}) {
  return validateAgainst(output, SCHEMA, [
    atMostOne,
    (value) => onlyGatedWords(value, input?.knowledgeGated ?? null),
    (value) => noBoardWordLeaks(value, input?.board ?? null),
  ]);
}
