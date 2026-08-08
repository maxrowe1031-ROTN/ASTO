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

/**
 * The symmetric sets the gate stage flagged, as checklist lines.
 *
 * Read off the integrity report rather than recomputed: the shape a set
 * declared lives on the grouper's output, which this agent is never handed —
 * and should not be, since knowing the intended shape would tell it the answer
 * to the wrong question. It gets the set ids and the words, nothing else.
 */
export function enumerateOrderReadings(board, integrity) {
  const flagged = integrity?.orderFairness?.flagged ?? [];
  const bySet = new Map((board?.sets ?? []).map((set) => [set.id, set]));
  return flagged
    .filter((flag) => bySet.has(flag.setId))
    .map((flag) => ({ setId: flag.setId, reading: orderedWords(bySet.get(flag.setId)) }));
}

const orderedWords = (set) => (set.pairs ?? []).flat();

export const id = 'adversarial-solver';
export const stageId = '06-adversarial-solver';

const SCHEMA = {
  type: 'object',
  required: ['findings', 'noneFound', 'crossReadings'],
  properties: {
    noneFound: { type: 'boolean' },
    // The order-fairness checklist (design.md D-9). Same shape and same reason
    // as `crossReadings` above it: the gate stage computes WHICH sets are
    // structurally symmetric, and this agent answers the one question the
    // structure cannot — do the words themselves say which way round?
    //
    // Not `required`, because a board with no symmetric set gets no checklist
    // and must not be asked for an empty array it was never given lines for.
    // The semantic check below enforces the pairing in both directions.
    orderReadings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['setId', 'inferable'],
        properties: {
          setId: { type: 'string', minLength: 1 },
          inferable: { type: 'boolean' },
          note: { type: 'string' },
        },
      },
    },
    // `note` is required only where it carries information — on a reading that
    // HOLDS. Eight paragraphs explaining why eight non-analogies are not
    // analogies is output spent on nothing, and output is the budget that ran
    // out the first time this was built.
    crossReadings: {
      type: 'array',
      items: {
        type: 'object',
        // `leftRelation` and `rightRelation` are required on EVERY line, not
        // just the ones that hold (design.md D-13). Three attempts at this
        // question produced a bare boolean that was first credulous and then
        // near-silent, and a boolean cannot be argued with: when 06 answered
        // `valid: false` on the set Max caught by hand, there was nothing to
        // read to find out why. Naming both relations before the verdict makes
        // the reasoning visible, and makes the answer scoreable against his
        // `order-ambiguous` calls — which is the currency D-7's graduation
        // trigger is paid in.
        required: ['id', 'leftRelation', 'rightRelation', 'valid'],
        properties: {
          id: { type: 'string', minLength: 1 },
          leftRelation: { type: 'string', minLength: 1 },
          rightRelation: { type: 'string', minLength: 1 },
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
  const orderLines = enumerateOrderReadings(board, integrity);

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
      'Work each line the same way. A line reads W : X :: Y : Z. Write the relation that takes W to X in "leftRelation" and the relation that takes Y to Z in "rightRelation" — always, on every line, before you decide anything. Then mark it valid ONLY if those two are the SAME relation, and name that shared relation in the "note".',
      // design.md D-13. The reason the flowers Black slipped through: the
      // checklist presents ONE orientation of each half, and Max's reading
      // (`seed : bud :: bloom : wilt`) is the presented line with its right half
      // read the other way round. The old instruction to judge only the reading
      // in front of you then made the correct answer unreachable — the question
      // excluded the very reading a player finds. A player does not respect the
      // order a checklist happened to print in.
      'Either half may be read in either direction. Before answering, check the flipped readings too: if ANY consistent pairing of the four words gives both halves the same relation, the line is valid — say so, and give the orientation that works in the "note".',
      '  - "valid": true means a real player could reasonably read it and be satisfied. The set is broken.',
      '  - "valid": false means the two halves carry different relations, or one half carries none. No note needed.',
      // The failure this instruction exists to stop, verbatim from the
      // 2026-08-05 replay: 13 of 16 flags were this one mistake.
      'The trap: two halves that are each a pair of SIMILAR THINGS do not share a relation. "song : album :: Truckin\' : American Beauty" is a pair of categories beside a pair of named works — the left half relates two kinds of thing, the right half relates a track to the record it is on. Those are different relations, so the answer is false. Likewise "guitarist : drummer :: guitar : drum kit" is two people beside two instruments: symmetry, not analogy. A grid that looks tidy is not a reading a player can solve.',
      // The counter-trap, added with the orientation freedom above so the two
      // are read together: a SHARED SEQUENCE is the case that keeps reaching
      // review. Four words on one timeline regroup into "earlier : later" no
      // matter how they are dealt, so the tidy-grid rule above must not be used
      // to wave one through.
      'One case to watch especially: when all four words sit on a single progression — one timeline, one lifecycle, one journey — almost any regrouping still reads "earlier : later", and that IS the same relation on both halves. That makes the line valid, not tidy. "seed : bud :: bloom : wilt" is four life-stages in order; both halves run earlier to later, so a player can solve it and the engine will refuse them.',
      'Do not soften an answer because the intended set is good. A valid cross-reading in a set you admire is the most expensive kind there is.',
      'This is a checklist, not a search: the candidates are already found, so answer them and move on. These answers belong in "crossReadings", not in "findings" — do not report them twice.',
      // The order-fairness checklist (design.md D-9). Same discipline again,
      // and for the same demonstrated reason: this agent already had an
      // `ambiguous-order` finding kind and returned NOTHING on the two boards
      // where every one of Max's four mistakes was an ordering mistake. The
      // structure is computed upstream; only the words can answer the question.
      ...(orderLines.length > 0
        ? [
            '',
            'SEPARATELY AGAIN, answer the order-fairness checklist below. Each listed set is built on a relationship that reads the same both ways round, so nothing about the RELATIONSHIP says which word the author put first.',
            'The engine accepts a flip only when BOTH pairs flip together: for W : X :: Y : Z it takes X : W :: Z : Y, and refuses X : W :: Y : Z. So a player who reads one pair the other way round loses a mistake for a grouping they had completely right.',
            'For each line, ask only this: could a player who has found these four words tell which way round to write them, from the words alone?',
            '  - "inferable": true — yes, something in the words settles it. A convention ("north" before "south", "east" before "west"), a familiar fixed phrase, a name that always leads. Say what settles it in the "note".',
            '  - "inferable": false — no, a player would be guessing, and half of them would guess wrong. No note needed.',
            'Answer for the ORDER only. Whether the set is a good analogy, or fairly graded, is not this question — a set can be excellent and still coin-flip.',
            'Judge what a player can see. You are told the intended order because it is the only way to show you the words; that you can see which order was chosen is not evidence a player could have inferred it.',
          ]
        : []),
    ].join('\n'),
    data: [
      asJsonBlock('Board', board),
      integrity ? asJsonBlock('Mechanical integrity report (already proven — do not redo)', integrity) : '',
      candidates.length > 0
        ? `Cross-reading checklist — answer every line by its id:\n${candidates
            .map(({ id, reading }) => `  - ${id}: ${readingText(reading)}`)
            .join('\n')}`
        : '',
      orderLines.length > 0
        ? `Order-fairness checklist — answer every line by its setId:\n${orderLines
            .map(({ setId, reading }) => `  - ${setId}: ${readingText(reading)}`)
            .join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    outputRules: [
      'Return { "findings": [ { "kind", "words", "severity", "note" } ], "noneFound": true or false, "crossReadings": [ { "id", "leftRelation", "rightRelation", "valid", "note" } ] }.',
      ...(orderLines.length > 0
        ? [
            'Also return "orderReadings": [ { "setId", "inferable", "note" } ] — one entry for EVERY line of the order-fairness checklist and nothing else, with "setId" exactly as written. "note" is one sentence required only when "inferable" is true.',
          ]
        : []),
      '"kind" is one of alternate-reading, cross-set-association, ambiguous-order, double-meaning, misleading-label, unfair.',
      '"words" is an array of the board words involved, "severity" is low, medium or high, and "note" says what a player would see.',
      'Rate each finding low, medium or high by how likely a real player is to be misled.',
      '"crossReadings" must contain one entry for EVERY line of the checklist and nothing else. "id" is that line\'s id exactly as written; "leftRelation" and "rightRelation" are short phrases naming each half\'s relation and are required on every line; "valid" is a boolean; "note" is one sentence required only when "valid" is true.',
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
  // No semantic check for the two relation fields on purpose: the schema's
  // `required` plus `minLength: 1` (which trims first) already refuses both a
  // missing relation and a blank one, so a check here would be unreachable.
  // Established by test, not by reading — the first version of D-13 added one
  // and it never fired.

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

/**
 * Every flagged set got an order verdict, exactly once, and nothing was invented.
 *
 * Same guarantee as `everyReadingAnswered`, and it matters more here: the whole
 * reason this checklist exists is that the agent's free-hunting `ambiguous-order`
 * kind stayed silent on the two boards where ordering cost Max every mistake he
 * had. A stage that can quietly skip the question would reproduce that silence.
 */
const everyOrderAnswered = (output, board, integrity) => {
  if (!board || !integrity) return []; // called without input — shape only
  const asked = new Map(enumerateOrderReadings(board, integrity).map((c) => [c.setId, c]));
  const given = output.orderReadings ?? [];
  const answered = new Set(given.map((entry) => entry.setId));

  const errors = [];
  if (asked.size === 0) {
    // No symmetric set on this board, so no checklist was sent. An answer here
    // is the model inventing a question, which is worth catching: it means the
    // instruction leaked without its lines.
    return given.length === 0
      ? []
      : [{ path: 'orderReadings', message: 'no order-fairness checklist was given — do not invent one' }];
  }

  const missing = [...asked.keys()].filter((setId) => !answered.has(setId));
  if (missing.length > 0) {
    errors.push({
      path: 'orderReadings',
      message: `${missing.length} order checklist line(s) unanswered: ${missing
        .map((setId) => `${setId} (${readingText(asked.get(setId).reading)})`)
        .join('; ')}`,
    });
  }
  for (const entry of given.filter((e) => !asked.has(e.setId))) {
    errors.push({
      path: 'orderReadings',
      message: `"${entry.setId}" is not an order checklist id — answer the lines given, do not add your own`,
    });
  }
  if (answered.size !== given.length) {
    errors.push({ path: 'orderReadings', message: 'a set was answered more than once' });
  }
  // `inferable: true` is the answer that clears a set, so it is the one that
  // has to carry its reasoning — the mirror of a cross-reading marked valid.
  for (const entry of given) {
    if (entry.inferable && !entry.note?.trim()) {
      errors.push({
        path: 'orderReadings',
        message: `${entry.setId} is marked inferable but says nothing — name what tells a player which way round`,
      });
    }
  }
  return errors;
};

export function validateOutput(output, { input = null } = {}) {
  return validateAgainst(output, SCHEMA, [
    noneFoundAgreesWithFindings,
    (value) => everyReadingAnswered(value, input?.board ?? null),
    (value) => everyOrderAnswered(value, input?.board ?? null, input?.integrity ?? null),
  ]);
}
