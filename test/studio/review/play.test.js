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

import { playScaffold } from '../../../studio/review/ui/play.js';

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
