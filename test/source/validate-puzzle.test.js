import test from 'node:test';
import assert from 'node:assert/strict';

import { validatePuzzle } from '../../src/source/validate-puzzle.js';
import { board } from '../fixtures/board.js';

/** Deep-copy the good board, then break exactly one thing. */
const broken = (mutate) => {
  const copy = structuredClone(board);
  mutate(copy);
  return validatePuzzle(copy);
};

const messages = (result) => result.errors.map((e) => `${e.path}: ${e.message}`).join('\n');
const failsAt = (result, path) => {
  assert.equal(result.ok, false, `expected invalid, got:\n${messages(result)}`);
  assert.ok(
    result.errors.some((e) => e.path === path),
    `expected an error at "${path}", got:\n${messages(result)}`
  );
};

test('a well-formed board passes with no errors', () => {
  const result = validatePuzzle(board);
  assert.equal(result.ok, true, messages(result));
  assert.deepEqual(result.errors, []);
});

test('optional fields are genuinely optional', () => {
  const result = broken((p) => {
    delete p.date;
    for (const set of p.sets) delete set.baitTags;
  });
  assert.equal(result.ok, true, messages(result));
});

test('date and baitTags are still type-checked when present', () => {
  failsAt(broken((p) => { p.date = 20260801; }), 'date');
  failsAt(broken((p) => { p.sets[0].baitTags = 'nature'; }), 'sets[0].baitTags');
  failsAt(broken((p) => { p.sets[0].baitTags = ['nature', 7]; }), 'sets[0].baitTags');
});

// The glossary (design.md D-18, 2026-08-11): an optional, editorially authored
// definition for the board's hardest word, shipped as data because the game is
// zero-dep and offline — there is no dictionary to call, and a dictionary would
// leak relationships anyway. Absent on every pre-D-18 board, so absence is valid.
test('glossary is optional, and an empty glossary is allowed', () => {
  assert.equal(broken((p) => { delete p.glossary; }).ok, true);
  assert.equal(broken((p) => { p.glossary = []; }).ok, true);
});

test('a well-formed glossary entry passes', () => {
  const result = broken((p) => {
    p.glossary = [{ word: 'Chisel', definition: 'a bladed hand tool for shaping wood or stone' }];
  });
  assert.equal(result.ok, true, messages(result));
});

test('a glossary word must be one of the sixteen board words', () => {
  failsAt(
    broken((p) => { p.glossary = [{ word: 'Cordwainer', definition: 'a shoemaker' }]; }),
    'glossary[0].word'
  );
});

test('a glossary definition must be a non-empty string', () => {
  failsAt(broken((p) => { p.glossary = [{ word: 'Chisel', definition: '  ' }]; }), 'glossary[0].definition');
  failsAt(broken((p) => { p.glossary = [{ word: 'Chisel' }]; }), 'glossary[0].definition');
});

test('a glossary must be an array of objects when present', () => {
  failsAt(broken((p) => { p.glossary = 'Chisel: a tool'; }), 'glossary');
  failsAt(broken((p) => { p.glossary = ['Chisel']; }), 'glossary[0]');
});

test('id and title are required non-empty strings', () => {
  failsAt(broken((p) => { delete p.id; }), 'id');
  failsAt(broken((p) => { p.id = '   '; }), 'id');
  failsAt(broken((p) => { p.title = 42; }), 'title');
});

test('a board must have exactly four sets', () => {
  failsAt(broken((p) => { p.sets = p.sets.slice(0, 3); }), 'sets');
  failsAt(broken((p) => { p.sets = [...p.sets, structuredClone(p.sets[0])]; }), 'sets');
  failsAt(broken((p) => { delete p.sets; }), 'sets');
});

test('every set needs an id, and set ids must be unique', () => {
  failsAt(broken((p) => { delete p.sets[2].id; }), 'sets[2].id');
  failsAt(broken((p) => { p.sets[1].id = p.sets[0].id; }), 'sets[1].id');
});

test('relationshipLabel and explanation are required — the loss screen depends on them', () => {
  failsAt(broken((p) => { delete p.sets[0].relationshipLabel; }), 'sets[0].relationshipLabel');
  failsAt(broken((p) => { p.sets[3].explanation = ''; }), 'sets[3].explanation');
});

test('pairs must be exactly two ordered pairs of two non-empty words', () => {
  failsAt(broken((p) => { delete p.sets[0].pairs; }), 'sets[0].pairs');
  failsAt(broken((p) => { p.sets[0].pairs = [['Seed', 'Tree']]; }), 'sets[0].pairs');
  failsAt(broken((p) => { p.sets[0].pairs[1] = ['Spark']; }), 'sets[0].pairs[1]');
  failsAt(broken((p) => { p.sets[0].pairs[1] = ['Spark', 'Fire', 'Ash']; }), 'sets[0].pairs[1]');
  failsAt(broken((p) => { p.sets[0].pairs[0][1] = ''; }), 'sets[0].pairs[0]');
  failsAt(broken((p) => { p.sets[0].pairs[0][1] = 7; }), 'sets[0].pairs[0]');
});

test('difficulty must be an integer 1-4', () => {
  failsAt(broken((p) => { p.sets[0].difficulty = 0; }), 'sets[0].difficulty');
  failsAt(broken((p) => { p.sets[0].difficulty = 5; }), 'sets[0].difficulty');
  failsAt(broken((p) => { p.sets[0].difficulty = '1'; }), 'sets[0].difficulty');
  failsAt(broken((p) => { delete p.sets[0].difficulty; }), 'sets[0].difficulty');
});

test('each difficulty 1-4 must be used exactly once — one set per tier', () => {
  failsAt(broken((p) => { p.sets[1].difficulty = 1; }), 'sets');
});

test('the sixteen derived words must all be distinct', () => {
  failsAt(broken((p) => { p.sets[3].pairs[1][1] = 'Fire'; }), 'sets');
});

test('duplicate words are caught case-insensitively', () => {
  failsAt(broken((p) => { p.sets[3].pairs[1][1] = 'fire'; }), 'sets');
});

test('the old schema is rejected loudly, field by field', () => {
  const namesV1 = (result, path) => {
    failsAt(result, path);
    const error = result.errors.find((e) => e.path === path);
    assert.match(error.message, /v1\.0/, `"${error.message}" should name schema v1.0`);
  };

  namesV1(broken((p) => { p.words = ['Seed', 'Tree']; }), 'words');
  namesV1(broken((p) => { p.theme = 'default'; }), 'theme');
  namesV1(broken((p) => { p.difficulty_model = 'green_yellow_red_black'; }), 'difficulty_model');
  namesV1(broken((p) => { p.sets[0].tier = 'green'; }), 'sets[0].tier');
  namesV1(broken((p) => {
    p.sets[0].relationship_label = p.sets[0].relationshipLabel;
    delete p.sets[0].relationshipLabel;
  }), 'sets[0].relationship_label');
});

test('a whole old-schema board is rejected, not partially accepted', () => {
  const legacy = {
    id: 'asto_001',
    title: 'First Light',
    theme: 'default',
    difficulty_model: 'green_yellow_red_black',
    words: ['Seed', 'Tree', 'Spark', 'Fire'],
    sets: [{
      tier: 'green',
      difficulty: 1,
      pairs: [['Seed', 'Tree'], ['Spark', 'Fire']],
      relationship_label: 'Small origin becomes larger result',
      baitTags: []
    }]
  };
  const result = validatePuzzle(legacy);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 5, messages(result));
});

test('validation collects every error rather than stopping at the first', () => {
  const result = broken((p) => {
    delete p.id;
    delete p.sets[0].explanation;
    p.sets[2].difficulty = 9;
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 3, messages(result));
});

test('validation never throws, whatever it is handed', () => {
  for (const garbage of [null, undefined, 'a board', 42, [], () => {}]) {
    const result = validatePuzzle(garbage);
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0);
  }
});
