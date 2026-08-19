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
import { registerById, REGISTERS } from '../corpus/registers.js';
import { slugify } from '../slug.js';

export const id = 'subject-scout';
export const stageId = '00-subject-scout';

const MAX_SUBJECT_LENGTH = 48;

const MAX_FAMILY_LENGTH = 32;

// `family` is required, and that is the point: naming the franchise or core
// idea out loud is what lets CODE refuse a second board from it. Four Harry
// Potter subjects sharing no significant word slipped past every earlier guard
// (D-15 second amendment, 2026-08-18) because nothing ever asked which story
// they came from.
const SCHEMA = {
  type: 'object',
  required: ['subject', 'family'],
  properties: {
    subject: { type: 'string', minLength: 1, maxLength: MAX_SUBJECT_LENGTH },
    family: { type: 'string', minLength: 1, maxLength: MAX_FAMILY_LENGTH },
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
  // Shape. Shortened when the register landed, on the theory that the register
  // was doing the real work — and the very next sampling came back 85% "the
  // <thing>", WORSE than the 74% before. Restored and stated as a proportion,
  // because "must not be the reflex" is a judgement the model kept passing
  // itself on, and a number is not.
  'Vary the grammatical shape. AT MOST HALF of subjects should open with "the" — the rest must ' +
    'take another shape: bare noun phrases ("harvest supper"), gerunds ("mending nets"), ' +
    'prepositional turns ("after the rain"), plain plurals ("tide pools"), or a name on its own. ' +
    'If the recent subjects below already open with "the", this one must not.',
  // Added after the same sampling: a quarter of 100 subjects ended in a
  // time-of-day tail ("at dawn", "at dusk", "by lamplight"). An atmosphere tic
  // that survives any register, so it is named here rather than per register.
  'Do not append a time of day or lighting to make a subject feel evocative — no "at dawn", ' +
    '"at dusk", "at midnight", "by lamplight". Let the subject itself be interesting.',
];

// The register's own ask (corpus/registers.js) carries what the retired D-17
// paragraph used to plead for. Assignment replaced instruction because the
// instruction was measured and did not work — see the corpus file's header.
// Asked plainly. A family that dodges ("gringotts") is caught by the alias
// table anyway (corpus/families.js), so there is nothing to gain by hedging the
// question — but asking plainly gets the easy cases right for free.
const FAMILY_ASK =
  'Also name the SUBJECT FAMILY this belongs to, in one to three plain words: the franchise, ' +
  'place or core idea a reader would say it is about. "hogwarts common room" -> "harry potter"; ' +
  '"the salt mines of bolivia" -> "salt"; "seventh-inning stretch" -> "baseball". ONE board per ' +
  'family, ever — if a family already appears on the used list, that whole story or idea is ' +
  'spent, so reach for a different one entirely rather than another corner of it.';

const CASE_RULE = {
  open:
    'Two to five words, plain language. Proper names ARE welcome in this register — capitalise ' +
    'them normally (Harry Potter, the Silk Road, Mars). No punctuation beyond spaces, ' +
    'apostrophes and hyphens.',
  plain:
    'Two to five words, lowercase, plain language. No title case, no punctuation beyond spaces ' +
    'and apostrophes.',
};

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
  const { used = [], style = 'world', register = REGISTERS[0].id } = input;
  const assigned = registerById(register) ?? REGISTERS[0];

  return composePrompt({
    role:
      'You are the Subject Scout for ASTO, a word-analogy puzzle. Your one job: invent a single ' +
      'FRESH subject for the next surprise-me board — a subject this project has never used before.',
    context,
    task: [
      assigned.ask,
      STYLE_ASKS[style] ?? STYLE_ASKS.world,
      'The used list below is a hard avoid-list. Do not return anything on it, and do not return a close ' +
        'overlap of anything on it — "cameras and lenses" is not fresh next to "photography", and ' +
        '"the stage" is not fresh next to "theatre". Genuinely elsewhere, not adjacent.',
      ...BANDING,
      assigned.allowProperNouns ? CASE_RULE.open : CASE_RULE.plain,
      FAMILY_ASK,
    ].join('\n'),
    data: ['Subjects already used, oldest first:', ...used.map((theme) => `- ${theme}`)].join('\n'),
    outputRules: [`Return { "subject": "...", "family": "..." }.`, JSON_ONLY].join(' '),
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
