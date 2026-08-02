// The coach-mark machine. Driven with REAL engine states rather than hand-built objects,
// so a change to how the engine clears selections or records failures shows up here.

import test from 'node:test';
import assert from 'node:assert/strict';

import { clearSelection, deselect, initGame, select, submit } from '../../src/engine/engine.js';
import { acceptedOrders } from '../../src/engine/arrangements.js';
import { tutorialStep, TUTORIAL_RULES } from '../../src/controller/tutorial-script.js';
import { board, MISS } from '../fixtures/board.js';

// The real shipped config, not a stand-in — these tests fail if the tutorial's rules drift.
const fresh = () => initGame(board, TUTORIAL_RULES);
const pick = (state, ...terms) => terms.reduce((s, term) => select(s, term), state);

// Anything the coach must never say out loud: tiers are revealed on solve and nowhere
// else, and a set's identity is exactly what `so-close` refuses to carry.
const FORBIDDEN = [
  'green',
  'yellow',
  'red',
  'black',
  ...board.sets.map((s) => s.relationshipLabel),
  ...board.sets.map((s) => s.id),
  ...board.sets.flatMap((s) => s.pairs.flat())
];

/**
 * Does `text` name `term` as a word?
 *
 * Word boundaries, not substrings: "shared" contains "red" and "harden" contains "den".
 * Flagging those would force the copy into contortions to satisfy a broken check.
 */
function names(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

/**
 * Play one submission and hand back what the coach would say.
 *
 * Clears first, because the tutorial now LEAVES a wrong answer in the frame — without
 * this, a second attempt would submit terms the player has not actually selected, and
 * the test would stop resembling the game.
 */
function attempt(terms, from = fresh()) {
  const ready = pick(clearSelection(from), ...terms);
  assert.deepEqual([...ready.selectedTerms], terms, 'the frame holds exactly what is submitted');

  const { state, outcome } = submit(ready, ready.selectedTerms);
  return { state, outcome, step: tutorialStep(state, outcome) };
}

// ---------- the three ideas GDD §5.2 names ----------

test('a fresh tutorial board teaches the relationship idea first', () => {
  const step = tutorialStep(fresh());
  assert.equal(step.id, 'relationship');
  assert.match(step.body, /relationship/i);
});

test('the first idea is relationship-not-category — the habit GDD pillar 1 warns against', () => {
  assert.match(tutorialStep(fresh()).body, /categor/i);
});

test('every tap changes what the coach is saying — a still card reads as broken', () => {
  const words = ['Seed', 'Tree', 'Spark', 'Fire'];
  const said = [];

  let state = fresh();
  said.push(tutorialStep(state).id);
  for (const word of words) {
    state = select(state, word);
    said.push(tutorialStep(state).id);
  }

  assert.deepEqual(said, ['relationship', 'pair-hunt', 'notation', 'one-more', 'order']);
  assert.equal(new Set(said).size, said.length, 'a step repeated across consecutive taps');
});

test('the :: lesson lands at two words, when the frame first shows a whole pair', () => {
  const step = tutorialStep(pick(fresh(), 'Seed', 'Tree'));
  assert.equal(step.id, 'notation');
  assert.match(step.body, /::/);
  assert.match(step.body, /is to/i);
});

test('taking a word back is answered too, not met with silence', () => {
  const full = pick(fresh(), 'Seed', 'Tree', 'Spark', 'Fire');
  assert.equal(tutorialStep(full).id, 'order');
  assert.equal(tutorialStep(deselect(full, 'Fire')).id, 'one-more');
});

test('a full frame teaches that order matters, before Confirm is ever pressed', () => {
  const step = tutorialStep(pick(fresh(), 'Seed', 'Tree', 'Spark', 'Fire'));
  assert.equal(step.id, 'order');
  assert.match(step.body, /order/i);
});

// ---------- the diagnosis: every wrong submission says WHY ----------

test('the coach can see the submission that just happened', () => {
  // Everything below rests on this: a charged failure records its exact ordered
  // submission, so the last entry IS what the player just pressed Confirm on.
  const terms = ['Seed', 'Brush', 'Nest', 'Dough'];
  const { state } = attempt(terms);
  assert.deepEqual([...state.failedAttempts.at(-1)], terms);
});

test('cross-pairing is called out as cross-pairing, not as a vague wrong order', () => {
  // A : C :: B : D — the grouping habit the whole game is trying to unteach.
  const { outcome, step } = attempt(['Seed', 'Spark', 'Tree', 'Fire']);
  assert.equal(outcome.type, 'so-close');
  assert.equal(step.id, 'nudge-split');
  assert.match(step.body, /pair/i);
});

test('a backwards half is called out as a backwards half', () => {
  // Both halves are genuine pairs; the second one just runs the other way.
  const { outcome, step } = attempt(['Seed', 'Tree', 'Fire', 'Spark']);
  assert.equal(outcome.type, 'so-close');
  assert.equal(step.id, 'nudge-direction');
  assert.match(step.body, /back|reverse|direction|same way/i);
});

test('every one of a set’s 24 orderings is either accepted or diagnosed', () => {
  const set = board.sets[0];
  const words = set.pairs.flat();
  const accepted = acceptedOrders(set.pairs).map((o) => o.join('|'));

  const permute = (rest, chosen = []) =>
    rest.length === 0
      ? [chosen]
      : rest.flatMap((w, i) => permute(rest.toSpliced(i, 1), [...chosen, w]));

  const seen = { accepted: 0, 'nudge-split': 0, 'nudge-direction': 0 };
  for (const order of permute(words)) {
    if (accepted.includes(order.join('|'))) {
      seen.accepted += 1;
      continue;
    }
    const { step } = attempt(order);
    assert.ok(step.id in seen, `${order.join(' ')} produced ${step.id}`);
    seen[step.id] += 1;
  }

  // 4 accepted · 4 halves-intact-but-backwards · 16 with a half that mixes both pairs.
  assert.deepEqual(seen, { accepted: 4, 'nudge-split': 16, 'nudge-direction': 4 });
});

test('a miss with three from one set says exactly that', () => {
  const { outcome, step } = attempt(['Seed', 'Tree', 'Spark', 'Brush']);
  assert.equal(outcome.type, 'miss');
  assert.equal(step.id, 'nudge-three-and-one');
  assert.match(step.body, /three/i);
});

test('two-and-two is named as halves of two different relationships', () => {
  const { step } = attempt(['Seed', 'Tree', 'Brush', 'Painter']);
  assert.equal(step.id, 'nudge-two-and-two');
  assert.match(step.body, /two/i);
});

test('two plus two strays is distinguished from a clean two-and-two', () => {
  const { step } = attempt(['Seed', 'Tree', 'Brush', 'Nest']);
  assert.equal(step.id, 'nudge-two-and-strays');
});

test('four unrelated words are told they are four unrelated words', () => {
  const { outcome, step } = attempt(MISS);
  assert.equal(outcome.type, 'miss');
  assert.equal(step.id, 'nudge-scattered');
  assert.match(step.body, /four different|nothing in common|four separate/i);
});

test('every miss shape is covered — no submission falls through to a generic line', () => {
  const shapes = new Set();
  const words = board.sets.flatMap((s) => s.pairs.flat());

  // Sample broadly: every 4-word combination whose words span more than one set.
  for (let a = 0; a < words.length; a += 1) {
    for (let b = a + 1; b < words.length; b += 1) {
      for (let c = b + 1; c < words.length; c += 1) {
        for (let d = c + 1; d < words.length; d += 1) {
          const terms = [words[a], words[b], words[c], words[d]];
          const { outcome, step } = attempt(terms);
          if (outcome.type !== 'miss') continue;
          assert.notEqual(step.id, 'nudge-generic', `${terms.join(' ')} fell through`);
          shapes.add(step.id);
        }
      }
    }
  }
  assert.deepEqual(
    [...shapes].sort(),
    ['nudge-scattered', 'nudge-three-and-one', 'nudge-two-and-strays', 'nudge-two-and-two']
  );
});

// Four different wrong guesses can share a shape. Answering all of them with one
// sentence is what made the box look frozen, so each shape is a ladder the coach climbs.
const SAME_SHAPE = {
  'nudge-scattered': [
    ['Seed', 'Brush', 'Nest', 'Dough'],
    ['Tree', 'Painter', 'Bird', 'Bread'],
    ['Spark', 'Chisel', 'Den', 'Clay']
  ],
  'nudge-three-and-one': [
    ['Seed', 'Tree', 'Spark', 'Brush'],
    ['Seed', 'Tree', 'Fire', 'Painter'],
    ['Tree', 'Spark', 'Fire', 'Chisel']
  ],
  'nudge-two-and-two': [
    ['Seed', 'Tree', 'Brush', 'Painter'],
    ['Spark', 'Fire', 'Chisel', 'Sculptor']
  ],
  'nudge-two-and-strays': [
    ['Seed', 'Tree', 'Brush', 'Nest'],
    ['Spark', 'Fire', 'Painter', 'Bird']
  ],
  'nudge-split': [
    ['Seed', 'Spark', 'Tree', 'Fire'],
    ['Tree', 'Fire', 'Seed', 'Spark'],
    ['Fire', 'Tree', 'Spark', 'Seed']
  ],
  'nudge-direction': [
    ['Seed', 'Tree', 'Fire', 'Spark'],
    ['Tree', 'Seed', 'Spark', 'Fire']
  ]
};

/** Play a run of guesses that all diagnose the same way, collecting what the coach said. */
function ladder(id) {
  let state = fresh();
  return SAME_SHAPE[id].map((terms) => {
    const played = attempt(terms, state);
    assert.equal(played.step.id, id, `${terms.join(' ')} is not ${id}`);
    state = played.state;
    return played.step.body;
  });
}

test('making the same mistake again never gets the same sentence again', () => {
  for (const id of Object.keys(SAME_SHAPE)) {
    const said = ladder(id);
    assert.equal(new Set(said).size, said.length, `${id} repeated itself: ${said.join(' | ')}`);
  }
});

test('a ladder that runs out holds at its last rung rather than crashing', () => {
  let state = fresh();
  const said = [];
  // Six two-and-two mistakes against a two-rung ladder.
  for (let i = 0; i < 3; i += 1) {
    for (const terms of SAME_SHAPE['nudge-two-and-two']) {
      const played = attempt(terms, state);
      state = played.state;
      said.push(played.step.body);
    }
  }
  assert.equal(said.length, 6);
  assert.ok(said.every(Boolean), 'a rung came back empty');
  assert.equal(said.at(-1), said.at(-2), 'the top rung should hold once the ladder runs out');
});

test('the ladders are independent — one mistake does not use up another’s lines', () => {
  let state = fresh();
  for (const terms of SAME_SHAPE['nudge-scattered']) state = attempt(terms, state).state;

  // A first three-and-one after three scattered guesses still gets its opening line.
  const firstOfItsKind = attempt(SAME_SHAPE['nudge-three-and-one'][0], state).step;
  assert.equal(firstOfItsKind.body, ladder('nudge-three-and-one')[0]);
});

test('every rung of every ladder is short, clean, and gives nothing away', () => {
  for (const id of Object.keys(SAME_SHAPE)) {
    for (const body of ladder(id)) {
      assert.ok(body.length <= 135, `${id}: ${body.length} chars — ${body}`);
      for (const leak of FORBIDDEN) {
        assert.ok(!names(body, leak), `${id} leaked "${leak}": ${body}`);
      }
    }
  }
});

test('repeating an identical guess gets its own line, not a second telling-off', () => {
  // The realistic flow now: the wrong answer is still sitting in the frame, so pressing
  // Confirm again resubmits exactly it.
  const first = attempt(MISS);
  const again = submit(first.state, first.state.selectedTerms);
  assert.equal(again.outcome.type, 'already-tried');
  assert.equal(tutorialStep(again.state, again.outcome).id, 'nudge-repeat');
});

test('an invalid submission is a no-op and must not produce a nudge', () => {
  const state = pick(fresh(), 'Seed', 'Tree');
  const { outcome } = submit(state, state.selectedTerms); // only two words
  assert.equal(outcome.type, 'invalid');
  assert.equal(tutorialStep(state, outcome).id, 'notation');
});

test('a diagnosis is re-derived from the frame, so it survives without any memory', () => {
  const terms = ['Seed', 'Tree', 'Spark', 'Brush'];
  const { state, step } = attempt(terms);

  // No outcome, no previous-step hint — just the four words still sitting there.
  assert.equal(tutorialStep(state).id, step.id);
});

test('editing the failed answer hands the floor back to the coaching', () => {
  const { state } = attempt(['Seed', 'Tree', 'Spark', 'Brush']);
  assert.equal(tutorialStep(deselect(state, 'Brush')).id, 'one-more');
});

test('a fresh arrangement of the same four words is not still the old diagnosis', () => {
  const cross = ['Seed', 'Spark', 'Tree', 'Fire'];
  const { state } = attempt(cross);
  assert.equal(tutorialStep(state).id, 'nudge-split');

  // Drag one word: an untried order, so the coach stops explaining the old one.
  const reordered = pick(clearSelection(state), 'Seed', 'Tree', 'Fire', 'Spark');
  assert.equal(tutorialStep(reordered).id, 'order');
});

// ---------- no nudge may leak what the engine refused to say ----------

test('no diagnosis names a set, a tier, or a relationship label', () => {
  const submissions = [
    ['Seed', 'Spark', 'Tree', 'Fire'],
    ['Seed', 'Tree', 'Fire', 'Spark'],
    ['Seed', 'Tree', 'Spark', 'Brush'],
    ['Seed', 'Tree', 'Brush', 'Painter'],
    ['Seed', 'Tree', 'Brush', 'Nest'],
    MISS
  ];
  for (const terms of submissions) {
    const { step } = attempt(terms);
    const text = `${step.body} ${step.note ?? ''}`;
    for (const leak of FORBIDDEN) {
      assert.ok(!names(text, leak), `${step.id} leaked "${leak}": ${text}`);
    }
  }
});

test('a diagnosis never quotes the board’s words back — it describes the shape', () => {
  const { step } = attempt(['Seed', 'Tree', 'Spark', 'Brush']);
  for (const word of board.sets.flatMap((s) => s.pairs.flat())) {
    assert.ok(!step.body.includes(word), `quoted "${word}"`);
  }
});

// ---------- the reassurance, once ----------

test('the first wrong answer says the warm-up costs nothing; the second does not repeat it', () => {
  const first = attempt(['Seed', 'Tree', 'Spark', 'Brush']);
  assert.match(first.step.note, /no beans|nothing lost|costs? not/i);

  assert.equal(attempt(MISS, first.state).step.note, undefined);
});

// ---------- the diagnosis stays up while it is being acted on ----------

test('the tutorial runs no-lose and keeps the wrong answer on screen', () => {
  assert.equal(TUTORIAL_RULES.maxMistakes, Infinity);
  assert.equal(TUTORIAL_RULES.clearSelectionOnFail, false);
});

test('a wrong answer stays in the frame, so the diagnosis can be checked against it', () => {
  const terms = ['Seed', 'Tree', 'Spark', 'Brush'];
  const { state } = attempt(terms);
  assert.deepEqual([...state.selectedTerms], terms);
  assert.equal(state.status, 'playing');
});

test('a repeated guess also stays put — nothing is swept away mid-explanation', () => {
  const terms = ['Seed', 'Tree', 'Spark', 'Brush'];
  const first = attempt(terms);
  const again = submit(first.state, terms);
  assert.equal(again.outcome.type, 'already-tried');
  assert.deepEqual([...again.state.selectedTerms], terms);
});

test('acting on the advice is one tap: swap the stranger, keep the other three', () => {
  const { state, step } = attempt(['Seed', 'Tree', 'Spark', 'Brush']);
  assert.equal(step.id, 'nudge-three-and-one');

  const fixed = select(deselect(state, 'Brush'), 'Fire');
  assert.deepEqual([...fixed.selectedTerms], ['Seed', 'Tree', 'Spark', 'Fire']);
  assert.equal(submit(fixed, fixed.selectedTerms).outcome.type, 'solved');
});

test('the diagnosis holds while the failed answer is untouched, and yields the moment it is not', () => {
  const terms = ['Seed', 'Tree', 'Spark', 'Brush'];
  const { state, step } = attempt(terms);

  // Sitting there reading it: still explained.
  assert.equal(tutorialStep(state).id, step.id);
  // Acting on it: the coach moves with them rather than repeating itself.
  assert.equal(tutorialStep(deselect(state, 'Brush')).id, 'one-more');
});

test('a new submission replaces the old diagnosis', () => {
  const first = attempt(['Seed', 'Tree', 'Spark', 'Brush']);
  const second = attempt(['Seed', 'Spark', 'Tree', 'Fire'], first.state);
  assert.equal(tutorialStep(second.state, second.outcome, first.step.id).id, 'nudge-split');
});

test('solving outranks any diagnosis still on screen', () => {
  const first = attempt(['Seed', 'Tree', 'Spark', 'Brush']);
  const solved = attempt(['Seed', 'Tree', 'Spark', 'Fire'], first.state);
  assert.equal(tutorialStep(solved.state, solved.outcome, first.step.id).id, 'done');
});

// ---------- the hand-off ----------

test('solving the first set ends the coaching and offers the way out', () => {
  const solve = ['Seed', 'Tree', 'Spark', 'Fire'];
  const { outcome, step } = attempt(solve);
  assert.equal(outcome.type, 'solved');
  assert.equal(step.id, 'done');
  assert.equal(step.action, 'continue');
});

test('the way out stays on offer for good once a set is solved', () => {
  const { state } = attempt(['Seed', 'Tree', 'Spark', 'Fire']);

  // MISS holds Seed, which leaves the board with set-growth — a solve shrinks the board.
  const laterMoves = [
    tutorialStep(state),
    tutorialStep(pick(state, 'Brush')),
    tutorialStep(pick(state, 'Brush', 'Painter', 'Nest', 'Dough')),
    attempt(['Brush', 'Nest', 'Den', 'Dough'], state).step
  ];
  for (const step of laterMoves) assert.equal(step.action, 'continue', step.id);
});

// The bug this replaces: solving a set used to short-circuit every branch below it, so
// the coach congratulated you forever. Keep playing and a wrong answer changed nothing.
test('a player who keeps going after solving is still coached, not congratulated forever', () => {
  const { state, step } = attempt(['Seed', 'Tree', 'Spark', 'Fire']);
  assert.equal(step.id, 'done');

  assert.equal(tutorialStep(state).id, 'solved-idle');
  assert.equal(tutorialStep(pick(state, 'Brush')).id, 'pair-hunt');
  assert.equal(tutorialStep(pick(state, 'Brush', 'Painter')).id, 'notation');

  // The one from the screenshot: a wrong submission after a solve must be diagnosed.
  const wrong = attempt(['Brush', 'Painter', 'Nest', 'Dough'], state);
  assert.equal(wrong.outcome.type, 'miss');
  assert.equal(wrong.step.id, 'nudge-two-and-strays');
  assert.notEqual(wrong.step.body, step.body);
});

test('a second solve is celebrated again rather than silently ignored', () => {
  const first = attempt(['Seed', 'Tree', 'Spark', 'Fire']);
  const second = attempt(['Brush', 'Painter', 'Chisel', 'Sculptor'], first.state);
  assert.equal(second.outcome.type, 'solved');
  assert.equal(second.step.id, 'done');
});

test('before anything is solved, no step offers a way out', () => {
  const narrating = [
    tutorialStep(fresh()),
    tutorialStep(pick(fresh(), 'Seed')),
    tutorialStep(pick(fresh(), 'Seed', 'Tree', 'Spark', 'Fire')),
    attempt(MISS).step
  ];
  for (const step of narrating) assert.equal(step.action, null, step.id);
  assert.equal(attempt(['Seed', 'Tree', 'Spark', 'Fire']).step.action, 'continue');
});

test('the coach goes quiet once the game is over — the end screen owns that moment', () => {
  let state = fresh();
  for (const set of board.sets) {
    const order = [...set.pairs[0], ...set.pairs[1]];
    state = submit(pick(state, ...order), order).state;
  }
  assert.equal(state.status, 'won');
  assert.equal(tutorialStep(state), null);
});

// ---------- shape ----------

test('every step is short enough to sit above the controls without pushing the board', () => {
  const steps = [
    tutorialStep(fresh()),
    tutorialStep(pick(fresh(), 'Seed')),
    tutorialStep(pick(fresh(), 'Seed', 'Tree', 'Spark', 'Fire')),
    attempt(['Seed', 'Spark', 'Tree', 'Fire']).step,
    attempt(['Seed', 'Tree', 'Fire', 'Spark']).step,
    attempt(['Seed', 'Tree', 'Spark', 'Brush']).step,
    attempt(['Seed', 'Tree', 'Brush', 'Painter']).step,
    attempt(['Seed', 'Tree', 'Brush', 'Nest']).step,
    attempt(MISS).step,
    attempt(['Seed', 'Tree', 'Spark', 'Fire']).step
  ];
  for (const step of steps) {
    assert.ok(step.body.length <= 135, `${step.id} is ${step.body.length} chars: ${step.body}`);
    if (step.note) assert.ok(step.note.length <= 60, `${step.id} note is ${step.note.length}`);
  }
});

test('it is pure — the same state twice gives the same step, and state is untouched', () => {
  const state = pick(fresh(), 'Seed', 'Tree');
  const before = JSON.stringify(state.selectedTerms);
  assert.deepEqual(tutorialStep(state), tutorialStep(state));
  assert.equal(JSON.stringify(state.selectedTerms), before);
});
