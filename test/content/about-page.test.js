// The AI disclosure must stay on the site, reachable, and honestly labeled.
//
// about.html is the page that says the puzzles are AI-generated and that Max
// approves every one before it ships. It is content shipped as data — a
// static HTML file Pages serves verbatim — so, like the boards, `npm test`
// is what keeps it honest. What these tests make impossible:
//
//   - the disclosure quietly losing its load-bearing claims in a copy edit
//   - the page becoming unreachable (a link dropped from a view template)
//   - the deck being linked without its snapshot date, or losing the stamp
//   - the page drifting off the design tokens into hardcoded colors
//
// Assertions are word-level, not sentence-level: the copy is Max's to edit,
// and his rewording must survive; only the claims themselves are pinned.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8');

const about = read('about.html');

test('the disclosure carries its load-bearing claims', () => {
  const lower = about.toLowerCase();
  for (const claim of ['capstone', 'multi-agent', 'generated', 'played by max']) {
    assert.ok(lower.includes(claim), `about.html must say "${claim}"`);
  }
});

test('the copy carries no em dashes', () => {
  // Max's call, 2026-08-16: an em dash in prose reads as machine-written, and
  // this page's whole job is being believed. The whole file is swept rather
  // than just the body, so there is no line to argue about: comments included,
  // aria-labels and the <title> included.
  assert.ok(!about.includes('—'), 'the About page must use no em dashes');
});

test('both the deck and the GDD are linked', () => {
  // Two files, not one: the deck documents the build, the GDD is the game
  // spec. The deck names no GDD content anywhere in its fifteen slides.
  assert.ok(about.includes('href="docs/presentation/"'), 'deck link missing');
  assert.ok(about.includes('href="docs/asto-gdd.html"'), 'GDD link missing');
});

test('the page dresses in the real tokens and hardcodes none of its own', () => {
  assert.ok(about.includes('styles/tokens.css'), 'must link the shared tokens');
  // The theme-color meta legitimately holds a hex (as index.html's does); the
  // rule is about the page's OWN styling, so only the <style> block is swept.
  const styleBlocks = about.match(/<style>[\s\S]*?<\/style>/g) ?? [];
  for (const block of styleBlocks) {
    assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, 'inline styles must use var(--…) tokens, not hex');
  }
});

test('both doors carry the link — the title screen and the end screen', () => {
  // Deep-linked visitors never see the title screen (D-20 routing), so the
  // end screen is the surface the disclosure exists for. Views are
  // constructor-DOM with no jsdom in the suite; reading the template source
  // is the honest headless check.
  for (const view of ['title-view.js', 'end-view.js']) {
    const source = read('src', 'view', view);
    assert.ok(source.includes('href="about.html"'), `${view} must link about.html`);
  }
});

test('both standalone pages carry the wordmark home', () => {
  // The game's own screens already do this (header-view.js, select-view.js): the
  // logo is the way back. These two pages sit outside the SPA, so they need their
  // own — a visitor who lands on either must never be stranded there.
  assert.match(
    about,
    /<h1[^>]*class="title-wordmark"[^>]*>\s*<a[^>]*href="\.\/"/,
    'the About page wordmark must link to the homepage',
  );
  const deck = read('docs', 'presentation', 'index.html');
  assert.match(
    deck,
    /<a[^>]*id="home"[^>]*href="\.\.\/\.\.\/"/,
    'the deck must carry a wordmark link back to the homepage',
  );
});

test('the deck says when it was last true', () => {
  // The deck was a 2026-08-05 snapshot until 2026-08-16, when it was restructured
  // into acts and brought current. The stamp is what stops it being read as a
  // description of the pipeline as it stands whenever someone finds it next, so
  // the guard survives the rewrite: only the date it pins has changed.
  const deck = read('docs', 'presentation', 'index.html');
  assert.ok(
    deck.includes('August 16, 2026'),
    'a future deck edit must not silently drop the date stamp',
  );
});

test('the deck carries no em dashes either', () => {
  const deck = read('docs', 'presentation', 'index.html');
  assert.ok(!deck.includes('—'), 'the deck copy must use no em dashes');
  assert.ok(!deck.includes('&mdash;'), 'an escaped em dash is still an em dash');
});
