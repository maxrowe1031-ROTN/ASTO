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
  for (const word of ['capstone', 'multi-agent', 'generated', 'approved']) {
    assert.ok(lower.includes(word), `about.html must say "${word}"`);
  }
});

test('the deck is linked, and labeled as the snapshot it is', () => {
  assert.ok(about.includes('href="docs/presentation/"'), 'deck link missing');
  assert.ok(about.includes('August 5, 2026'), 'snapshot date missing at the point of entry');
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

test('the deck itself wears the snapshot stamp', () => {
  const deck = read('docs', 'presentation', 'index.html');
  assert.ok(
    deck.includes('snapshot of August 5, 2026'),
    'a future deck edit must not silently drop the date stamp',
  );
});
