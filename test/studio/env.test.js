// The .env loader. Zero-dep, and deliberately incurious: it sets variables
// and says nothing about them. Never printing a name or a value is the point —
// a loader that logs "loaded ANTHROPIC_API_KEY" has already leaked which
// secrets exist, and one that logs a parse error can leak the line itself.
//
// Tested only against temp fixtures. The repo's real .env is never read here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadEnv, parseEnv } from '../../studio/env.js';

const withEnvFile = (contents, body) => {
  const dir = mkdtempSync(join(tmpdir(), 'asto-env-'));
  const path = join(dir, '.env');
  if (contents !== null) writeFileSync(path, contents);
  try {
    return body(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('parses plain KEY=value lines', () => {
  assert.deepEqual(parseEnv('FOO=bar\nBAZ=qux'), { FOO: 'bar', BAZ: 'qux' });
});

test('ignores blanks and # comments', () => {
  assert.deepEqual(parseEnv('\n# a comment\nFOO=bar\n\n  # indented\n'), { FOO: 'bar' });
});

test('tolerates the shapes people actually write', () => {
  assert.deepEqual(
    parseEnv(['export FOO=bar', 'SPACED = spaced', "SQ='single'", 'DQ="double"', 'EMPTY='].join('\n')),
    { FOO: 'bar', SPACED: 'spaced', SQ: 'single', DQ: 'double', EMPTY: '' },
  );
});

test('keeps = inside a value — a token is not a delimiter', () => {
  assert.deepEqual(parseEnv('TOKEN=abc=def==').TOKEN, 'abc=def==');
});

test('a line with no = is skipped rather than throwing', () => {
  assert.deepEqual(parseEnv('nonsense\nFOO=bar'), { FOO: 'bar' });
});

test('a trailing comment is not stripped from a value', () => {
  // Stripping it would silently truncate a key that contains a #.
  assert.equal(parseEnv('K=abc#def').K, 'abc#def');
});

test('loadEnv sets variables that are not already set', () => {
  withEnvFile('ASTO_TEST_UNSET=from-file', (path) => {
    delete process.env.ASTO_TEST_UNSET;
    try {
      const count = loadEnv(path);
      assert.equal(process.env.ASTO_TEST_UNSET, 'from-file');
      assert.equal(count, 1);
    } finally {
      delete process.env.ASTO_TEST_UNSET;
    }
  });
});

test('the real environment always wins — the file never overwrites it', () => {
  withEnvFile('ASTO_TEST_SET=from-file', (path) => {
    process.env.ASTO_TEST_SET = 'from-shell';
    try {
      const count = loadEnv(path);
      assert.equal(process.env.ASTO_TEST_SET, 'from-shell');
      assert.equal(count, 0, 'an already-set variable should not be counted as loaded');
    } finally {
      delete process.env.ASTO_TEST_SET;
    }
  });
});

test('a missing file is fine — not every setup uses one', () => {
  withEnvFile(null, (path) => {
    assert.equal(loadEnv(path), 0);
  });
});

test('loading says nothing at all — no names, no values, no counts', () => {
  withEnvFile('ASTO_TEST_QUIET=sk-secret-value\nBROKEN LINE\n', (path) => {
    const out = [];
    const realLog = console.log;
    const realError = console.error;
    const realWarn = console.warn;
    console.log = (...args) => out.push(args.join(' '));
    console.error = (...args) => out.push(args.join(' '));
    console.warn = (...args) => out.push(args.join(' '));
    delete process.env.ASTO_TEST_QUIET;
    try {
      loadEnv(path);
    } finally {
      console.log = realLog;
      console.error = realError;
      console.warn = realWarn;
      delete process.env.ASTO_TEST_QUIET;
    }
    assert.deepEqual(out, [], `loader wrote to the console: ${out.join(' | ')}`);
  });
});

test('a returned count is a number, never the names', () => {
  withEnvFile('ASTO_TEST_A=1\nASTO_TEST_B=2', (path) => {
    delete process.env.ASTO_TEST_A;
    delete process.env.ASTO_TEST_B;
    try {
      assert.equal(loadEnv(path), 2);
    } finally {
      delete process.env.ASTO_TEST_A;
      delete process.env.ASTO_TEST_B;
    }
  });
});
