// No prompt may hand an agent a finished board set.
//
// This pins a CLASS of mistake, not the one instance of it that was found.
//
// The instance: D-8 put a full set in 01's prompt to teach arrangement-hard
// difficulty — "planting : felling :: budding : withering" — and it came back
// as output. `trees-tools-and-time`'s published Black is that line verbatim,
// and the 2026-08-08 rose board returned "planting : uprooting :: budding :
// wilting", a paraphrase that no ban on the literal words would have caught.
//
// The measurement that generalises it, over all 15 published boards: the 36
// PAIR-level examples in the vocabulary block leaked ZERO times; the single
// FULL-SET example leaked immediately and then again. What matters is not how
// vivid an example is but whether it is shaped like the deliverable — a pair
// illustrates a property, a finished set is an answer, and an answer in the
// prompt is an answer in the output.
//
// So the rule is enforced across the GENERATIVE stages as a class, not just
// the two files that were caught. Fixing 01 and 03 alone would have left the
// same mistake available in 02 and 04.
//
// ═══ WHY GENERATIVE ONLY ═══
//
// Running this over all eight agents immediately flagged 06 and 07, and they
// are both RIGHT to carry full sets:
//
//   06 shows "guitarist : drummer :: guitar : drum kit" and says of it
//   "symmetry, not analogy... the answer is false" — a counter-example of a
//   reading it must refuse.
//   07 shows "dawn : dusk :: birth : death" as an order the words themselves
//   settle, against "Ruth : Gehrig :: Mantle : Maris", which they do not.
//
// Neither can leak, because neither agent's OUTPUT is a set: 06 returns
// findings, 07 returns a playthrough. The hazard was never "a full set appears
// in a prompt" — it is "a full set appears in a prompt belonging to a stage
// whose job is to produce one", where the example is indistinguishable from a
// finished deliverable. A stage that judges sets needs to be shown sets.
//
// The generative three are the same three D-11 threads revision context into,
// for the same underlying reason: they are the stages that MAKE the board.
// See design.md D-12 and studio/corpus/examples.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STAGES } from '../../../studio/stage-registry.js';
import { loadAgent } from '../../../studio/agents/index.js';

const AGENT_IDS = STAGES.filter((s) => s.kind === 'agent').map((s) => s.agent);

// The stages that AUTHOR the board. Everything else evaluates one, and an
// evaluator has to be shown sets — see the header.
const GENERATIVE = ['pair-author', 'theme-grouper', 'board-builder', 'difficulty-rater'];
const EVALUATORS = AGENT_IDS.filter((id) => !GENERATIVE.includes(id));

// Enough input for every agent to render a full prompt. Mirrors
// contract.test.js — this file asks a different question of the same surface.
const someInput = {
  'pair-author': { brief: { relationshipShapes: ['transformation'], count: 8 }, theme: 'lantern' },
  'theme-grouper': { pairs: [{ a: 'Seed', b: 'Tree', relationshipLabel: 'grows into' }] },
  'difficulty-rater': {
    sets: [{ id: 's1', relationshipLabel: 'grows into', pairs: [['Seed', 'Tree'], ['Spark', 'Fire']] }],
  },
  'board-builder': {
    gradedSets: [
      { id: 's1', relationshipLabel: 'grows into', pairs: [['Seed', 'Tree'], ['Spark', 'Fire']], difficulty: 1 },
    ],
  },
  'analogy-validator': { board: { id: 'b', title: 'B', sets: [] } },
  'adversarial-solver': { board: { id: 'b', title: 'B', sets: [] }, integrity: { accepted: 16 } },
  'test-player': { words: Array.from({ length: 16 }, (_, i) => `W${i}`), maxMistakes: 4 },
  'style-guide': { items: [{ setId: 's1', relationshipLabel: 'grows into', explanation: 'x' }] },
};

/**
 * A quoted, concrete, four-term analogy: `"planting : felling :: budding :
 * withering"`.
 *
 * Lowercase words only, which is what makes this safe to run over every
 * prompt: the abstract form the prompts legitimately use everywhere is
 * `A : B :: C : D`, single uppercase letters, and it does not match. Real
 * words do.
 */
const FULL_SET_EXAMPLE = /"[a-z][a-z' -]{2,} : [a-z][a-z' -]{2,} :: [a-z][a-z' -]{2,} : [a-z][a-z' -]{2,}"/;

const promptOf = (id) => loadAgent(id).buildPrompt(someInput[id], {});

// `difficulty-rater` is in the generative list even though it grades rather
// than authors: it is the stage that DEFINES what arrangement-hard means for
// the pipeline, so it must teach that from the same altitude 01 authors from,
// or the two drift about what they are naming.
for (const id of GENERATIVE) {
  test(`${id}: its prompt quotes no finished set`, () => {
    const prompt = promptOf(id);
    const found = prompt.match(FULL_SET_EXAMPLE);
    assert.equal(
      found,
      null,
      `${id} makes boards and its prompt shows a complete four-word set (${found?.[0]}). ` +
        'Teach with a PAIR — a finished set is an answer, and an answer in the prompt comes ' +
        'back as output. See studio/corpus/examples.js.',
    );
  });
}

// The mirror, so nobody later "fixes" an evaluator by deleting the examples it
// needs. 06 and 07 judge sets; showing them one is how they learn the call.
test('the evaluators keep their counter-examples — they judge sets, they do not write them', () => {
  const withSets = EVALUATORS.filter((id) => FULL_SET_EXAMPLE.test(promptOf(id)));
  assert.ok(
    withSets.includes('adversarial-solver') && withSets.includes('test-player'),
    'an evaluator lost the worked example it needs to make its call',
  );
});

// The specific string, kept beside the general rule and checked over EVERY
// agent — the regex could be loosened by a future edit without anyone
// noticing, and this line must never come back anywhere.
test('the line that leaked is in no prompt any agent sees', () => {
  for (const id of AGENT_IDS) {
    assert.doesNotMatch(
      promptOf(id),
      /planting : felling :: budding : withering/,
      `${id} still carries the example that was published as a board's Black`,
    );
  }
});

// The rule is "no finished SETS", never "no examples". Pair-level examples are
// what teaches these agents — 36 of them ride in the vocabulary block alone —
// and this test must not be read later as an argument for removing them.
test('pair-level examples are untouched — they are the thing that works', () => {
  const prompt = promptOf('pair-author');
  assert.match(prompt, /"planting : felling"/, 'the arrangement anchor was lost, not demoted');
  assert.match(prompt, /like flower : tulip/, 'the vocabulary block stopped carrying paradigms');
});

// The demotion only helps if the model is told the pair is not a starting
// point — the rose board did not copy the example, it paraphrased it.
test('the author is warned off paraphrasing the example, not just copying it', () => {
  assert.match(promptOf('pair-author'), /near-synonyms/);
});
