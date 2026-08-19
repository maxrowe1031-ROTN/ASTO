// Revision Proposer semantics.
//
// The agent exists because of a measured gap: on 2026-08-05 stages 05 and 06
// had already found both defects Max found — 06 named the Louvre/Museum
// collision almost in his words — and nothing routed that anywhere, so he
// re-derived them by hand.
//
// Its two rules are the ones this file pins, because both were learned from a
// board that would have been damaged without them:
//
//   Max's verdict outranks the evaluators'. On the paris board 05 failed and
//   06 flagged `[high] unfair` the set he liked BEST.
//   It proposes, never authors — the D-1 guardrail.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as proposer from '../../../studio/agents/revision-proposer.js';

const BOARD = {
  id: 'asto-spy',
  title: 'Tradecraft Analogies',
  sets: [
    { id: 'set-specialist-tool', relationshipLabel: 'a specialist and their tool', difficulty: 1, pairs: [['sniper', 'rifle'], ['safecracker', 'lockpick']] },
    { id: 'set-category-instrument', relationshipLabel: 'a category and a kind', difficulty: 2, pairs: [['disguise', 'wig'], ['document', 'visa']] },
    { id: 'set-mission-bookends', relationshipLabel: 'mirrored moments', difficulty: 3, pairs: [['briefing', 'debriefing'], ['infiltration', 'exfiltration']] },
    { id: 'set-role-marker', relationshipLabel: 'a role and its marker', difficulty: 4, pairs: [['spy', 'alias'], ['operative', 'cyanide pill']] },
  ],
};

// Max's actual feedback on the spy board, trimmed to what the agent reads.
const FEEDBACK = [
  { action: 'reject-board', scope: { type: 'board' }, tags: ['strong-reveal', 'feels-like-asto'], note: 'fun and challenging, but one set breaks it', blockers: ['set-role-marker'] },
  { action: 'set-publishable', scope: { type: 'set', setId: 'set-specialist-tool' }, tags: ['good-unchanged'], note: 'a great green' },
  { action: 'set-replace', scope: { type: 'set', setId: 'set-role-marker' }, tags: ['relationship-does-not-click'], fixSuggestion: 'spy is to alias as gun is to holster' },
];

const output = (overrides = {}) => ({
  summary: 'One set blocks the board.',
  fromStage: '04-board-builder',
  fixes: [
    {
      setId: 'set-role-marker',
      problem: 'the pairs are not at the same grain',
      source: 'both',
      candidates: ['spy : alias :: gun : holster'],
    },
  ],
  doNotChange: ['set-specialist-tool'],
  ...overrides,
});

const check = (value) => proposer.validateOutput(value, { board: BOARD });

test('a well-formed proposal validates', () => {
  assert.equal(check(output()).ok, true);
});

test('a fix naming a set that is not on the board is rejected', () => {
  // A brief nobody can execute. The board builder would have nothing to act on.
  const result = check(output({ fixes: [{ ...output().fixes[0], setId: 'set-imaginary' }] }));
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /not a set on this board/);
});

test('a set cannot be both fixed and protected', () => {
  const result = check(output({ doNotChange: ['set-role-marker'] }));
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /both/);
});

// The scope guard (D-17 second amendment, 2026-08-11). Pre-review, the
// allowlisted findings are the WHOLE mandate — and the smell-of-rain
// auto-revision proved the old validator's gap by rewriting seven sets from a
// two-finding mandate, coming back more obscure than it left. A pre-review
// proposal may now fix only the sets its findings name.
test('pre-review, a fix outside the findings mandate is refused', () => {
  const result = proposer.validateOutput(
    output({
      fixes: [
        { ...output().fixes[0], setId: 'set-role-marker' },
        { setId: 'set-mission-bookends', problem: 'x', source: 'evaluator', candidates: ['y'] },
      ],
      doNotChange: ['set-specialist-tool', 'set-category-instrument'],
    }),
    { board: BOARD, preReview: { findings: [{ setIds: ['set-role-marker'] }] } },
  );
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /mandate/i);
});

test('pre-review, fixes on exactly the finding-named sets validate', () => {
  const result = proposer.validateOutput(
    output({ doNotChange: BOARD.sets.map((s) => s.id).filter((id) => id !== 'set-role-marker') }),
    { board: BOARD, preReview: { findings: [{ setIds: ['set-role-marker'] }] } },
  );
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

// The legacy call shape — `preReview: true`, no findings attached — keeps the
// completeness rule but cannot scope-check; it must not start refusing.
test('preReview as a bare boolean still validates as before', () => {
  const result = proposer.validateOutput(
    output({ doNotChange: BOARD.sets.map((s) => s.id).filter((id) => id !== 'set-role-marker') }),
    { board: BOARD, preReview: true },
  );
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('fromStage must be a stage a revision can actually re-enter at', () => {
  // 05 onwards only re-evaluates the same board; the gate is deterministic.
  assert.equal(check(output({ fromStage: '06-adversarial-solver' })).ok, false);
  assert.equal(check(output({ fromStage: '01-pair-author' })).ok, true);
});

test('a proposal must carry at least one fix — an empty brief is not a proposal', () => {
  assert.equal(check(output({ fixes: [] })).ok, false);
});

test('candidates are capped at three — a brief is a decision, not a menu', () => {
  const fix = { ...output().fixes[0], candidates: ['a', 'b', 'c', 'd'] };
  assert.equal(check(output({ fixes: [fix] })).ok, false);
});

test('each fix says whose judgement it rests on', () => {
  const fix = { ...output().fixes[0], source: 'vibes' };
  assert.equal(check(output({ fixes: [fix] })).ok, false);
  for (const source of ['max', 'evaluator', 'both']) {
    assert.equal(check(output({ fixes: [{ ...output().fixes[0], source }] })).ok, true);
  }
});

// --- the prompt ---

test('the prompt states that the editor outranks the evaluators', () => {
  const prompt = proposer.buildPrompt({ board: BOARD, feedback: FEEDBACK, findings: {} }, {});
  assert.match(prompt, /authority/i);
  assert.match(prompt, /EVIDENCE, not authority/);
  // The paris lesson, stated where the model will read it.
  assert.match(prompt, /flagged sets he liked/i);
});

test('the prompt carries Max\'s own fix as the leading candidate instruction', () => {
  const prompt = proposer.buildPrompt({ board: BOARD, feedback: FEEDBACK, findings: {} }, {});
  assert.match(prompt, /holster/, 'his fixSuggestion never reached the prompt');
  assert.match(prompt, /leading candidate/i);
});

test('the prompt demands concrete fixes and forbids the vague kind', () => {
  const prompt = proposer.buildPrompt({ board: BOARD, feedback: FEEDBACK, findings: {} }, {});
  assert.match(prompt, /"Improve the relationship" is not a fix/);
});

test('the prompt asks for the praised sets to be protected', () => {
  const prompt = proposer.buildPrompt({ board: BOARD, feedback: FEEDBACK, findings: {} }, {});
  assert.match(prompt, /doNotChange/);
  assert.match(prompt, /repairs one set and spoils another/i);
});

test('the playthrough is offered as evidence when there was one', () => {
  const withPlay = [
    ...FEEDBACK,
    { action: 'playthrough', scope: { type: 'board' }, source: 'review-studio-play', playthrough: { solvedOrder: ['set-specialist-tool'], mistakes: 2 } },
  ];
  const prompt = proposer.buildPrompt({ board: BOARD, feedback: withPlay, findings: {} }, {});
  assert.match(prompt, /How he actually played it/);
  // And it is not mistaken for a judgement — it appears in its own block.
  assert.match(prompt, /solvedOrder/);
});

test('buildPrompt survives a board with no findings and no context', () => {
  assert.doesNotThrow(() => proposer.buildPrompt({ board: BOARD, feedback: [] }, undefined));
  assert.doesNotThrow(() => proposer.buildPrompt({}, {}));
});

// --- candidates must stay inside the theme's world (2026-08-19) -----------
//
// Root cause of three terminal failures across batches five and six: the
// proposer suggested replacement words from another domain to fix a structural
// problem, the reviser used them as instructed, and enforceRevisionUnity then
// failed the whole attempt for importing them. In every case the fatal word was
// the proposer's own suggestion — "kickoff:final whistle (sports game)" onto a
// brass band parade, "Kneading"/"Baking" onto a tannery, "backlit silhouette"
// onto a puppeteer's trunk. The proposer optimised for "an unrelated span" while
// the guard demanded "the same world", and nothing reconciled them.

test('both prompts require candidate fixes to stay inside the board\'s world', () => {
  const board = { title: 'Brass Band Parade', sets: [] };
  const forEditor = proposer.buildPrompt({ board, feedback: [{ action: 'reject', note: 'x' }], findings: [] });
  const preReview = proposer.buildPrompt({ board, findings: [], preReview: true });

  for (const [label, prompt] of [['editor', forEditor], ['pre-review', preReview]]) {
    assert.match(prompt, /world|theme/i, `${label} prompt should speak about the theme's world`);
    assert.match(
      prompt,
      /outside|another domain|different domain|other domain/i,
      `${label} prompt should warn against reaching outside it`,
    );
  }
});
