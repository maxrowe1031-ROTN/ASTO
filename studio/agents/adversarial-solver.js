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

/**
 * Every refused regrouping on the board — two per set, each with a short id.
 *
 * The id is what the answer echoes back. Asking the model to retype four words
 * invited it to send the formatted line as a string instead of an array (it
 * did), and every character it writes is a character it is not spending on the
 * judgement. `set-b#1` is unambiguous and nearly free.
 */
export function enumerateCrossReadings(board) {
  return (board?.sets ?? []).flatMap((set) =>
    crossPairings(set.pairs).map((reading, index) => ({
      id: `${set.id}#${index + 1}`,
      setId: set.id,
      reading,
    })),
  );
}

export const id = 'adversarial-solver';
export const stageId = '06-adversarial-solver';

const SCHEMA = {
  type: 'object',
  required: ['findings', 'noneFound', 'crossReadings'],
  properties: {
    noneFound: { type: 'boolean' },
    // `note` is required only where it carries information — on a reading that
    // HOLDS. Eight paragraphs explaining why eight non-analogies are not
    // analogies is output spent on nothing, and output is the budget that ran
    // out the first time this was built.
    crossReadings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'valid'],
        properties: {
          id: { type: 'string', minLength: 1 },
          valid: { type: 'boolean' },
          // No minLength here on purpose: an empty note on a `false` answer is
          // the model filling in a field it was told it did not need, which is
          // harmless. Whether a note is REQUIRED is a semantic question about
          // the answer, so it lives in the semantic check below.
          note: { type: 'string' },
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
      'Work each line the same way. A line reads W : X :: Y : Z. Name the relation that takes W to X. Name the relation that takes Y to Z. Mark it valid ONLY if those two are the SAME relation, and say which relation it is in the "note".',
      '  - "valid": true means a real player could reasonably read it and be satisfied. The set is broken.',
      '  - "valid": false means the two halves carry different relations, or one half carries none. No note needed.',
      // The failure this instruction exists to stop, verbatim from the
      // 2026-08-05 replay: 13 of 16 flags were this one mistake.
      'The trap: two halves that are each a pair of SIMILAR THINGS do not share a relation. "song : album :: Truckin\' : American Beauty" is a pair of categories beside a pair of named works — the left half relates two kinds of thing, the right half relates a track to the record it is on. Those are different relations, so the answer is false. Likewise "guitarist : drummer :: guitar : drum kit" is two people beside two instruments: symmetry, not analogy. A grid that looks tidy is not a reading a player can solve.',
      'Judge only the reading in front of you, and do not soften an answer because the intended set is good.',
      'This is a checklist, not a search: the candidates are already found, so answer them and move on. These answers belong in "crossReadings", not in "findings" — do not report them twice.',
    ].join('\n'),
    data: [
      asJsonBlock('Board', board),
      integrity ? asJsonBlock('Mechanical integrity report (already proven — do not redo)', integrity) : '',
      candidates.length > 0
        ? `Cross-reading checklist — answer every line by its id:\n${candidates
            .map(({ id, reading }) => `  - ${id}: ${readingText(reading)}`)
            .join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    outputRules: [
      'Return { "findings": [ { "kind", "words", "severity", "note" } ], "noneFound": true or false, "crossReadings": [ { "id", "valid", "note" } ] }.',
      '"kind" is one of alternate-reading, cross-set-association, ambiguous-order, double-meaning, misleading-label, unfair.',
      '"words" is an array of the board words involved, "severity" is low, medium or high, and "note" says what a player would see.',
      'Rate each finding low, medium or high by how likely a real player is to be misled.',
      '"crossReadings" must contain one entry for EVERY line of the checklist and nothing else. "id" is that line\'s id exactly as written, "valid" is a boolean, and "note" is one sentence required only when "valid" is true.',
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
  const asked = new Map(enumerateCrossReadings(board).map((c) => [c.id, c]));
  const answered = new Set(output.crossReadings.map((entry) => entry.id));

  const missing = [...asked.keys()].filter((id) => !answered.has(id));
  const invented = output.crossReadings.filter((entry) => !asked.has(entry.id));

  const errors = [];
  if (missing.length > 0) {
    errors.push({
      path: 'crossReadings',
      message: `${missing.length} checklist reading(s) unanswered: ${missing
        .map((id) => `${id} (${readingText(asked.get(id).reading)})`)
        .join('; ')}`,
    });
  }
  for (const entry of invented) {
    errors.push({
      path: 'crossReadings',
      message: `"${entry.id}" is not a checklist id — answer the lines given, do not add your own`,
    });
  }
  if (answered.size !== output.crossReadings.length) {
    errors.push({ path: 'crossReadings', message: 'a reading was answered more than once' });
  }
  // A reading that HOLDS is the whole point of the checklist; an unexplained
  // one is a verdict Max cannot act on, exactly like a weak unity score with no
  // outliers named.
  for (const entry of output.crossReadings) {
    if (entry.valid && !entry.note?.trim()) {
      errors.push({
        path: 'crossReadings',
        message: `${entry.id} is marked valid but says nothing — name the relationship both halves share`,
      });
    }
  }
  return errors;
};

export function validateOutput(output, { input = null } = {}) {
  return validateAgainst(output, SCHEMA, [
    noneFoundAgreesWithFindings,
    (value) => everyReadingAnswered(value, input?.board ?? null),
  ]);
}
