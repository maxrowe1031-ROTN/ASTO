// Style Guide (GDD §12.1 #8) — checks labels and explanations against ASTO's
// voice: cozy, smart, playful, adult. Never snarky, never academic.
//
// One copy pass only. It SUGGESTS edits and never rewrites meaning — the GDD
// is explicit that taste stays human, so this agent proposes and the editor
// disposes.
//
// Since 2026-08-04 (design.md D-3) it also carries the UNITY verdict: do the
// sixteen words read as one world, or does a set feel imported from another
// puzzle? Unity is the half of ASTO's goal that cannot be mechanically gated
// (variety is enforced in code at 02 and 04a), so it is scored and SHOWN on
// the review card, never used to reject a board — Max stays the authority.
//
// Since 2026-08-05 (design.md D-7) it carries EVOCATIVENESS beside it, because
// unity turned out to be only half the question. A Grateful Dead board scored
// "unity: strong" — "every word sits comfortably inside one coherent world" —
// and Max rejected it as "an absolute snooze". Both readings were correct: the
// two axes are orthogonal, and only one of them was being measured. A board of
// a subject's most obvious nouns is perfectly unified by construction, so unity
// can never catch it. Same treatment as unity: scored, shown, never enforced.

import { JSON_ONLY, asJsonBlock, composePrompt, parseJson, validateAgainst } from './agent-kit.js';

export const id = 'style-guide';
export const stageId = '08-style-guide';

const SCHEMA = {
  type: 'object',
  required: ['edits', 'compliant', 'unity', 'evocativeness'],
  properties: {
    compliant: { type: 'boolean' },
    edits: {
      type: 'array',
      items: {
        type: 'object',
        required: ['setId', 'field', 'suggestion', 'reason'],
        properties: {
          setId: { type: 'string', minLength: 1 },
          field: { type: 'string', enum: ['relationshipLabel', 'explanation', 'title'] },
          suggestion: { type: 'string', minLength: 1 },
          reason: { type: 'string', minLength: 1 },
        },
      },
    },
    unity: {
      type: 'object',
      required: ['verdict', 'reasoning'],
      properties: {
        verdict: { type: 'string', enum: ['strong', 'adequate', 'weak'] },
        reasoning: { type: 'string', minLength: 1 },
        outliers: {
          type: 'array',
          items: {
            type: 'object',
            required: ['word', 'note'],
            properties: {
              word: { type: 'string', minLength: 1 },
              note: { type: 'string', minLength: 1 },
            },
          },
        },
      },
    },
    // The other axis, added 2026-08-05. Same shape as unity on purpose — it is
    // the same KIND of judgement (shown, never enforced) — but its evidence is
    // a replacement word rather than an outlier, because that is the form Max's
    // own most useful note took: "replacing 'Steal Your Face logo' with
    // 'Stealie' would have made this puzzle better".
    evocativeness: {
      type: 'object',
      required: ['verdict', 'reasoning'],
      properties: {
        verdict: { type: 'string', enum: ['strong', 'adequate', 'generic'] },
        reasoning: { type: 'string', minLength: 1 },
        generic: {
          type: 'array',
          items: {
            type: 'object',
            required: ['word', 'note'],
            properties: {
              word: { type: 'string', minLength: 1 },
              suggestion: { type: 'string', minLength: 1 },
              note: { type: 'string', minLength: 1 },
            },
          },
        },
      },
    },
    // Report-only, like everything else this stage renders (design.md D-13,
    // second amendment). Max on the school board: "at least it didn't generate
    // anything about mass shootings, that would be an automatic throw out" —
    // the throw-out is HIS, so this only names what he should look at.
    // Optional: an output without the field predates it, and the evaluator
    // report's boundary rule applies — absence is "could not report", not a
    // clean bill.
    contentConcerns: {
      type: 'array',
      items: {
        type: 'object',
        required: ['word', 'note'],
        properties: {
          word: { type: 'string', minLength: 1 },
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
  const { items = [], title = null, words = [], theme = null } = input;

  return composePrompt({
    role:
      "You are the Style Guide for ASTO. ASTO's voice is warm, calm, lightly whimsical and adult — " +
      'the shorthand is "Animal Crossing for sophisticated adults". ' +
      'The goal of a board: the theme unifies the words, the relationships diversify the questions.',
    context,
    task: [
      'Read every relationship label and explanation and check it against the voice:',
      '  - Short and friendly. No academic phrasing, no jargon.',
      '  - No snark, no scolding, no congratulating the player on being clever.',
      '  - An explanation states why the analogy holds, in one sentence, so it feels fair in hindsight.',
      '  - Do not over-explain. If the set speaks for itself, say it is compliant.',
      'Suggest edits only where the copy actually falls short. Never change what a label or explanation MEANS — if the meaning is wrong, that is the editor\'s call, not a copy fix. Say so in the reason instead.',
      'Then judge UNITY: read the sixteen words as a player will, before knowing any answer.',
      '  - "strong": one world — every word could sit in the same picture, and no set feels imported from a different puzzle.',
      '  - "adequate": the world holds, but a word or a set sits slightly outside its register.',
      '  - "weak": the words read as lists from different puzzles that happen to share a title.',
      'Name every word that sits outside the world in "outliers", each with a one-line note. Unity is shown to the editor, never enforced — be honest, not lenient.',
      '',
      // The second axis. A board can be perfectly unified and completely dead:
      // on 2026-08-05 a Grateful Dead board scored "unity: strong" — "every
      // word sits comfortably inside one coherent world" — and the editor's
      // verdict was "an absolute snooze". Both were right. See design.md D-7.
      theme
        ? `Then judge EVOCATIVENESS, which is a different question from unity and must be answered separately. The subject is: ${theme}. Unity asks whether the words belong to one world. This asks whether they are worth visiting — would someone who cares about this subject feel recognised here, or is this the most obvious possible take on it?`
        : 'Then judge EVOCATIVENESS: would someone who cares about this board\'s subject feel recognised here, or are these the most obvious possible words for it?',
      '  - "strong": the words reach for what is distinctive about the subject. Someone who loves it would nod.',
      '  - "adequate": on subject and inoffensive, but it stays near the obvious middle.',
      '  - "generic": the most basic terms associated with the subject, arranged correctly. Technically fine, nothing learned, nothing felt.',
      'Unity is the floor here, not the evidence — a board of a subject\'s most obvious nouns will always be perfectly unified, and that is exactly the failure this verdict exists to catch.',
      'In "generic", name each word that settles for the general when a sharper one exists, and give the sharper one in "suggestion" where you can — "Stealie" for "Steal Your Face logo", "woodshop" for "workshop". A word only belongs here if the replacement would still be recognisable; swapping in something nobody knows is a different failure, not a fix.',
      '',
      // Report-only, never a verdict: the editor called this class of content
      // "an automatic throw out", so the throw-out is his to make — this pass
      // only makes sure nothing in it reaches him unexamined.
      'Finally, CONTENT: name in "contentConcerns" any word or set that touches real-world violence, tragedy, disaster, or anything a player could reasonably find distressing — this is a cozy game, and such material is out of register whatever the theme. An empty list is the normal answer; do not manufacture concerns. This is a flag for the editor, not a judgement on the board.',
      'This is one pass. Do not iterate.',
    ].join('\n'),
    data: asJsonBlock(
      'The board',
      Object.fromEntries(
        Object.entries({ theme, title, words, items }).filter(([, value]) => value !== null),
      ),
    ),
    outputRules: [
      'Return { "edits": [ { "setId", "field", "suggestion", "reason" } ], "compliant": true or false, "unity": { "verdict", "reasoning", "outliers": [ { "word", "note" } ] }, "evocativeness": { "verdict", "reasoning", "generic": [ { "word", "suggestion", "note" } ] }, "contentConcerns": [ { "word", "note" } ] }.',
      '"field" is one of relationshipLabel, explanation, title — the one your "suggestion" would replace.',
      '"unity.verdict" is one of strong, adequate, weak. "evocativeness.verdict" is one of strong, adequate, generic.',
      'If everything is in voice, return "compliant": true and an empty "edits".',
      JSON_ONLY,
    ].join(' '),
  });
}

export function parse(text) {
  return parseJson(text);
}

const compliantAgreesWithEdits = (output) => {
  const clean = output.edits.length === 0;
  return output.compliant === clean
    ? []
    : [{ path: 'compliant', message: `must be ${clean} to match an edit list of ${output.edits.length}` }];
};

// A weak or adequate verdict with no named outliers is a judgement the editor
// cannot act on — the whole point of scoring unity is that Max sees WHERE the
// world breaks, not just that it does.
const verdictNamesItsEvidence = (output) => {
  const outliers = output.unity?.outliers ?? [];
  if (output.unity?.verdict === 'weak' && outliers.length === 0) {
    return [
      {
        path: 'unity.outliers',
        message: 'a weak verdict must name the words that break the world',
      },
    ];
  }
  return [];
};

// Same discipline as unity's, for the same reason: "this board is generic" is
// a judgement Max can do nothing with. "'workshop' should have been 'woodshop'"
// is one he can act on in seconds — and it is the form his own most useful note
// took, which is why the verdict has to carry its words.
const genericVerdictNamesItsWords = (output) => {
  const named = output.evocativeness?.generic ?? [];
  if (output.evocativeness?.verdict === 'generic' && named.length === 0) {
    return [
      {
        path: 'evocativeness.generic',
        message: 'a generic verdict must name the words that settled for the obvious',
      },
    ];
  }
  return [];
};

export function validateOutput(output) {
  return validateAgainst(output, SCHEMA, [
    compliantAgreesWithEdits,
    verdictNamesItsEvidence,
    genericVerdictNamesItsWords,
  ]);
}
