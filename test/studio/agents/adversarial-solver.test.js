// The cross-reading checklist (2026-08-05).
//
// A set's own four words regroup into exactly two other analogies, and the
// engine refuses both — so if one of them reads as valid, a player who sees it
// is marked wrong for being right. Max found three of these in one batch and
// called them `valid-but-unfair`; this agent, hunting freely, had found one.
//
// The point of these tests is that the question is no longer a hunt. The
// readings are enumerated mechanically and handed over, and an answer that
// skips one FAILS — because the prompt that produced those defects already
// carried the editorial rule telling the model to check for exactly this.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as solver from '../../../studio/agents/adversarial-solver.js';

const BOARD = {
  id: 'asto-cars',
  title: 'Cars',
  sets: [
    { id: 'set-a', relationshipLabel: 'a', explanation: 'e', difficulty: 1,
      pairs: [['sports car', 'Corvette'], ['muscle car', 'Mustang']] },
    { id: 'set-b', relationshipLabel: 'b', explanation: 'e', difficulty: 4,
      pairs: [['ignition', 'shutdown'], ['departure', 'arrival']] },
  ],
};

/** A complete, well-formed answer to the checklist BOARD produces. */
const answered = () =>
  solver.enumerateCrossReadings(BOARD).map(({ setId, reading }) => ({
    setId,
    reading,
    valid: false,
    note: 'Does not hold.',
  }));

const output = (overrides = {}) => ({
  noneFound: true,
  findings: [],
  crossReadings: answered(),
  ...overrides,
});

const validate = (value) => solver.validateOutput(value, { input: { board: BOARD } });

test('the checklist is two readings per set, in board order', () => {
  const candidates = solver.enumerateCrossReadings(BOARD);
  assert.equal(candidates.length, 4);
  assert.deepEqual(candidates[2], {
    setId: 'set-b',
    reading: ['ignition', 'departure', 'shutdown', 'arrival'],
  });
});

test('a complete answer validates', () => {
  assert.equal(validate(output()).ok, true);
});

// The one that matters: the model cannot quietly answer the easy ones.
test('an answer that skips a reading is refused, and the message names it', () => {
  const short = output({ crossReadings: answered().slice(0, 3) });
  const result = validate(short);
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /unanswered/);
  // The message names the reading that went unasked, not just a count.
  assert.match(JSON.stringify(result.errors), /ignition : arrival :: shutdown : departure/);
});

test('an answer with no crossReadings at all is refused', () => {
  const { crossReadings, ...rest } = output();
  assert.equal(validate(rest).ok, false);
});

// Without this, a model could satisfy the count by inventing readings that
// were never asked about — answering a checklist it wrote itself. The reading
// used here is the set's INTENDED order, which is the most tempting wrong
// answer available: it is trivially "not valid as an alternative" because it is
// not an alternative at all.
test('a reading that was not on the checklist is refused', () => {
  const invented = answered();
  invented.push({
    setId: 'set-a',
    reading: ['sports car', 'Corvette', 'muscle car', 'Mustang'],
    valid: false,
    note: 'The intended reading, answered as though it were a cross-reading.',
  });
  const result = validate(output({ crossReadings: invented }));
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /not on the checklist/);
});

test('answering the same reading twice is refused', () => {
  const doubled = answered();
  doubled[1] = { ...doubled[0] };
  assert.equal(validate(output({ crossReadings: doubled })).ok, false);
});

test('a reading may be answered valid — that is the finding, not an error', () => {
  const found = answered();
  found[2] = {
    ...found[2],
    valid: true,
    note: 'Ignition leads to departure the way shutdown leads to arrival; a player would submit this.',
  };
  const result = validate(output({ crossReadings: found }));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

// Called without input — by a test, or any direct use — it still checks shape.
// It cannot check completeness against a board it was not given, and it says so
// by passing rather than by inventing a board.
test('without the board it validates shape only, and does not pretend otherwise', () => {
  assert.equal(solver.validateOutput(output()).ok, true);
  assert.equal(solver.validateOutput(output({ crossReadings: [] })).ok, true);
});

test('the enumerated readings reach the prompt as a checklist', () => {
  const prompt = solver.buildPrompt({ board: BOARD }, {});
  assert.match(prompt, /Cross-reading checklist/);
  assert.match(prompt, /\[set-b\] ignition : departure :: shutdown : arrival/);
  assert.match(prompt, /\[set-b\] ignition : arrival :: shutdown : departure/);
  // The four readings, one line each.
  assert.equal((prompt.match(/^ {2}- \[set-/gm) ?? []).length, 4);
});

test('noneFound still describes findings only, not the checklist', () => {
  // A board with a broken cross-reading and no other findings is a real state.
  const found = answered();
  found[2] = { ...found[2], valid: true, note: 'It holds.' };
  assert.equal(validate(output({ noneFound: true, findings: [], crossReadings: found })).ok, true);
});
