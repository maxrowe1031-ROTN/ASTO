// Playing a candidate board inside the Review Studio.
//
// There is no DOM here and no dependency to provide one, so what is tested is
// what can be: the scaffold's shape, and — more importantly — that play.js
// really does compose the GAME's modules rather than reimplementing play. The
// play loop itself is verified in the browser at the gate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createRecorder, playScaffold } from '../../../studio/review/ui/play.js';
import { initGame, submit } from '../../../src/engine/engine.js';
import { canonicalOrder, deriveWords } from '../../../src/engine/arrangements.js';
import firstLight from '../../../puzzles/first-light.json' with { type: 'json' };

const SOURCE = readFileSync(
  fileURLToPath(new URL('../../../studio/review/ui/play.js', import.meta.url)),
  'utf8',
);

test('the scaffold offers every mount point the game views need', () => {
  const html = playScaffold();
  for (const slot of ['header', 'status', 'frame', 'board', 'controls', 'banner', 'solved']) {
    assert.ok(html.includes(`data-play="${slot}"`), `no mount point for ${slot}`);
  }
});

test('the scaffold wears the game\'s own classes, so the game\'s CSS dresses it', () => {
  // If these drifted, the play area would render unstyled rather than subtly
  // wrong — the same bet board-html.js makes.
  const html = playScaffold();
  for (const className of ['header', 'status', 'frame', 'board', 'controls', 'solved-sets']) {
    assert.match(html, new RegExp(`class="${className}"`), `missing .${className}`);
  }
});

test('there is a way back to the static preview', () => {
  assert.match(playScaffold(), /data-act="exit-play"/);
});

test('play is composed from the game\'s real modules, not a Studio copy', () => {
  // The whole point of the feature, and the thing most at risk of quietly
  // regressing into a reimplementation. Every one of these must be an import
  // from src/, never a local definition.
  for (const module of [
    'src/controller/game-controller.js',
    'src/view/board-view.js',
    'src/view/frame-view.js',
    'src/view/controls-view.js',
    'src/view/header-view.js',
    'src/view/solved-sets-view.js',
    'src/view/status-view.js',
  ]) {
    assert.ok(SOURCE.includes(module), `play.js no longer imports ${module}`);
  }
});

test('play.js holds no game rules of its own', () => {
  // The engine owns what a mistake costs and when a game ends. A number like 4
  // appearing here, or a call to a rule-shaped helper, would mean the Studio
  // had started deciding things the engine already decides.
  assert.equal(/maxMistakes|MAX_MISTAKES|acceptedOrders|canonicalOrder/.test(SOURCE), false);
  // The banner may READ status; it must not compute it.
  assert.ok(SOURCE.includes('state.status'), 'the banner should read the engine\'s status');
});

test('the game\'s EndView is deliberately not used', () => {
  // It is a full-screen takeover that reveals every set with its explanation —
  // which the review page already shows below, and which Max has usually read
  // before pressing Play.
  assert.equal(SOURCE.includes('end-view.js'), false);
});

// --- the playthrough recorder --------------------------------------------
//
// A recorder is a VIEW that renders to a data structure instead of the DOM,
// which is the whole trick: the view contract is `update(state, outcome)`, so
// watching a playthrough needs no change to the game and no DOM at all. That
// also makes it testable against the REAL engine here rather than only in the
// browser — so these drive actual play through the engine's own reducer.

test('the recorder is a view — update(state, outcome) and nothing else', () => {
  const recorder = createRecorder();
  assert.equal(typeof recorder.update, 'function');
  assert.equal(typeof recorder.result, 'function');
});

test('an unfinished playthrough records nothing — half a game calibrates nothing', async () => {
  const recorder = createRecorder();
  await recorder.update({ status: 'playing' }, { type: 'solved', setId: 'set-a' });
  assert.equal(recorder.result(), null);
});

test('a real win through the engine is recorded in solve order', async () => {
  // Driven by the engine itself: initGame, then submit each set in a
  // deliberate order with one wrong submission first.
  const recorder = createRecorder();
  let state = initGame(firstLight);

  const submitTo = async (terms) => {
    const next = submit(state, terms);
    state = next.state;
    await recorder.update(state, next.outcome);
  };

  const sets = firstLight.sets;
  const wordsOf = (set) => canonicalOrder(set.pairs);

  // A miss first: two words from one set, two from another.
  await submitTo([...wordsOf(sets[0]).slice(0, 2), ...wordsOf(sets[1]).slice(0, 2)]);
  // Then solve them out of difficulty order, hardest first.
  for (const set of [...sets].reverse()) await submitTo(wordsOf(set));

  const result = recorder.result();
  assert.equal(result.outcome, 'won');
  assert.equal(result.mistakes, 1, 'the deliberate miss was not counted');
  assert.deepEqual(
    result.solvedOrder,
    [...sets].reverse().map((s) => s.id),
    'solve order is the point — it is what Max narrates by hand',
  );
});

test('a so-close counts as a mistake and is also counted on its own', async () => {
  // "So close" costs a mistake by design (GDD §8), and it carries no setId on
  // purpose so the view cannot leak which set was nearly right — so it can be
  // counted but never attributed.
  const recorder = createRecorder();
  let state = initGame(firstLight);
  const [a, b, c, d] = canonicalOrder(firstLight.sets[0].pairs);

  const wrongOrder = submit(state, [a, c, b, d]);
  state = wrongOrder.state;
  await recorder.update(state, wrongOrder.outcome);

  assert.equal(wrongOrder.outcome.type, 'so-close', 'the fixture no longer produces a so-close');
  for (const set of firstLight.sets) {
    const next = submit(state, canonicalOrder(set.pairs));
    state = next.state;
    await recorder.update(state, next.outcome);
  }

  const result = recorder.result();
  assert.equal(result.soClose, 1);
  assert.equal(result.mistakes, 1, 'a so-close is a mistake as well as a so-close');
});

test('a loss is recorded too — how a board defeats a player is calibration data', async () => {
  const recorder = createRecorder();
  let state = initGame(firstLight);
  const words = deriveWords(firstLight.sets);

  // Four submissions that are neither solves nor near-misses.
  for (let i = 0; i < 4; i += 1) {
    const next = submit(state, [words[0], words[5], words[10], words[15 - i]]);
    state = next.state;
    await recorder.update(state, next.outcome);
  }

  const result = recorder.result();
  assert.equal(result.outcome, 'lost');
  assert.deepEqual(result.solvedOrder, []);
});
