// The order-fairness checklist (design.md D-9, 2026-08-06).
//
// The defect, precisely. The engine accepts four orders — [A,B,C,D] [C,D,A,B]
// [B,A,D,C] [D,C,B,A] — so flipping BOTH pairs is fine and flipping ONE is a
// mistake. For `dawn : dusk :: birth : death` that costs nothing: time runs one
// way, and a player mirrors it without thinking. For `Ruth : Gehrig :: Mantle :
// Maris` there is no arrow, so the player must guess the author's orientation
// and match it in the other pair — and half of them guess wrong.
//
// That set cost Max all four of his mistakes on the Yankees board. Every one
// was so-close; he never grouped the wrong four words once.
//
// Why it is a checklist rather than a hunt, again: 06 already HAD an
// `ambiguous-order` finding kind and returned nothing at all on Yankees or on
// `cars`, the two boards where ordering took every mistake. An open search
// cannot reliably see a structural property, so the structure is computed at
// the gate and handed over as closed questions — the same move that fixed the
// cross-reading search a day earlier.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as solver from '../../../studio/agents/adversarial-solver.js';
import { acceptedOrders } from '../../../src/engine/arrangements.js';

// The Yankees board's Black, and a control set from the same board whose order
// a player can read straight off the words.
const BOARD = {
  id: 'board-yankees-baseball',
  title: 'Yankees Baseball',
  sets: [
    { id: 'set-beforeafter', relationshipLabel: 'b', explanation: 'e', difficulty: 2,
      pairs: [['Opening Day', 'World Series'], ['Rookie season', 'retirement']] },
    { id: 'set-coordinates', relationshipLabel: 'c', explanation: 'e', difficulty: 4,
      pairs: [['Ruth', 'Gehrig'], ['Mantle', 'Maris']] },
  ],
};

const INTEGRITY = {
  orderFairness: {
    enforced: false,
    count: 1,
    flagged: [
      {
        setId: 'set-coordinates',
        shape: 'coordinates',
        kind: 'order-indistinguishable',
        note: 'ram : ewe reads the same as ewe : ram — counterparts side by side have no from/to',
      },
    ],
  },
};

// Both relations on every line since design.md D-13.
const crossAnswers = () =>
  solver.enumerateCrossReadings(BOARD).map(({ id }) => ({
    id,
    leftRelation: 'no shared relation',
    rightRelation: 'no shared relation',
    valid: false,
  }));

const output = (overrides = {}) => ({
  noneFound: true,
  findings: [],
  crossReadings: crossAnswers(),
  orderReadings: [{ setId: 'set-coordinates', inferable: false }],
  ...overrides,
});

const validate = (value, integrity = INTEGRITY) =>
  solver.validateOutput(value, { input: { board: BOARD, integrity } });

// --- the engine fact the whole check rests on -----------------------------

test('flipping ONE pair is refused; flipping both is accepted', () => {
  const orders = acceptedOrders(BOARD.sets[1].pairs).map((o) => o.join(' '));
  // Both pairs flipped — accepted, so a consistent reader is never punished.
  assert.ok(orders.includes('Gehrig Ruth Maris Mantle'));
  // One pair flipped — refused. This is the mistake a symmetric set charges for
  // a grouping the player had completely right.
  assert.ok(!orders.includes('Gehrig Ruth Mantle Maris'));
});

// --- the enumerator --------------------------------------------------------

test('only the flagged sets become checklist lines, with their words in order', () => {
  const lines = solver.enumerateOrderReadings(BOARD, INTEGRITY);
  assert.deepEqual(lines, [
    { setId: 'set-coordinates', reading: ['Ruth', 'Gehrig', 'Mantle', 'Maris'] },
  ]);
});

test('a board with no symmetric set produces no checklist at all', () => {
  const clean = { orderFairness: { enforced: false, count: 0, flagged: [] } };
  assert.deepEqual(solver.enumerateOrderReadings(BOARD, clean), []);
  const prompt = solver.buildPrompt({ board: BOARD, integrity: clean }, {});
  assert.doesNotMatch(prompt, /Order-fairness checklist/);
  // And the instruction must not leak without its lines, or the model is asked
  // a question it was given nothing to answer.
  assert.doesNotMatch(prompt, /order-fairness checklist below/);
});

test('an older attempt with no orderFairness field is silent rather than throwing', () => {
  assert.deepEqual(solver.enumerateOrderReadings(BOARD, {}), []);
  assert.deepEqual(solver.enumerateOrderReadings(BOARD, null), []);
});

// --- the prompt ------------------------------------------------------------

test('the flagged set reaches the prompt as a line, and the rule is stated', () => {
  const prompt = solver.buildPrompt({ board: BOARD, integrity: INTEGRITY }, {});
  assert.match(prompt, /Order-fairness checklist/);
  assert.match(prompt, /set-coordinates: Ruth : Gehrig :: Mantle : Maris/);
  // The engine's actual rule, because "order matters" alone does not explain
  // why a consistent flip is fine and an inconsistent one is not.
  assert.match(prompt, /BOTH pairs flip together/);
  // The set it was NOT asked about stays out.
  assert.doesNotMatch(prompt, /set-beforeafter: Opening Day/);
});

test('the prompt tells it to judge what a player can see, not what it was shown', () => {
  const prompt = solver.buildPrompt({ board: BOARD, integrity: INTEGRITY }, {});
  // Without this the model reasons "the intended order is X, and I can see X",
  // which answers a different question than the one asked.
  assert.match(prompt, /that you can see which order was chosen is not evidence/);
});

// --- the validation, which is the part a prompt cannot guarantee ------------

test('a complete answer validates', () => {
  assert.equal(validate(output()).ok, true);
});

test('a skipped line fails, naming the set and its words', () => {
  const result = validate(output({ orderReadings: [] }));
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /set-coordinates/);
  assert.match(JSON.stringify(result.errors), /Ruth : Gehrig :: Mantle : Maris/);
});

test('an invented line fails — answer what was asked', () => {
  const result = validate(
    output({ orderReadings: [...output().orderReadings, { setId: 'set-beforeafter', inferable: true, note: 'time' }] }),
  );
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /not an order checklist id/);
});

test('answering the same set twice fails', () => {
  const result = validate(
    output({
      orderReadings: [
        { setId: 'set-coordinates', inferable: false },
        { setId: 'set-coordinates', inferable: false },
      ],
    }),
  );
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /more than once/);
});

// `inferable: true` is the answer that CLEARS a set — the mirror of a
// cross-reading marked valid, and held to the same standard.
test('a set marked inferable must say what tells a player which way round', () => {
  const result = validate(output({ orderReadings: [{ setId: 'set-coordinates', inferable: true }] }));
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /says nothing/);
});

test('a set marked inferable WITH a reason validates — the rescue is real', () => {
  // north : south :: east : west is the case this exists for: symmetric shape,
  // but convention settles the order, so the board is fair and must not be
  // reported as broken.
  const result = validate(
    output({
      orderReadings: [
        { setId: 'set-coordinates', inferable: true, note: 'Ruth is always named before Gehrig.' },
      ],
    }),
  );
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('a set marked not-inferable needs no note', () => {
  assert.equal(validate(output({ orderReadings: [{ setId: 'set-coordinates', inferable: false }] })).ok, true);
});

test('answering a checklist that was never given fails', () => {
  const clean = { orderFairness: { enforced: false, count: 0, flagged: [] } };
  const result = validate(output(), clean);
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /do not invent one/);
});

test('without the integrity report it validates shape only, and says so by passing', () => {
  // Same discipline as the cross-reading check: it cannot judge completeness
  // against input it was not given, so it does not pretend to.
  assert.equal(solver.validateOutput(output(), { input: { board: BOARD } }).ok, true);
});

test('the cross-reading checklist is unaffected by any of this', () => {
  const result = validate(output({ crossReadings: [] }));
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /checklist reading\(s\) unanswered/);
});
