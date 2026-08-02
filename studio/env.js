// env.js — a zero-dependency .env loader, deliberately incurious.
//
// It sets variables and says nothing. That silence is a security property,
// not a style choice: a loader that logs "loaded ANTHROPIC_API_KEY" has
// already disclosed which secrets exist, and one that logs a parse error can
// echo the offending line — which is, by construction, the line with the
// secret on it. So: no console output on any path, ever, and the only thing
// returned is a count.
//
// The real environment always wins. An exported ANTHROPIC_API_KEY is a
// deliberate act; a file is a convenience, and a convenience must never
// quietly override a deliberate act.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT_PATH = fileURLToPath(new URL('../.env', import.meta.url));

const unquote = (value) => {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.length >= 2 && trimmed.at(-1) === quote) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

/** Pure: text → { KEY: value }. Malformed lines are skipped, never thrown on. */
export function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    // Only the FIRST = separates; a value may contain any number of them.
    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line.slice(0, separator).replace(/^export\s+/, '').trim();
    if (key.length === 0) continue;

    // No trailing-comment stripping: a value may legitimately contain '#',
    // and truncating a key at one would be a silent corruption.
    values[key] = unquote(line.slice(separator + 1));
  }
  return values;
}

/**
 * Loads `path` (default: the repo's .env) into process.env, without
 * overwriting anything already set.
 *
 * @returns the number of variables newly set — a count, never the names.
 */
export function loadEnv(path = DEFAULT_PATH) {
  let text;
  try {
    if (!existsSync(path)) return 0;
    text = readFileSync(path, 'utf8');
  } catch {
    // Unreadable is treated exactly like absent. Reporting the reason would
    // mean naming the file and its state; the caller finds out soon enough
    // when the variable it wanted is missing.
    return 0;
  }

  let loaded = 0;
  for (const [key, value] of Object.entries(parseEnv(text))) {
    if (process.env[key] !== undefined) continue;
    process.env[key] = value;
    loaded += 1;
  }
  return loaded;
}
