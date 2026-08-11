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
// naming the words a general player cannot place. When 07 flagged nothing, the
// author picks the board's hardest word ITSELF: the original design declined on
// open boards, and Max's candlelight playtest reversed it the same day —
// "taper" stumped him, no agent had flagged it, and his direction was "there
// should be a vocab button on each puzzle" (D-18 addendum, 2026-08-11).

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
      knowledgeGated.length > 0
        ? 'From the flagged words below, pick THE hardest — the one a curious outsider is least able to place — and write its definition. Return exactly one entry.'
        : 'Nothing was flagged, but every board gets a vocab word: pick the board\'s hardest word yourself — the one a curious outsider is least able to place, however ordinary the rest — and write its definition. Return exactly one entry.',
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
        : 'No words were flagged as knowledge-gated — choose from the sixteen board words directly.',
    ].join('\n\n'),
    outputRules: [
      'Return { "glossary": [ { "word", "definition" } ] } with EXACTLY ONE entry.',
      JSON_ONLY,
    ].join(' '),
  });
}

export function parse(text) {
  return parseJson(text);
}

const wordsOf = (board) => (board?.sets ?? []).flatMap((set) => (set.pairs ?? []).flat());

/**
 * Exactly one entry — the button defines one word (D-18's chosen scope), and
 * since the addendum EVERY board carries one: Max's candlelight playtest found
 * the hardest word unflagged, and his direction was a vocab button on each
 * puzzle. Zero entries is the refused answer now.
 */
const exactlyOne = (output, hasInput) => {
  if (output.glossary.length > 1) {
    return [{ path: 'glossary', message: `exactly one entry — received ${output.glossary.length}` }];
  }
  if (hasInput && output.glossary.length === 0) {
    return [{ path: 'glossary', message: 'every board gets a vocab word — pick the hardest and define it' }];
  }
  return [];
};

/**
 * When 07 flagged words, the gloss must define one of THEM — the flags are the
 * evidence of where the wall is. When it flagged nothing, the author's own pick
 * stands, but it must still be a board word.
 */
const onlyGatedWords = (output, knowledgeGated, board) => {
  if (!knowledgeGated) return []; // called without input — shape only
  const gated = new Set(knowledgeGated.map((entry) => entry.word.toLowerCase()));
  if (gated.size === 0) {
    const onBoard = new Set(wordsOf(board).map((word) => word.toLowerCase()));
    return output.glossary
      .filter((entry) => !onBoard.has(entry.word?.toLowerCase()))
      .map((entry) => ({
        path: 'glossary',
        message: `"${entry.word}" is not one of the sixteen board words`,
      }));
  }
  return output.glossary
    .filter((entry) => !gated.has(entry.word.toLowerCase()))
    .map((entry) => ({
      path: 'glossary',
      message: `"${entry.word}" was not flagged as knowledge-gated — define a flagged word`,
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
    (value) => exactlyOne(value, input !== null),
    (value) => onlyGatedWords(value, input?.knowledgeGated ?? null, input?.board ?? null),
    (value) => noBoardWordLeaks(value, input?.board ?? null),
  ]);
}
