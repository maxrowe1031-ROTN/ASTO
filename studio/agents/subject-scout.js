// Subject Scout — invents ONE fresh subject for a surprise-me run (design.md
// D-15).
//
// NOT a pipeline stage. It runs once at run CREATION, before a run directory
// exists, which is why nothing here touches a store: there is no run to write
// to yet. The caller (studio/subject.js) owns the history, the never-reuse
// guard and the fallbacks; this agent owns only the creative ask.
//
// Why a model at all: the static pool in corpus/subjects.js holds 91 strings
// and the run history lapped the original 50 twice — Max caught photography,
// theatre and the kitchen repeating within a day. A list can be extended;
// only a generator can be fresh every time. The pool remains as the fallback.
//
// The style axis is decided by the CALLER, never left to the model to
// alternate (a model asked to "mix it up" drifts to one mode). `world` asks
// for a concrete domain of things; `lens` asks for the First Light shape —
// an evocative angle that paints a picture while still naming a world of
// concrete things. Max's chosen experiment is a deliberate half-and-half mix,
// so every batch carries its own comparison (design.md D-15).

import { JSON_ONLY, composePrompt, parseJson, validateAgainst } from './agent-kit.js';
import { slugify } from '../slug.js';

export const id = 'subject-scout';
export const stageId = '00-subject-scout';

const MAX_SUBJECT_LENGTH = 48;

const SCHEMA = {
  type: 'object',
  required: ['subject'],
  properties: {
    subject: { type: 'string', minLength: 1, maxLength: MAX_SUBJECT_LENGTH },
  },
};

export function getOutputSchema() {
  return SCHEMA;
}

// The same taste the hand-curated pool was built with (corpus/subjects.js):
// Max called the ocean board "very science driven... too much makes the puzzle
// lose its fun factor" and praised boards that "strike a peaceful chord".
const BANDING = [
  'Taste guidance, learned from the editor\'s own verdicts: lean everyday, sensory and cultural.',
  'Hard-science subjects are welcome only as a rare minority — they tend to make boards feel clinical.',
  'Whimsy is prized: clocks, mirrors, shadows, fairy tales are the register this game calls its own.',
  'The subject seeds a 16-word puzzle board, so it must be rich in concrete, recognisable THINGS — a subject with no nouns in it cannot become a board.',
  // Batch two came back "the harvest moon, the night train, the umbrella shop…" —
  // six for six on one shape (D-15 amendment, 2026-08-11). The reflex is the rut.
  'Vary the grammatical shape of the subject: bare noun phrases ("harvest supper"), gerunds ' +
    '("mending nets"), prepositional turns ("after the rain") are all welcome. "The <thing>" is ' +
    'allowed but must not be the reflex — if the most recent subjects on the used list already ' +
    'start with "the", choose a different shape this time.',
];

const STYLE_ASKS = {
  world:
    'Style for THIS pick: a WORLD — one concrete domain of things, named plainly. ' +
    'Think "blacksmithing", "the harbor", "street food". The unity comes from the domain itself.',
  lens:
    'Style for THIS pick: a LENS — an evocative angle that paints a picture while still naming a ' +
    'world of concrete things. "First light" is the exemplar: it admits bread, dew, kilns and ' +
    'birdsong yet feels like one lovely moment. The failure to avoid reads like "money to animals ' +
    'to geology" — a mood with no world under it. The subject must still make sixteen concrete ' +
    'words feel inevitable together.',
};

export function buildPrompt(input = {}, context) {
  const { used = [], style = 'world' } = input;

  return composePrompt({
    role:
      'You are the Subject Scout for ASTO, a cozy word-analogy puzzle. Your one job: invent a single ' +
      'FRESH subject for the next surprise-me board — a subject this project has never used before.',
    context,
    task: [
      STYLE_ASKS[style] ?? STYLE_ASKS.world,
      'The used list below is a hard avoid-list. Do not return anything on it, and do not return a close ' +
        'overlap of anything on it — "cameras and lenses" is not fresh next to "photography", and ' +
        '"the stage" is not fresh next to "theatre". Genuinely elsewhere, not adjacent.',
      ...BANDING,
      'Two to five words, lowercase, plain language. No title case, no punctuation beyond spaces and apostrophes.',
    ].join('\n'),
    data: ['Subjects already used, oldest first:', ...used.map((theme) => `- ${theme}`)].join('\n'),
    outputRules: [`Return { "subject": "..." }.`, JSON_ONLY].join(' '),
  });
}

export function parse(text) {
  return parseJson(text);
}

// A subject that cannot survive slugify cannot name a run directory — and the
// slug is also the key the caller's never-reuse guard compares on.
const subjectIsSluggable = (output) =>
  slugify(output.subject) === null
    ? [{ path: 'subject', message: `"${output.subject}" does not survive slugification — use plain words` }]
    : [];

export function validateOutput(output) {
  return validateAgainst(output, SCHEMA, [subjectIsSluggable]);
}
