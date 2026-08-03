// Adversarial Solver (GDD §12.1 #6) — tries to break the board.
//
// Scope is set by what the machine already proved. board-integrity.js sweeps
// all 43,680 ordered 4-tuples exhaustively, so re-deriving mechanical
// uniqueness here would burn tokens on a solved problem. This agent hunts the
// part brute force provably cannot see: readings a human would plausibly take.
// The integrity report is handed to it precisely so it does not repeat that work.
//
// One bounded full-board pass. No open-ended hunting.

import { JSON_ONLY, asJsonBlock, composePrompt, parseJson, validateAgainst } from './agent-kit.js';

export const id = 'adversarial-solver';
export const stageId = '06-adversarial-solver';

const SCHEMA = {
  type: 'object',
  required: ['findings', 'noneFound'],
  properties: {
    noneFound: { type: 'boolean' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind', 'words', 'severity', 'note'],
        properties: {
          kind: {
            type: 'string',
            enum: [
              'alternate-reading',
              'cross-set-association',
              'ambiguous-order',
              'double-meaning',
              'misleading-label',
              'unfair',
            ],
          },
          words: { type: 'array', items: { type: 'string', minLength: 1 } },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          note: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};

export function getOutputSchema() {
  return SCHEMA;
}

export function buildPrompt(input = {}, context) {
  const { board = {}, integrity = null } = input;

  return composePrompt({
    role:
      'You are the Adversarial Solver for ASTO. Your job is to break this board before a player does.',
    context,
    task: [
      'A machine has already swept every possible ordered grouping of these sixteen words exhaustively and confirmed that exactly the intended sixteen orderings solve. That work is done. Do not repeat it, and do not report groupings that are merely mechanically possible.',
      'Hunt only what exhaustive search cannot see — the readings a real person would actually take:',
      '  - alternate-reading: four words that a player would reasonably read as a valid analogy, even though the machine rejects it.',
      '  - cross-set-association: words pulled together by strong semantic gravity across intended sets (same domain, same register, same story).',
      '  - ambiguous-order: a set whose direction a reasonable player would read the other way round.',
      '  - double-meaning: a word whose secondary sense drags it toward the wrong set.',
      '  - misleading-label: a relationship label that would not feel fair once revealed.',
      '  - unfair: technically valid, but a player would feel cheated.',
      'Make one complete pass over the board and stop. If you find nothing, say so — "noneFound": true with an empty "findings".',
    ].join('\n'),
    data: [asJsonBlock('Board', board), integrity ? asJsonBlock('Mechanical integrity report (already proven — do not redo)', integrity) : '']
      .filter(Boolean)
      .join('\n\n'),
    outputRules: [
      'Return { "findings": [ { "kind", "words", "severity", "note" } ], "noneFound": true or false }.',
      '"kind" is one of alternate-reading, cross-set-association, ambiguous-order, double-meaning, misleading-label, unfair.',
      '"words" is an array of the board words involved, "severity" is low, medium or high, and "note" says what a player would see.',
      'Rate each finding low, medium or high by how likely a real player is to be misled.',
      JSON_ONLY,
    ].join(' '),
  });
}

export function parse(text) {
  return parseJson(text);
}

const noneFoundAgreesWithFindings = (output) => {
  const empty = output.findings.length === 0;
  return output.noneFound === empty
    ? []
    : [{ path: 'noneFound', message: `must be ${empty} to match a findings list of ${output.findings.length}` }];
};

export function validateOutput(output) {
  return validateAgainst(output, SCHEMA, [noneFoundAgreesWithFindings]);
}
