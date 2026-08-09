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

const usedSlugSet = (used) =>
  new Set(used.map(({ theme }) => slugify(theme)).filter(Boolean));

/**
 * The chain. Returns { subject, source, style }:
 *
 *   source 'scout'    — the model invented it; style is 'world' or 'lens'
 *   source 'pool'     — never-used static subject; style null
 *   source 'pool-lru' — least-recently-used static subject; style null
 *
 * Style is null on fallbacks on purpose: the pool has no style axis, and a
 * fallback pick counted into the A/B would dilute exactly the comparison the
 * experiment exists to make.
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

  const scouted = await scout({ used, usedSlugs, style, transport, context, config });
  if (scouted) return { subject: scouted, source: 'scout', style };

  // Fallback A: the pool, minus everything ever used. A single filter pass —
  // never rejection sampling, which is the loop Max asked this design to
  // never contain.
  const unused = SUBJECTS.filter((subject) => !usedSlugs.has(slugify(subject)));
  if (unused.length > 0) {
    return { subject: unused[Math.floor(random() * unused.length)], source: 'pool', style: null };
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
  return { subject: coldest, source: 'pool-lru', style: null };
}

// Two rounds against the model, mechanically guarded. Returns the subject or
// null — every failure reason (transport, parse, validation, staleness twice)
// means "fall back", and the distinction is not worth a record for a pick this
// cheap to retry by hand.
async function scout({ used, usedSlugs, style, transport, context, config }) {
  if (!transport) return null;
  const agent = loadAgent('subject-scout');
  const llm = createLlm({ transport });
  const effort = effortFor(SCOUT_STAGE, config);
  const request = {
    stageId: SCOUT_STAGE,
    model: modelFor(SCOUT_STAGE, config),
    prompt: agent.buildPrompt({ used: used.map(({ theme }) => theme), style }, context),
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
        // The never-reuse rule, enforced at slug level so case and punctuation
        // variants of a used theme cannot slip back in.
        if (!usedSlugs.has(slugify(subject))) return subject;
        feedback = `"${subject}" (or a close spelling of it) has already been used. Choose a subject from genuinely different territory.`;
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
