// Atomic JSON writes — temp file in the same directory, flush, rename.
//
// rename(2) within one filesystem is atomic, so a reader sees either the
// old file or the new one, never a half-written mix. The temp file lives
// next to the destination (same directory ⇒ same filesystem). On any
// failure the temp file is removed and the destination is untouched.

import { closeSync, fsyncSync, openSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';

let counter = 0;

export function writeJsonAtomic(filePath, value) {
  // Serialize first: a value JSON cannot represent must fail before any
  // filesystem work happens.
  writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

// Prompts and responses are stored as the text they actually are, so a
// reviewer reads a prompt rather than a JSON-escaped one-liner.
export function writeTextAtomic(filePath, text) {
  writeAtomic(filePath, text);
}

// Image bytes (D-31: art is PNGs). The JSON writer rejects binary by
// construction — JSON.stringify of a Uint8Array is an object dump, not the
// image — so bytes get their own front door onto the same mechanics.
export function writeBytesAtomic(filePath, bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
    throw new Error('writeBytesAtomic needs a non-empty Uint8Array');
  }
  writeAtomic(filePath, bytes);
}

function writeAtomic(filePath, data) {
  const tempPath = join(dirname(filePath), `.tmp-${process.pid}-${(counter += 1)}`);
  let fd;
  try {
    fd = openSync(tempPath, 'wx');
    writeSync(fd, data);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(tempPath, filePath);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    try {
      unlinkSync(tempPath);
    } catch {
      // The temp file may never have been created — nothing to clean.
    }
    throw error;
  }
}
