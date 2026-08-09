// Fresh surprise-me subjects (design.md D-15).
//
// The load-bearing assertions are the never-reuse guard (slug-level, so case
// and punctuation variants of a used theme cannot slip back in) and the
// loop-free fallback chain: bounded model rounds → unused pool → LRU. Every
// path must return a subject; run creation may never wedge on this module.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pickFreshSubject, styleFor, usedThemes } from '../../studio/subject.js';
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

const subjectReply = (subject) => JSON.stringify({ subject });

const seed = (store, { theme, mock = false, style = null, surprise = false }) =>
  store.createRun({
    slug: slugify(theme) ?? 'x',
    theme,
    brief: {
      count: 14,
      mock,
      ...(surprise ? { relationshipShapes: ['1a'] } : {}),
      ...(style ? { subjectStyle: style } : {}),
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

test('a fresh scout answer is accepted, normalized, and carries its style', async () => {
  const { store, cleanup } = makeStore();
  try {
    seed(store, { theme: 'rivers' });
    const transport = scripted(subjectReply('  Lighthouse Keeping '));
    const pick = await pickFreshSubject({ store, transport, random: () => 0.1 });
    assert.deepEqual(pick, { subject: 'lighthouse keeping', source: 'scout', style: 'world' });
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
