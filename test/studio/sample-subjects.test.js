// The subject sampler — the tool that lets a hundred subjects be judged by eye
// before a single board is generated on the new rotation (D-15 second amendment).
//
// The load-bearing assertions are that a sampling AVOIDS ITSELF (otherwise a
// run of 100 is a hundred independent first picks and proves nothing about
// whether 100 boards would feel varied) and that it WRITES NOTHING (a sampled
// subject entering the avoid-list would poison the history it was drawn against).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseArgv, sampleSubjects, summarize } from '../../studio/sample-subjects.js';
import { REGISTERS } from '../../studio/corpus/registers.js';

const NAME_REGISTER = REGISTERS.find((r) => r.allowProperNouns);

const scripted = (...subjects) => {
  let i = 0;
  const transport = async () => {
    const subject = subjects[Math.min(i, subjects.length - 1)];
    i += 1;
    return {
      text: JSON.stringify({ subject, family: subject }),
      stopReason: 'end_turn',
      model: 'mock-model',
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  };
  return transport;
};

test('a sampling walks the register rotation rather than repeating one register', async () => {
  // Deliberately share no significant word: "subject number 1/2/3" would all
  // echo each other on "subject"/"number" and be bounced into pool fallbacks,
  // which is the echo guard working correctly on a careless fixture.
  const picks = await sampleSubjects({
    count: REGISTERS.length,
    transport: scripted(
      'tide pools', 'brass instruments', 'winter markets', 'desert caravans',
      'paper lanterns', 'harvest suppers', 'copper wiring', 'glacier hiking',
      'origami folding', 'steam trains', 'wool spinning', 'bee swarms',
      'chalk cliffs', 'jazz clubs', 'kite flying', 'clay tablets',
      'moss gardens', 'radio towers',
    ),
    random: () => 0,
  });

  assert.equal(picks.length, REGISTERS.length);
  assert.equal(
    new Set(picks.map((p) => p.register)).size,
    REGISTERS.length,
    'a full cycle should touch every register exactly once',
  );
});

test('samples avoid each other — the freshness guard sees the sampling in progress', async () => {
  // The model offers the same subject every time; the guard must reject the
  // repeats, so the run falls back rather than returning the duplicate twice.
  const picks = await sampleSubjects({
    count: 3,
    transport: scripted('tide pools'),
    random: () => 0,
  });

  const subjects = picks.map((p) => p.subject);
  assert.equal(new Set(subjects).size, subjects.length, `sampling repeated itself: ${subjects.join(', ')}`);
  assert.equal(picks[0].subject, 'tide pools');
  assert.notEqual(picks[1].source, 'scout', 'a stale answer twice should fall back, not be accepted');
});

test('the real history is respected and never mutated', async () => {
  const history = [{ theme: 'tide pools', brief: { relationshipShapes: ['1a'] } }];
  const frozen = JSON.stringify(history);

  const picks = await sampleSubjects({
    history,
    count: 1,
    transport: scripted('tide pools'), // already used — must not come back
    random: () => 0,
  });

  assert.notEqual(picks[0].subject, 'tide pools');
  assert.equal(JSON.stringify(history), frozen, 'the caller history was mutated');
});

test('summarize reports the numbers the rotation is judged on', () => {
  const picks = [
    { subject: 'the spice bazaar', style: 'world', register: REGISTERS[0].id, source: 'scout' },
    { subject: 'Harry Potter', style: 'lens', register: NAME_REGISTER.id, source: 'scout' },
    { subject: 'tide pools', style: 'lens', register: null, source: 'pool' },
  ];
  const s = summarize(picks);

  assert.equal(s.total, 3);
  assert.equal(s.theOpeners, 1);
  assert.equal(s.capitalised, 1, 'capitalisation is reported as itself, not as "proper nouns"');
  assert.equal(s.nameRegisters, 1, 'one pick came from a register where names are allowed');
  assert.equal(s.echoes, 0);
  assert.equal(s.fallbacks, 1);
  assert.equal(s.duplicates, 0);
  assert.equal(s.byRegister[REGISTERS[0].id], 1);
});

test('summarize counts a duplicate slug rather than hiding it', () => {
  const s = summarize([
    { subject: 'tide pools', style: 'world', register: REGISTERS[0].id, source: 'scout' },
    { subject: 'Tide Pools', style: 'lens', register: REGISTERS[1].id, source: 'scout' },
  ]);
  assert.equal(s.duplicates, 1, 'a case variant is the same subject');
});

test('the count is bounded, so a typo cannot spend a fortune', () => {
  assert.equal(parseArgv(['--count', '100']).count, 100);
  assert.equal(parseArgv([]).count, REGISTERS.length * 2, 'an argless run stays cheap');
  assert.equal(parseArgv(['--mock']).mock, true);
  // Our own guard owns these, and says so by name.
  for (const bad of ['0', '5000', 'abc', '1.5']) {
    assert.throws(() => parseArgv(['--count', bad]), /count must be an integer/, `accepted ${bad}`);
  }
  // A negative is refused a step earlier, by parseArgs itself ("argument is
  // ambiguous" — it reads as another flag). Different message, same refusal;
  // what matters is that no path reaches a sampling loop with a bad count.
  assert.throws(() => parseArgv(['--count', '-5']), /ambiguous|must be an integer/);
});

test('familyRepeats counts a plural variant — the metric cannot share the guard blind spot', () => {
  // The exact pair v3 shipped while reporting zero repeats.
  const s = summarize([
    { subject: 'brass band parade', family: 'brass bands', style: 'world', register: REGISTERS[0].id, source: 'scout' },
    { subject: 'brass band on parade', family: 'brass band', style: 'lens', register: REGISTERS[1].id, source: 'scout' },
  ]);
  assert.equal(s.familyRepeats, 1);
});
