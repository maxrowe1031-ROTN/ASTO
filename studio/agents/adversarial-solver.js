// Adversarial Solver (GDD §12.1 #6) — tries to break the board.
//
// Scope is set by what the machine already proved. board-integrity.js sweeps
// all 43,680 ordered 4-tuples exhaustively, so re-deriving mechanical
// uniqueness here would burn tokens on a solved problem. This agent hunts the
// part brute force provably cannot see: readings a human would plausibly take.
// The integrity report is handed to it precisely so it does not repeat that work.
//
// One bounded full-board pass. No open-ended hunting.
//
// CROSS-READINGS (2026-08-05). The open hunt above has one blind spot it kept
// falling into: a set whose own four words regroup into a second valid analogy.
// `ignition : shutdown :: departure : arrival` also reads
// `ignition : departure :: shutdown : arrival`, and because the engine refuses
// that reading, a player who sees it loses a mistake for being right. Max found
// three of these in one batch; this agent found one of them, at medium, while
// hunting freely.
//
// So that question stops being a hunt. `crossPairings` enumerates the two
// refused groupings of every set — mechanically, in the engine, where the
// accepted-order algebra already lives — and they are handed over as a
// checklist with one closed question each. `validateOutput` refuses an answer
// that skipped any of them, which is the part a prompt alone could never
// guarantee: the twelve editorial rules were all present in the prompt that
// produced these defects.

import { crossPairings } from '../../src/engine/arrangements.js';
import { JSON_ONLY, asJsonBlock, composePrompt, parseJson, validateAgainst } from './agent-kit.js';

/** "ignition : departure :: shutdown : arrival" */
const readingText = ([a, b, c, d]) => `${a} : ${b} :: ${c} : ${d}`;

/** Every refused regrouping on the board, as { setId, reading } — two per set. */
export function enumerateCrossReadings(board) {
  return (board?.sets ?? []).flatMap((set) =>
    crossPairings(set.pairs).map((reading) => ({ setId: set.id, reading })),
  );
}

const keyOf = ({ setId, reading }) => `${setId}|${reading.join('|')}`;

export const id = 'adversarial-solver';
export const stageId = '06-adversarial-solver';

const SCHEMA = {
  type: 'object',
  required: ['findings', 'noneFound', 'crossReadings'],
  properties: {
    noneFound: { type: 'boolean' },
    crossReadings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['setId', 'reading', 'valid', 'note'],
        properties: {
          setId: { type: 'string', minLength: 1 },
          reading: { type: 'array', items: { type: 'string', minLength: 1 } },
          valid: { type: 'boolean' },
          note: { type: 'string', minLength: 1 },
        },
      },
    },
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
  const candidates = enumerateCrossReadings(board);

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
      '',
      // The checklist. Every one of these must come back answered — an omission
      // fails validation and the stage is asked again.
      'SEPARATELY, answer the cross-reading checklist below. Each set on this board is two pairs; its four words can be regrouped in exactly two other ways, and both are listed for you. The engine REFUSES those readings, so if one of them is also a valid analogy, a player who sees it is marked wrong for being right. That is the worst failure this board can have.',
      'For each listed reading answer one question: read as written, is this a valid analogy — do both halves carry the same relationship?',
      '  - "valid": true means a real player could reasonably read it and be satisfied. The set is broken and must be reworded or replaced.',
      '  - "valid": false means the reading does not hold. Say briefly why it falls apart.',
      'Judge only the reading in front of you. Do not soften an answer because the intended set is good, and do not mark a reading valid merely because the words are related — a shared topic is not a shared relationship.',
      'These answers belong in "crossReadings", not in "findings". Do not report them twice.',
    ].join('\n'),
    data: [
      asJsonBlock('Board', board),
      integrity ? asJsonBlock('Mechanical integrity report (already proven — do not redo)', integrity) : '',
      candidates.length > 0
        ? `Cross-reading checklist — answer every line:\n${candidates
            .map(({ setId, reading }) => `  - [${setId}] ${readingText(reading)}`)
            .join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    outputRules: [
      'Return { "findings": [ { "kind", "words", "severity", "note" } ], "noneFound": true or false, "crossReadings": [ { "setId", "reading", "valid", "note" } ] }.',
      '"kind" is one of alternate-reading, cross-set-association, ambiguous-order, double-meaning, misleading-label, unfair.',
      '"words" is an array of the board words involved, "severity" is low, medium or high, and "note" says what a player would see.',
      'Rate each finding low, medium or high by how likely a real player is to be misled.',
      '"crossReadings" must contain one entry for EVERY line of the checklist and nothing else. "reading" is that line\'s four words in the same order, "valid" is a boolean, "note" is one sentence.',
      '"noneFound" describes "findings" only — a cross-reading answer is not a finding.',
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

/**
 * Every enumerated reading was answered, exactly once, and nothing was invented.
 *
 * This is the check the prompt cannot make. The board that produced this work
 * had all twelve editorial rules in its prompt — including "check whether any
 * four of its words form another valid analogy" — and broke three of them. An
 * instruction is a request; a validation failure sends the stage back.
 */
const everyReadingAnswered = (output, board) => {
  if (!board) return []; // called without input (tests, direct use) — shape only
  const asked = new Map(enumerateCrossReadings(board).map((c) => [keyOf(c), c]));
  const answered = new Set(output.crossReadings.map(keyOf));

  const missing = [...asked.keys()].filter((key) => !answered.has(key));
  const invented = output.crossReadings.filter((c) => !asked.has(keyOf(c)));

  const errors = [];
  if (missing.length > 0) {
    errors.push({
      path: 'crossReadings',
      message: `${missing.length} checklist reading(s) unanswered: ${missing
        .map((key) => {
          const { setId, reading } = asked.get(key);
          return `[${setId}] ${readingText(reading)}`;
        })
        .join('; ')}`,
    });
  }
  for (const entry of invented) {
    errors.push({
      path: 'crossReadings',
      message: `[${entry.setId}] ${readingText(entry.reading)} is not on the checklist — answer the readings given, do not add your own`,
    });
  }
  if (answered.size !== output.crossReadings.length) {
    errors.push({ path: 'crossReadings', message: 'a reading was answered more than once' });
  }
  return errors;
};

export function validateOutput(output, { input = null } = {}) {
  return validateAgainst(output, SCHEMA, [
    noneFoundAgreesWithFindings,
    (value) => everyReadingAnswered(value, input?.board ?? null),
  ]);
}
