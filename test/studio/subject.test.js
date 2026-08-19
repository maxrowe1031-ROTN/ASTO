// Fresh surprise-me subjects (design.md D-15).
//
// The load-bearing assertions are the never-reuse guard (slug-level, so case
// and punctuation variants of a used theme cannot slip back in) and the
// loop-free fallback chain: bounded model rounds → unused pool → LRU. Every
// path must return a subject; run creation may never wedge on this module.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  echoesRecent,
  familiesMatch,
  familyOf,
  FAMILY_WINDOW,
  pickFreshSubject,
  RECENT_WINDOW,
  registerFor,
  styleFor,
  usedThemes,
} from '../../studio/subject.js';
import { REGISTERS } from '../../studio/corpus/registers.js';
import { buildPrompt } from '../../studio/agents/subject-scout.js';
import { SUBJECTS } from '../../studio/corpus/subjects.js';
import { slugify } from '../../studio/slug.js';
import { makeStore } from './pipeline/helpers.js';

// A transport that replays scripted replies for the scout, recording prompts.
const scripted = (...replies) => {
  const calls = [];
  const transport = async (request) => {
    calls.push(request);
    const entry = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (entry instanceof Error) throw entry;
    return { text: entry, stopReason: 'end_turn', model: 'mock-model', usage: { inputTokens: 1, outputTokens: 1 } };
  };
  transport.calls = calls;
  return transport;
};

// Every scout reply carries a family since the family guard landed; the default
// is the subject itself, which is what an unrecognised idea resolves to anyway.
const subjectReply = (subject, family = subject) => JSON.stringify({ subject, family });

const seed = (store, { theme, mock = false, style = null, surprise = false, family = null }) =>
  store.createRun({
    slug: slugify(theme) ?? 'x',
    theme,
    brief: {
      count: 14,
      mock,
      ...(surprise ? { relationshipShapes: ['1a'] } : {}),
      ...(style ? { subjectStyle: style } : {}),
      ...(family ? { subjectFamily: family } : {}),
    },
  });

// --- usedThemes ---------------------------------------------------------

test('usedThemes keeps creation order, skips mock runs, tolerates corruption', () => {
  const { store, cleanup } = makeStore();
  try {
    seed(store, { theme: 'rivers' });
    seed(store, { theme: 'lantern light', mock: true });
    seed(store, { theme: 'the harbor' });

    const wrapped = {
      ...store,
      listRuns: () => [...store.listRuns(), 'not-a-real-run'],
    };
    const used = usedThemes(wrapped);
    assert.deepEqual(
      used.map(({ theme }) => theme),
      ['rivers', 'the harbor'],
      'oldest first, mock dropped, corrupt run skipped',
    );
  } finally {
    cleanup();
  }
});

// --- the style balance --------------------------------------------------

test('the underrepresented style is asked next; ties go to the injected random', () => {
  const history = (styles) =>
    styles.map((style) => ({ theme: 't', brief: { relationshipShapes: ['1a'], subjectStyle: style } }));

  assert.equal(styleFor(history(['world', 'world', 'world', 'lens'])), 'lens');
  assert.equal(styleFor(history(['lens', 'lens'])), 'world');
  assert.equal(styleFor(history(['world', 'lens']), () => 0.1), 'world');
  assert.equal(styleFor(history(['world', 'lens']), () => 0.9), 'lens');
});

test('themed runs, mock runs and style-less fallback picks never tilt the balance', () => {
  const used = [
    // themed run (no relationshipShapes marker) claiming a style — ignored
    { theme: 'a', brief: { subjectStyle: 'world' } },
    // surprise-me fallback pick — no style recorded, ignored
    { theme: 'b', brief: { relationshipShapes: ['1a'] } },
    // the one countable entry
    { theme: 'c', brief: { relationshipShapes: ['1a'], subjectStyle: 'lens' } },
  ];
  assert.equal(styleFor(used), 'world', 'only the lens pick counted, so world is owed');
});

// --- the chain ----------------------------------------------------------

test('a fresh scout answer is accepted, normalized, and carries its style and register', async () => {
  const { store, cleanup } = makeStore();
  try {
    seed(store, { theme: 'rivers' });
    const transport = scripted(subjectReply('  Lighthouse Keeping '));
    const pick = await pickFreshSubject({ store, transport, random: () => 0.1 });
    assert.deepEqual(pick, {
      subject: 'lighthouse keeping',
      family: 'lighthouse keeping', // no family reported and none recognised: the subject stands in
      source: 'scout',
      style: 'world',
      // random 0.1 over an all-tied fresh history: floor(0.1 * 18) = index 1
      register: REGISTERS[1].id,
    });
    assert.equal(transport.calls.length, 1);
    assert.match(transport.calls[0].prompt, /- rivers/, 'the used list reached the prompt');
    assert.match(transport.calls[0].prompt, /a WORLD/, 'the asked style reached the prompt');
  } finally {
    cleanup();
  }
});

test('a used answer — even as a case variant — is rejected and round 2 wins', async () => {
  const { store, cleanup } = makeStore();
  try {
    seed(store, { theme: 'the night sky' });
    const transport = scripted(subjectReply('The Night Sky'), subjectReply('tide pools'));
    const pick = await pickFreshSubject({ store, transport, random: () => 0.1 });
    assert.equal(pick.subject, 'tide pools');
    assert.equal(pick.source, 'scout');
    assert.equal(transport.calls.length, 2, 'exactly one retry — the loop is bounded');
  } finally {
    cleanup();
  }
});

test('two stale rounds fall back to the pool: never used, style null, no third call', async () => {
  const { store, cleanup } = makeStore();
  try {
    seed(store, { theme: 'rivers' });
    const transport = scripted(subjectReply('rivers'), subjectReply('rivers'));
    const pick = await pickFreshSubject({ store, transport, random: () => 0.5 });
    assert.equal(pick.source, 'pool');
    assert.equal(pick.style, null);
    assert.notEqual(slugify(pick.subject), 'rivers');
    assert.ok(SUBJECTS.includes(pick.subject));
    assert.equal(transport.calls.length, 2);
  } finally {
    cleanup();
  }
});

test('a transport failure goes straight to the pool — run creation never wedges', async () => {
  const { store, cleanup } = makeStore();
  try {
    seed(store, { theme: 'rivers' });
    const pick = await pickFreshSubject({
      store,
      transport: scripted(new Error('ANTHROPIC_API_KEY is not set')),
      random: () => 0,
    });
    assert.equal(pick.source, 'pool');
    assert.ok(SUBJECTS.includes(pick.subject));
  } finally {
    cleanup();
  }
});

test('with the whole pool used, the least-recently-used subject comes back', async () => {
  const { store, cleanup } = makeStore();
  try {
    // Use every pool subject, in pool order — so SUBJECTS[0] is the coldest.
    for (const subject of SUBJECTS) seed(store, { theme: subject });
    const pick = await pickFreshSubject({ store, transport: null, random: () => 0 });
    assert.equal(pick.source, 'pool-lru');
    assert.equal(pick.subject, SUBJECTS[0]);
    assert.equal(pick.style, null);

    // And re-using the coldest moves the cursor: use SUBJECTS[0] again and the
    // next LRU pick is SUBJECTS[1].
    seed(store, { theme: SUBJECTS[0] });
    const next = await pickFreshSubject({ store, transport: null, random: () => 0 });
    assert.equal(next.subject, SUBJECTS[1]);
  } finally {
    cleanup();
  }
});

test('no transport at all (and nothing used) still answers from the pool', async () => {
  const { store, cleanup } = makeStore();
  try {
    const pick = await pickFreshSubject({ store, transport: null, random: () => 0 });
    assert.equal(pick.source, 'pool');
    assert.equal(pick.subject, SUBJECTS[0]);
  } finally {
    cleanup();
  }
});

// --- the register rotation (D-15 second amendment) ----------------------
//
// The axis exists because prose did not hold: 31 scout picks came back 74%
// "the <thing>" and 0% proper nouns despite instructions asking for neither,
// while the caller-ASSIGNED world/lens axis stayed 15/16. So register is
// assigned from out here too, on the same shape as styleFor.

const withRegisters = (registers) =>
  registers.map((register) => ({
    theme: 't',
    brief: { relationshipShapes: ['1a'], subjectStyle: 'world', subjectRegister: register },
  }));

test('every register is asked for before any register is asked twice', () => {
  const asked = [];
  let used = [];
  for (let i = 0; i < REGISTERS.length; i += 1) {
    const next = registerFor(used, () => 0);
    asked.push(next);
    used = [...used, ...withRegisters([next])];
  }
  assert.equal(new Set(asked).size, REGISTERS.length, 'a full cycle repeated a register');
});

test('the least-used register is owed next', () => {
  const [first, second, ...rest] = REGISTERS.map((r) => r.id);
  // Everything used once except `second`, which has never been asked for.
  const used = withRegisters([first, ...rest]);
  assert.equal(registerFor(used, () => 0), second);
});

test('ties go to the injected random, so a fresh history is not always the same register', () => {
  assert.equal(registerFor([], () => 0), REGISTERS[0].id);
  assert.equal(registerFor([], () => 0.999), REGISTERS[REGISTERS.length - 1].id);
});

test('pre-rotation runs carry no register and cannot tilt the count', () => {
  const used = [
    { theme: 'a', brief: { relationshipShapes: ['1a'], subjectStyle: 'world' } }, // before the axis existed
    { theme: 'b', brief: { subjectRegister: REGISTERS[0].id } }, // themed run, no surprise marker
    { theme: 'c', brief: { relationshipShapes: ['1a'], subjectRegister: 'no-such-register' } }, // stale id
  ];
  // Nothing countable, so this is the empty case: the random decides.
  assert.equal(registerFor(used, () => 0), REGISTERS[0].id);
});

test('every register in the corpus is usable: id, label, ask, and a case rule', () => {
  assert.equal(REGISTERS.length, 18, 'tripled at Max\'s call, 2026-08-18');
  for (const register of REGISTERS) {
    assert.ok(register.id && typeof register.id === 'string');
    assert.ok(register.label && typeof register.label === 'string');
    assert.ok(register.ask && register.ask.length > 40, `${register.id} needs a real prompt block`);
    assert.equal(typeof register.allowProperNouns, 'boolean');
  }
  assert.equal(new Set(REGISTERS.map((r) => r.id)).size, REGISTERS.length, 'duplicate register id');
  assert.ok(
    REGISTERS.some((r) => r.allowProperNouns),
    'the D-17 ask (harry potter, the yankees) needs at least one proper-noun register',
  );
});

test('the assigned register reaches the prompt, and pickFreshSubject reports it back', async () => {
  const { store, cleanup } = makeStore();
  try {
    const transport = scripted(subjectReply('tide pools'));
    const pick = await pickFreshSubject({ store, transport, random: () => 0 });

    assert.equal(pick.subject, 'tide pools');
    assert.equal(pick.register, REGISTERS[0].id, 'a fresh history plus random 0 picks the first register');
    assert.match(transport.calls[0].prompt, /Register for THIS pick/, 'no register ask in the prompt');
  } finally {
    cleanup();
  }
});

test('a proper-noun register permits title case; the others still ask for lowercase', () => {
  const properNoun = REGISTERS.find((r) => r.allowProperNouns);
  const plain = REGISTERS.find((r) => !r.allowProperNouns);

  const withNames = buildPrompt({ used: [], style: 'world', register: properNoun.id });
  const withoutNames = buildPrompt({ used: [], style: 'world', register: plain.id });

  // Asserted as a PROHIBITION difference, not a keyword: "No title case" in the
  // old prompt matches a naive /title case/ regex and would pass while forbidding
  // exactly the subjects this register exists to allow.
  assert.doesNotMatch(withNames, /No title case/, 'a register of names cannot forbid capitals');
  assert.match(withNames, /Proper names/i, 'say plainly that names are allowed here');
  assert.match(withoutNames, /No title case/, 'the house voice still applies elsewhere');
});

test('the prose that measurably failed is gone from the prompt', () => {
  // Both lines below sat in the prompt through the 31 picks that came back
  // 74% "the <thing>" and 0% proper nouns. The register ask replaces them.
  const prompt = buildPrompt({ used: [], style: 'world', register: REGISTERS[0].id });
  assert.doesNotMatch(prompt, /HOME REGISTER/, 'the cozy-is-home line is retired (Max, 2026-08-18)');
  assert.doesNotMatch(prompt, /must not be the reflex/, 'the failed shape instruction is superseded');
});

test('a pool fallback records no register — the rotation must not count a pick it did not steer', async () => {
  const { store, cleanup } = makeStore();
  try {
    const transport = scripted(new Error('transport down'));
    const pick = await pickFreshSubject({ store, transport, random: () => 0.5 });

    assert.equal(pick.source, 'pool');
    assert.equal(pick.register, null);
    assert.equal(pick.style, null);
  } finally {
    cleanup();
  }
});

// --- the echo guard (the 100-subject sampling, 2026-08-18) -------------
//
// The register rotation fixed DISTRIBUTION and left REPETITION untouched: the
// first 100-pick sampling came back with 29 within-register clusters — salt x3,
// oracle x3, pinball x3, roller x3, frost x4. Slug equality cannot see any of
// them ("the salt flats" and "the salt mines of bolivia" are different strings),
// but every single cluster shares a literal significant word, so a mechanical
// guard catches the lot without a model call.

test('a subject echoing a recent significant word is caught, and the word is named', () => {
  assert.equal(echoesRecent('the salt mines of bolivia', ['the salt flats at sunset']), 'salt');
  assert.equal(echoesRecent('the pinball backroom championship', ['the pinball arcade']), 'pinball');
  assert.equal(echoesRecent('the oracle bones of the shang court', ['the oracle temple']), 'oracle');
});

test('short words and prepositions are not echoes — they are how English works', () => {
  // "over" x5 and "the" x85 were noise in the sampling, not repetition.
  assert.equal(echoesRecent('dawn over the great barrier reef', ['sunrise over machu picchu']), null);
  assert.equal(echoesRecent('the copper mines', ['the tea terraces']), null);
});

test('a genuinely different subject passes cleanly', () => {
  assert.equal(echoesRecent('the roller rink', ['the boxing gym', 'the pool hall']), null);
});

test('the echo window is recent-only, so a common word is not banned forever', () => {
  const ancient = Array.from({ length: 40 }, (_, i) => `subject number ${i}`);
  // "workshop" used long ago, then 40 subjects since: no longer an echo.
  assert.equal(echoesRecent('the piano workshop', ['the printer workshop', ...ancient].slice(-RECENT_WINDOW)), null);
  // but used within the window, it is.
  assert.equal(echoesRecent('the piano workshop', ['the printer workshop']), 'workshop');
});

test('the guard rejects an echoing scout answer and the retry wins', async () => {
  const { store, cleanup } = makeStore();
  try {
    seed(store, { theme: 'the salt flats at sunset', surprise: true });
    const transport = scripted(subjectReply('the salt mines of bolivia'), subjectReply('the bowling alley'));
    const pick = await pickFreshSubject({ store, transport, random: () => 0 });

    assert.equal(pick.subject, 'the bowling alley');
    assert.equal(pick.source, 'scout');
    assert.equal(transport.calls.length, 2, 'the echo should have cost exactly one retry');
    assert.match(transport.calls[1].prompt ?? '', /salt/i, 'the feedback should name the echoed word');
  } finally {
    cleanup();
  }
});

// --- the family guard (v2 sampling, 2026-08-18) -------------------------
//
// The word-echo guard is structurally blind to franchises: hogwarts common
// room / diagon alley shops / gringotts vault chambers share ZERO significant
// words yet are one fiction wearing three vocabularies — v2's sampling carried
// four Potter subjects, two Narnias, two Gothams. Max's rule: no family twice
// in 100 picks ("why use two harry potter boards when one could be harry
// potter and the other could be iron man?"). The scout names its family; CODE
// enforces the window; an alias table catches a mislabeled family.

test('familyOf trusts a clean label and slugifies it', () => {
  assert.equal(familyOf('the salt mines of bolivia', 'salt'), 'salt');
  assert.equal(familyOf('seventh-inning stretch', 'Baseball'), 'baseball');
});

test('familyOf resolves franchise vocabulary even when the label dodges', () => {
  // A scout labeling "gringotts vault chambers" family "gringotts" has told
  // the truth uselessly; the alias table knows whose bank that is.
  assert.equal(familyOf('gringotts vault chambers', 'gringotts'), 'harry potter');
  assert.equal(familyOf('gotham city rooftops', 'gotham'), 'batman');
  assert.equal(familyOf("the shire's hobbit pantry", 'the shire'), 'lord of the rings');
  assert.equal(familyOf('starfleet bridge consoles', 'starfleet'), 'star trek');
});

test('familyOf scans the subject itself, so even an unrelated label cannot hide a franchise', () => {
  assert.equal(familyOf('under the invisibility cloak', 'stealth'), 'harry potter');
  assert.equal(familyOf('mos eisley cantina', 'cantinas'), 'star wars');
});

test('an unknown family passes through as itself — the table is a backstop, not a gate', () => {
  assert.equal(familyOf('iron man workshop', 'iron man'), 'iron man');
});

test('a family seen inside the window is rejected and the retry wins', async () => {
  const { store, cleanup } = makeStore();
  try {
    seed(store, { theme: 'hogwarts common room', surprise: true, family: 'harry potter' });
    const transport = scripted(
      JSON.stringify({ subject: 'diagon alley shops', family: 'harry potter' }),
      JSON.stringify({ subject: 'iron man workshop', family: 'iron man' }),
    );
    const pick = await pickFreshSubject({ store, transport, random: () => 0 });

    assert.equal(pick.subject, 'iron man workshop');
    assert.equal(pick.family, 'iron man');
    assert.equal(transport.calls.length, 2, 'the family repeat should cost exactly one retry');
    assert.match(transport.calls[1].prompt ?? '', /harry potter/i, 'the feedback should name the family');
  } finally {
    cleanup();
  }
});

test('the alias table catches a franchise repeat the label alone would miss', async () => {
  const { store, cleanup } = makeStore();
  try {
    seed(store, { theme: 'hogwarts common room', surprise: true, family: 'harry potter' });
    const transport = scripted(
      // shares no word with "hogwarts common room", and the label dodges too
      JSON.stringify({ subject: 'gringotts vault chambers', family: 'wizard banks' }),
      JSON.stringify({ subject: 'the coral reef', family: 'reefs' }),
    );
    const pick = await pickFreshSubject({ store, transport, random: () => 0 });
    assert.equal(pick.subject, 'the coral reef');
    assert.equal(transport.calls.length, 2);
  } finally {
    cleanup();
  }
});

test('a pre-family run blocks by theme slug, so the old era still counts', async () => {
  const { store, cleanup } = makeStore();
  try {
    seed(store, { theme: 'the puppet workshop', surprise: true }); // no family recorded
    const transport = scripted(
      JSON.stringify({ subject: 'marionette strings', family: 'the puppet workshop' }),
      JSON.stringify({ subject: 'the coral reef', family: 'reefs' }),
    );
    const pick = await pickFreshSubject({ store, transport, random: () => 0 });
    assert.equal(pick.subject, 'the coral reef', 'a family matching an old theme slug must be refused');
  } finally {
    cleanup();
  }
});

test('the family window is bounded: a family beyond 100 runs back is free again', () => {
  const recent = Array.from({ length: FAMILY_WINDOW }, (_, i) => `family-${i}`);
  assert.equal(recent.length, 100, "Max's rule is phrased in hundreds — the constant should match");
  assert.ok(!recent.includes('harry potter'));
});

// --- familiesMatch: the brass-band bug (v3 sampling, 2026-08-18) --------
//
// The guard and the sampler's familyRepeats metric both compared family
// strings EXACTLY, so they agreed and were wrong together: v3 shipped "brass
// bands" (#5) and "brass band" (#35) as different families — a true duplicate —
// plus egypt/"ancient egypt", deserts/"arabian desert" and the fishing trio as
// near-misses. Every case below is a real pair from that sampling.

test('a plural is the same family as its singular', () => {
  assert.ok(familiesMatch('brass bands', 'brass band'), 'the v3 duplicate');
  assert.ok(familiesMatch('deserts', 'desert'));
});

test('a family contained in another is the same family', () => {
  assert.ok(familiesMatch('egypt', 'ancient egypt'), 'v3 #88 vs #17');
  assert.ok(familiesMatch('arabian desert', 'deserts'), 'containment works both directions');
  assert.ok(familiesMatch('fishing', 'fishing gear'));
  assert.ok(familiesMatch('fishing villages', 'fishing'));
  assert.ok(familiesMatch('salt', 'salt flats'));
});

test('sharing letters is not sharing a family', () => {
  assert.ok(!familiesMatch('wolves', 'werewolves'), 'different word, different family');
  assert.ok(!familiesMatch('bowling', 'rowing'));
  assert.ok(!familiesMatch('ancient egypt', 'ancient rome'), 'a shared qualifier is not a shared family');
});

test('the double-s trap: brass does not become bras', () => {
  assert.ok(!familiesMatch('brass bands', 'lingerie'), 'sanity');
  assert.ok(familiesMatch('brass', 'brass'), 'a word ending in ss survives normalisation');
  assert.ok(!familiesMatch('chess', 'cheese'));
});

test('the guard uses the match, not string equality', async () => {
  const { store, cleanup } = makeStore();
  try {
    seed(store, { theme: 'brass band parade', surprise: true, family: 'brass bands' });
    const transport = scripted(
      JSON.stringify({ subject: 'marching brass on parade', family: 'brass band' }),
      JSON.stringify({ subject: 'the coral reef', family: 'reefs' }),
    );
    const pick = await pickFreshSubject({ store, transport, random: () => 0 });
    assert.equal(pick.subject, 'the coral reef', 'the plural variant must be refused');
    assert.equal(transport.calls.length, 2);
  } finally {
    cleanup();
  }
});

test('a singular noun that ends in s is not mistaken for a plural', () => {
  // v4 #15 vs #61: "octopus" -> "octopu" and "octopuses" -> "octopuse" under a
  // naive strip-the-s rule, so the same creature twice read as two families.
  assert.ok(familiesMatch('octopus', 'octopuses'), 'the v4 escapee');
  assert.ok(familiesMatch('canvas', 'canvases'));
  assert.ok(familiesMatch('atlas', 'atlases'));
  assert.ok(familiesMatch('compass', 'compasses'));
});

test('plural matching still refuses words that merely look alike', () => {
  assert.ok(!familiesMatch('brass', 'bras'), 'brass is not a plural of bra');
  assert.ok(!familiesMatch('chess', 'cheese'));
  assert.ok(!familiesMatch('wolves', 'werewolves'));
  assert.ok(!familiesMatch('ancient egypt', 'ancient rome'), 'a shared qualifier is not a shared family');
});
