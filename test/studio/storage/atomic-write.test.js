// Atomic writes: temp file → flush → rename. A reader never sees a
// half-written file, and a failed write never leaves a temp file behind.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeJsonAtomic } from '../../../studio/storage/atomic-write.js';

const dir = () => {
  const d = mkdtempSync(join(tmpdir(), 'asto-atomic-'));
  return { d, [Symbol.dispose ?? 'cleanup']: () => rmSync(d, { recursive: true, force: true }) };
};

test('writes JSON that a plain readFileSync can parse back', () => {
  const { d } = dir();
  try {
    const target = join(d, 'manifest.json');
    writeJsonAtomic(target, { hello: 'lantern', n: 3 });
    assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), { hello: 'lantern', n: 3 });
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('output is pretty-printed with a trailing newline — run dirs are for humans too', () => {
  const { d } = dir();
  try {
    const target = join(d, 'a.json');
    writeJsonAtomic(target, { a: 1 });
    const text = readFileSync(target, 'utf8');
    assert.ok(text.endsWith('\n'));
    assert.ok(text.includes('\n  '), 'expected indentation');
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('replaces an existing file completely', () => {
  const { d } = dir();
  try {
    const target = join(d, 'a.json');
    writeJsonAtomic(target, { version: 'one', extra: 'field' });
    writeJsonAtomic(target, { version: 'two' });
    assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), { version: 'two' });
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('leaves no temp files behind after success', () => {
  const { d } = dir();
  try {
    writeJsonAtomic(join(d, 'a.json'), { a: 1 });
    writeJsonAtomic(join(d, 'b.json'), { b: 2 });
    assert.deepEqual(readdirSync(d).sort(), ['a.json', 'b.json']);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('a failed write leaves no temp file and does not clobber the original', () => {
  const { d } = dir();
  try {
    const target = join(d, 'a.json');
    writeJsonAtomic(target, { original: true });
    // A value JSON.stringify cannot serialize → the write must fail
    // before touching the destination.
    assert.throws(() => writeJsonAtomic(target, { boom: 1n }));
    assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), { original: true });
    assert.deepEqual(readdirSync(d), ['a.json']);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('writing into a missing directory throws rather than silently creating it', () => {
  const { d } = dir();
  try {
    assert.throws(() => writeJsonAtomic(join(d, 'nowhere', 'a.json'), { a: 1 }));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
