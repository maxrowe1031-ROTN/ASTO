// What the address bar should say, tested as the pure string math it is —
// no history, no location, no browser.
//
// The rule these cases pin down is the one whose absence caused the 2026-08-18
// bug: the query names the board ON SCREEN, so a door must clear it. Leaving it
// stale meant a reload re-entered the deep-link route and dropped the player
// back into a board they had just navigated away from.

import test from 'node:test';
import assert from 'node:assert/strict';

import { hrefFor, rememberInUrl } from '../src/url-state.js';

const HOME = 'https://www.playasto.com/';

test('a board names itself in the query', () => {
  assert.equal(hrefFor(HOME, 'first-light'), `${HOME}?puzzle=first-light`);
});

test('a door clears the query — nothing is on screen to name', () => {
  assert.equal(hrefFor(`${HOME}?puzzle=first-light`, null), HOME);
});

test('clearing a query that was already clean leaves the address alone', () => {
  assert.equal(hrefFor(HOME, null), HOME);
});

test('moving between boards replaces the slug rather than collecting them', () => {
  const next = hrefFor(`${HOME}?puzzle=first-light`, 'bedside-manor');
  assert.equal(next, `${HOME}?puzzle=bedside-manor`);
  assert.equal(new URL(next).searchParams.getAll('puzzle').length, 1);
});

test('other query parameters survive both directions', () => {
  // A shared link may carry campaign params; they are not ours to drop.
  const withRef = `${HOME}?ref=twitter&puzzle=first-light`;
  assert.equal(new URL(hrefFor(withRef, null)).searchParams.get('ref'), 'twitter');
  assert.equal(new URL(hrefFor(withRef, 'bedside-manor')).searchParams.get('ref'), 'twitter');
});

test('the path and origin are never rewritten', () => {
  const deep = 'http://localhost:8080/index.html?puzzle=a-board';
  assert.equal(new URL(hrefFor(deep, null)).pathname, '/index.html');
  assert.equal(new URL(hrefFor(deep, 'other')).origin, 'http://localhost:8080');
});

// Writing the address, and the one thing that must never happen when it fails.
//
// The caller is startGame, whose rejection lands the player on the error screen.
// So a throw from replaceState does not cost the address bar, it costs the board —
// which is why these four cases exist rather than a comment saying "should be safe".

test('the address is written through replaceState, never pushState', () => {
  const calls = [];
  const history = {
    replaceState: (...args) => calls.push(args),
    pushState: () => assert.fail('pushState would build a second, invisible router')
  };

  assert.equal(rememberInUrl(history, 'https://www.playasto.com/', 'first-light'), true);
  assert.deepEqual(calls, [[null, '', 'https://www.playasto.com/?puzzle=first-light']]);
});

test('a history that throws costs the address, never the board', () => {
  // What a cross-origin iframe does: the method is right there and refuses.
  const history = {
    replaceState() {
      const error = new Error('Failed to execute replaceState: the document is sandboxed');
      error.name = 'SecurityError';
      throw error;
    }
  };

  assert.doesNotThrow(() => rememberInUrl(history, 'https://example.com/', 'first-light'));
  assert.equal(rememberInUrl(history, 'https://example.com/', 'first-light'), false);
});

test('no history at all is not an error either', () => {
  assert.equal(rememberInUrl(undefined, 'https://www.playasto.com/', 'first-light'), false);
  assert.equal(rememberInUrl({}, 'https://www.playasto.com/', 'first-light'), false);
});

test('a door clears the query through the same door as a board', () => {
  const calls = [];
  const history = { replaceState: (...args) => calls.push(args) };

  rememberInUrl(history, 'https://www.playasto.com/?puzzle=first-light', null);
  assert.equal(calls[0][2], 'https://www.playasto.com/');
});
