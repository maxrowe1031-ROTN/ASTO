// Per-run mutation locking. One holder at a time; a lock left behind by a
// dead process is stealable; withLock always releases, even on throw.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { acquireLock, withLock, LockHeldError } from '../../../studio/storage/lock.js';

const makeDir = () => mkdtempSync(join(tmpdir(), 'asto-lock-'));

test('acquire then release, then acquire again', () => {
  const d = makeDir();
  try {
    const release = acquireLock(d);
    release();
    const again = acquireLock(d);
    again();
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('a held lock blocks a second acquire with a typed error', () => {
  const d = makeDir();
  try {
    const release = acquireLock(d);
    assert.throws(() => acquireLock(d), LockHeldError);
    release();
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('release is idempotent', () => {
  const d = makeDir();
  try {
    const release = acquireLock(d);
    release();
    release();
    const again = acquireLock(d);
    again();
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('a lock owned by a dead process is stolen, not honored forever', () => {
  const d = makeDir();
  try {
    // Forge a lock file naming a pid that cannot be running.
    const release = acquireLock(d, { pid: 2 ** 30 });
    void release; // deliberately never released — the "dead" holder
    const stolen = acquireLock(d);
    stolen();
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('a lock owned by a live process is not stolen', () => {
  const d = makeDir();
  try {
    const release = acquireLock(d, { pid: process.pid });
    assert.throws(() => acquireLock(d), LockHeldError);
    release();
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('withLock runs the function and releases afterward', () => {
  const d = makeDir();
  try {
    const result = withLock(d, () => {
      assert.throws(() => acquireLock(d), LockHeldError);
      return 'done';
    });
    assert.equal(result, 'done');
    const release = acquireLock(d);
    release();
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('withLock releases even when the function throws', () => {
  const d = makeDir();
  try {
    assert.throws(
      () =>
        withLock(d, () => {
          throw new Error('editorial crisis');
        }),
      /editorial crisis/,
    );
    const release = acquireLock(d);
    release();
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
