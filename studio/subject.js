// subject.js — a fresh subject for every surprise-me run (design.md D-15).
//
// The rule this module enforces, in Max's words: the surprise generator must
// not reuse a theme — fresh every time if the generator is capable, and no
// loop. He caught photography, theatre and the kitchen repeating within a day;
// the cause was structural, since `pickSubject` drew blind from 50 strings
// while the run history held 105 themes.
//
// The chain, loop-free by construction — bounded model rounds, then a filter,
// then an ordering; no path retries forever and no path throws:
//
//   1. The Subject Scout invents one (two rounds max, proposer-style), guarded
//      mechanically: an answer whose SLUG matches any used theme's slug is
//      rejected — "Photography" is not fresh next to "photography".
//   2. Fallback A: the static pool filtered to never-used subjects.
//   3. Fallback B: the least-recently-used subject — Max's ~50-board cooldown
//      floor by construction, reachable only with the model unavailable AND
//      the whole pool used.
//
// "Used" means every non-mock run's theme, themed and surprise alike — a theme
// Max typed yesterday is just as stale for the GENERATOR to re-draw. The rule
// only governs surprise-me picks; Max typing a theme is never blocked.
//
// Accepted limitation, recorded rather than engineered away: two runs created
// in the same instant race the history read and could draw similar subjects.
// Runs are started one at a time in practice — each creation records its theme
// before the next POST reads the manifests — so this stays a comment.
//
// Shared by both doors (api.js and run.js), like auto-revise.js and for the
// same scar. Boundary law: no fs, no fetch — history through the store, the
// model through llm.js.

import { loadAgent } from './agents/index.js';
import { createLlm } from './llm.js';
import { DEFAULT_CONFIG, effortFor, maxTokensFor, modelFor } from './pipeline-config.js';
import { canonicalFamily } from './corpus/families.js';
import { REGISTERS } from './corpus/registers.js';
import { SUBJECTS } from './corpus/subjects.js';
import { slugify } from './slug.js';

export const SCOUT_STAGE = '00-subject-scout';

/**
 * Every non-mock run's theme, oldest first (listRuns() sorts ascending and the
 * run id leads with its timestamp, so store order IS creation order — which is
 * what the LRU fallback needs). Corrupt manifests are skipped, not fatal:
 * one unreadable run must not stop every future run from being created.
 *
 * Each entry carries the manifest's brief so the style balance can be read
 * from the same pass.
 */
export function usedThemes(store) {
  const used = [];
  for (const runId of store?.listRuns() ?? []) {
    let manifest;
    try {
      manifest = store.readManifest(runId);
    } catch {
      continue;
    }
    if (manifest.brief?.mock === true) continue;
    if (typeof manifest.theme !== 'string' || manifest.theme.length === 0) continue;
    used.push({ theme: manifest.theme, brief: manifest.brief ?? {} });
  }
  return used;
}

/**
 * Which style this pick should ask for: whichever of world/lens is
 * underrepresented among past surprise-me scout picks, the injected random
 * deciding ties. The CALLER assigns style — a model asked to "mix it up"
 * drifts to one mode, and the half-and-half experiment (design.md D-15) needs
 * the balance held from outside.
 *
 * Only surprise-me runs count (`relationshipShapes` is the marker a themed
 * brief never carries — variety.js's SURPRISE_ME_ONLY rule), and only runs
 * that recorded a style: fallback picks record null and must not tilt the A/B.
 */
export function styleFor(used, random = Math.random) {
  let world = 0;
  let lens = 0;
  for (const { brief } of used) {
    if (!Array.isArray(brief.relationshipShapes)) continue;
    if (brief.subjectStyle === 'world') world += 1;
    if (brief.subjectStyle === 'lens') lens += 1;
  }
  if (world < lens) return 'world';
  if (lens < world) return 'lens';
  return random() < 0.5 ? 'world' : 'lens';
}

/**
 * Which register this pick should work in: whichever of the six is
 * underrepresented among past scout picks, the injected random breaking ties.
 *
 * Assigned by the CALLER for the same reason style is, and now with the
 * evidence to prove it (design.md D-15 second amendment): across 31 scout
 * picks, the two axes left to prose collapsed — 74% opened "the <thing>" and
 * proper nouns never appeared at all — while caller-assigned style came out
 * 15/16. A model asked to widen its own range does not.
 *
 * Counts only surprise-me runs (`relationshipShapes`, variety.js's
 * SURPRISE_ME_ONLY marker) that recorded a register still in the corpus. Runs
 * from before this axis existed carry none, and a retired id counts for
 * nothing rather than pinning the rotation to a register that is gone.
 */
export function registerFor(used, random = Math.random) {
  const counts = new Map(REGISTERS.map(({ id }) => [id, 0]));
  for (const { brief } of used) {
    if (!Array.isArray(brief?.relationshipShapes)) continue;
    const id = brief.subjectRegister;
    if (counts.has(id)) counts.set(id, counts.get(id) + 1);
  }

  const fewest = Math.min(...counts.values());
  const owed = REGISTERS.filter(({ id }) => counts.get(id) === fewest);
  // Corpus order decides nothing on its own: with a fresh history every
  // register ties, and always answering the first would make cozy-premises the
  // opening pick forever — the exact rut this axis exists to break.
  return owed[Math.min(owed.length - 1, Math.floor(random() * owed.length))].id;
}

/**
 * How many recent subjects the echo guard looks back over. A window rather than
 * the whole history on purpose: "workshop" must not be banned from the project
 * forever, it must not appear twice in a fortnight.
 */
/**
 * How far back the FAMILY guard looks. Max's rule, in his words: no repeats
 * "on any subject in 100 variations" — so a hundred, where the word guard's
 * window is a mere 25. The two windows differ because the failures differ: a
 * repeated word inside a fortnight reads as sloppiness, while a second harry
 * potter board inside a hundred reads as the generator having one idea.
 */
/**
 * Is this the same subject family, allowing for the ways one idea gets spelled
 * two ways? Plurals ("brass bands" / "brass band"), word order, and one family
 * sitting INSIDE another ("egypt" within "ancient egypt").
 *
 * Exact string comparison was the last blind spot (v3 sampling, 2026-08-18):
 * the guard let "brass band parade" and "brass band on parade" through as
 * different families, and the sampler's own repeat metric — comparing the same
 * way — reported zero repeats over a list containing one. An instrument must
 * not share its subject's blind spot, so both now call this.
 *
 * Subset rather than intersection on purpose: "ancient egypt" and "ancient
 * rome" share a word without sharing a family, and matching on any overlap
 * would collapse them.
 */
export function familiesMatch(a, b) {
  const wordsA = familyWords(a);
  const wordsB = familyWords(b);
  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
  return shorter.every((word) => longer.some((other) => sameWord(word, other)));
}

/** A family as its raw comparable words; singular/plural is handled per word. */
const familyWords = (family) =>
  String(family ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * The forms a word might be written in, so a word can be compared to its own
 * plural without ever having to decide which one is "the" singular.
 *
 * Stripping the trailing "s" and calling that the singular is the rule that let
 * "octopus" and "octopuses" past the guard (v4, 2026-08-18): it turned them
 * into "octopu" and "octopuse", two words that match nothing including each
 * other. English has plenty of singular nouns ending in s — canvas, atlas,
 * compass — so the fix is to generate CANDIDATES and intersect them rather than
 * to guess a root.
 */
function forms(word) {
  const set = new Set([word]);
  if (word.length > 3 && word.endsWith('es')) set.add(word.slice(0, -2)); // octopuses -> octopus
  // Not for "ss": brass must not yield bras, nor chess yield ches.
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) set.add(word.slice(0, -1));
  return set;
}

/** Two words are the same word if any of their written forms coincide. */
function sameWord(a, b) {
  if (a === b) return true;
  const formsB = forms(b);
  for (const form of forms(a)) if (formsB.has(form)) return true;
  return false;
}

export const FAMILY_WINDOW = 100;

/**
 * The canonical family of a pick: the franchise, place or core idea it belongs
 * to, normalised so two vocabularies of one fiction collapse to one name.
 *
 * The scout REPORTS its family, and the alias table OVERRULES it. That order is
 * the whole point: self-reporting is the failure this axis keeps rediscovering,
 * and a scout labelling "gringotts vault chambers" as family "gringotts" has
 * answered honestly and uselessly. Both the label and the subject text are
 * scanned, so a dodge in either place still lands on "harry potter".
 */
export function familyOf(subject, family) {
  // Spaces kept rather than slugified: this string is both a Set key AND the
  // word the retry feedback says back to the scout ("another harry potter
  // subject"), and "harry-potter" reads like a filename. Lowercasing and
  // collapsing punctuation is enough to make it a reliable key, and it matches
  // the alias table's own key spelling.
  const plain = (text) =>
    String(text ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || null;

  return canonicalFamily(family) ?? canonicalFamily(subject) ?? plain(family) ?? plain(subject);
}

export const RECENT_WINDOW = 25;

// Words too common or too structural to count as repetition. "over" earns its
// place by evidence: it opened five subjects in the first sampling ("dawn over
// the great barrier reef", "sunrise over machu picchu"…) as a preposition, not
// a repeated idea.
const ECHO_STOP = new Set([
  'over', 'under', 'with', 'from', 'into', 'after', 'before', 'their', 'there',
  'that', 'this', 'then', 'than', 'first', 'last', 'next', 'more', 'most',
]);

/** The words in a subject that carry its idea: four letters or more, not structural. */
export const significantWords = (subject) =>
  new Set(
    String(subject)
      .toLowerCase()
      .replace(/[^a-z ]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 4 && !ECHO_STOP.has(word)),
  );

/**
 * Does this subject echo one of the recent ones? Returns the shared word, or null.
 *
 * The gap slug equality left (measured 2026-08-18): a 100-pick sampling produced
 * 29 within-register clusters — salt x3, oracle x3, pinball x3, frost x4 — and
 * not one was a slug match, because "the salt flats at sunset" and "the salt
 * mines of bolivia" are different strings naming the same idea twice. Every one
 * of those clusters shared a literal word, so this needs no model to catch them.
 *
 * Returning the WORD rather than a boolean is what lets the retry tell the scout
 * exactly what it repeated, which is the difference between a useful second
 * round and a blind one.
 */
export function echoesRecent(subject, recentSubjects = []) {
  const words = significantWords(subject);
  if (words.size === 0) return null;
  for (const recent of recentSubjects) {
    for (const word of significantWords(recent)) {
      if (words.has(word)) return word;
    }
  }
  return null;
}

const usedSlugSet = (used) =>
  new Set(used.map(({ theme }) => slugify(theme)).filter(Boolean));

/**
 * The chain. Returns { subject, source, style }:
 *
 *   source 'scout'    — the model invented it; style is 'world' or 'lens'
 *   source 'pool'     — never-used static subject; style null
 *   source 'pool-lru' — least-recently-used static subject; style null
 *
 * Style and register are null on fallbacks on purpose: the pool has neither
 * axis, and a fallback pick counted into either balance would tilt a rotation
 * that never steered it.
 *
 * Never throws. A transport failure, a missing fixture, a model that answers
 * badly twice — all of them land in the fallbacks, because run creation must
 * always succeed.
 */
export async function pickFreshSubject({
  store,
  transport,
  context = {},
  config = DEFAULT_CONFIG,
  random = Math.random,
} = {}) {
  const used = usedThemes(store);
  const usedSlugs = usedSlugSet(used);
  const style = styleFor(used, random);
  const register = registerFor(used, random);

  const recent = used.slice(-RECENT_WINDOW).map(({ theme }) => theme);
  // Runs from before the family axis carry none, so their THEME stands in — an
  // approximation, but a truthful one: "the puppet workshop" really was a
  // puppet subject, and guessing nothing would let the old era repeat freely.
  const recentFamilies = new Set(
    used
      .slice(-FAMILY_WINDOW)
      .map(({ theme, brief }) => brief?.subjectFamily ?? familyOf(theme, null))
      .filter(Boolean),
  );

  const scouted = await scout({
    used, usedSlugs, recent, recentFamilies, style, register, transport, context, config,
  });
  if (scouted) return { subject: scouted.subject, family: scouted.family, source: 'scout', style, register };

  // Fallback A: the pool, minus everything ever used. A single filter pass —
  // never rejection sampling, which is the loop Max asked this design to
  // never contain.
  const unused = SUBJECTS.filter((subject) => !usedSlugs.has(slugify(subject)));
  if (unused.length > 0) {
    const subject = unused[Math.floor(random() * unused.length)];
    return { subject, family: familyOf(subject, null), source: 'pool', style: null, register: null };
  }

  // Fallback B: every pool subject has been used — pick the one used longest
  // ago. `used` is oldest-first, so the LAST index per slug is its most recent
  // use, and the pool subject with the smallest such index is the coldest.
  const lastUse = new Map();
  used.forEach(({ theme }, index) => {
    const slug = slugify(theme);
    if (slug) lastUse.set(slug, index);
  });
  const coldest = [...SUBJECTS].sort(
    (a, b) => (lastUse.get(slugify(a)) ?? -1) - (lastUse.get(slugify(b)) ?? -1),
  )[0];
  return { subject: coldest, family: familyOf(coldest, null), source: 'pool-lru', style: null, register: null };
}

// Two rounds against the model, mechanically guarded. Returns the subject or
// null — every failure reason (transport, parse, validation, staleness twice)
// means "fall back", and the distinction is not worth a record for a pick this
// cheap to retry by hand.
async function scout({ used, usedSlugs, recent, recentFamilies, style, register, transport, context, config }) {
  if (!transport) return null;
  const agent = loadAgent('subject-scout');
  const llm = createLlm({ transport });
  const effort = effortFor(SCOUT_STAGE, config);
  const request = {
    stageId: SCOUT_STAGE,
    model: modelFor(SCOUT_STAGE, config),
    prompt: agent.buildPrompt({ used: used.map(({ theme }) => theme), style, register }, context),
    maxTokens: maxTokensFor(SCOUT_STAGE, config),
    // Spread rather than set: an absent effort must reach the transport as an
    // absent key, since some models reject the parameter outright.
    ...(effort ? { effort } : {}),
  };

  try {
    let feedback;
    for (let round = 1; round <= 2; round += 1) {
      const { text } = await llm.send(request, { maxAttempts: 2, feedback });
      const parsed = agent.parse(text);
      const validation = parsed.ok ? agent.validateOutput(parsed.value) : parsed.failure;

      if (parsed.ok && validation.ok) {
        const subject = parsed.value.subject.trim().toLowerCase();
        const family = familyOf(subject, parsed.value.family);

        // Three guards, coarsest first. Slug equality catches an outright reuse;
        // the FAMILY guard catches one fiction wearing several vocabularies
        // (hogwarts / diagon alley / gringotts share no word at all); the echo
        // guard catches the same idea reworded. Each was added because the one
        // before it was measured and found blind.
        if (usedSlugs.has(slugify(subject))) {
          feedback = `"${subject}" (or a close spelling of it) has already been used. Choose a subject from genuinely different territory.`;
          continue;
        }
        const repeated = [...(recentFamilies ?? [])].find((seen) => familiesMatch(seen, family));
        if (repeated) {
          feedback =
            `"${subject}" is another ${repeated} subject, and ${repeated} has already been used. ` +
            `One board per subject family — pick an entirely different franchise, place or idea, ` +
            `not another corner of this one.`;
          continue;
        }
        const echo = echoesRecent(subject, recent ?? []);
        if (echo === null) return { subject, family };
        feedback =
          `"${subject}" repeats "${echo}", which a recent subject already used. ` +
          `Pick something that shares no significant word with the recent list — a different idea, not a rewording of one.`;
        continue;
      }

      const errors = parsed.ok
        ? validation.errors
        : [{ path: '(parse)', message: validation.message }];
      feedback = `Your previous reply was rejected: ${errors
        .map((e) => `${e.path}: ${e.message}`)
        .join('; ')}. Reply with corrected JSON only.`;
    }
    return null;
  } catch {
    return null; // transport trouble is a fallback, never a failed run creation
  }
}
