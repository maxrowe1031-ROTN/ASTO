// Per-run mutation lock — an exclusive .lock file recording the holder's pid.
//
// 'wx' creation is the atomic test-and-set. A lock whose recorded pid is no
// longer alive is stale (the process died mid-mutation) and may be stolen;
// a lock held by a live process blocks with LockHeldError so callers can
// distinguish "busy" from real failures.

import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';

export class LockHeldError extends Error {
  constructor(lockPath, holderPid) {
    super(`lock already held by pid ${holderPid}: ${lockPath}`);
    this.name = 'LockHeldError';
    this.holderPid = holderPid;
  }
}

const isProcessAlive = (pid) => {
  try {
    process.kill(pid, 0); // signal 0: existence check only
    return true;
  } catch (error) {
    return error.code === 'EPERM'; // alive, but owned by someone else
  }
};

const tryCreate = (lockPath, pid) => {
  const fd = openSync(lockPath, 'wx');
  writeSync(fd, `${JSON.stringify({ pid, acquiredAt: new Date().toISOString() }, null, 2)}\n`);
  closeSync(fd);
};

export function acquireLock(runDir, { pid = process.pid } = {}) {
  const lockPath = join(runDir, '.lock');
  try {
    tryCreate(lockPath, pid);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const holder = readHolderPid(lockPath);
    if (holder !== null && isProcessAlive(holder)) {
      throw new LockHeldError(lockPath, holder);
    }
    // Stale (dead holder or unreadable lock file): steal it.
    unlinkSync(lockPath);
    tryCreate(lockPath, pid);
  }

  let released = false;
  return function release() {
    if (released) return;
    released = true;
    try {
      unlinkSync(lockPath);
    } catch {
      // Already gone — releasing an absent lock is not an error.
    }
  };
}

const readHolderPid = (lockPath) => {
  try {
    const holder = JSON.parse(readFileSync(lockPath, 'utf8'));
    return Number.isInteger(holder.pid) ? holder.pid : null;
  } catch {
    return null; // unreadable ⇒ treat as stale
  }
};

export function withLock(runDir, fn) {
  const release = acquireLock(runDir);
  try {
    return fn();
  } finally {
    release();
  }
}
