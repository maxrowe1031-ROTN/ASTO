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
  // spec. The deck links the GDD as a companion read; it does not contain it.
  //
  // Matched loosely on purpose. These went absolute on 2026-08-25 so the
  // packaged itch.io build (game only, no docs/, inside a cross-origin iframe)
  // reaches the same two documents the live site does. What is load-bearing is
  // that both stay REACHABLE, not which form the href takes, so a later move
  // back to relative paths must not read as a regression.
  assert.match(about, /href="[^"]*docs\/presentation\/"/, 'deck link missing');
  assert.match(about, /href="[^"]*docs\/asto-gdd\.html"/, 'GDD link missing');
});

test('an offsite link opens in a new tab', () => {
  // Inside itch's iframe an in-frame navigation to playasto.com replaces the
  // game with a document that has no way back to it.
  for (const [, tag] of about.matchAll(/(<a\b[^>]*href="https?:\/\/[^"]*"[^>]*>)/g)) {
    assert.match(tag, /target="_blank"/, `offsite link must open in a new tab: ${tag}`);
    assert.match(tag, /rel="noopener"/, `offsite link must carry rel=noopener: ${tag}`);
  }
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
  // The game's own screens already do this (header-view.js, calendar-view.js): the
  // logo is the way back. These two pages sit outside the SPA, so they need their
  // own — a visitor who lands on either must never be stranded there.
  // `index.html`, not `./`: the packaged build is served from a directory on a
  // CDN whose index resolution is not ours to assume, and naming the file costs
  // nothing. Either form satisfies the rule that matters, which is that the
  // wordmark goes home.
  assert.match(
    about,
    /<h1[^>]*class="title-wordmark"[^>]*>\s*<a[^>]*href="(\.\/|index\.html)"/,
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
  // The deck became a four-pillar portfolio piece on 2026-08-17 (it had been a
  // six-act chronology since 2026-08-16, and a 2026-08-05 snapshot before that).
  // The stamp is what stops it being read as a description of the pipeline as it
  // stands whenever someone finds it next, so the guard survives every rewrite:
  // only the date it pins changes.
  const deck = read('docs', 'presentation', 'index.html');
  assert.ok(
    deck.includes('August 17, 2026'),
    'a future deck edit must not silently drop the date stamp',
  );
});

test('the deck carries no em dashes either', () => {
  const deck = read('docs', 'presentation', 'index.html');
  assert.ok(!deck.includes('—'), 'the deck copy must use no em dashes');
  assert.ok(!deck.includes('&mdash;'), 'an escaped em dash is still an em dash');
});
