// rules.js — loads the editorial rules corpus.
//
// Small on purpose. The interesting part of rules is not the loading, it is
// the discipline around them: a rule reaches a prompt only once Max has
// approved it, and one compiled from feedback carries provenance back to the
// runs that justified it. Both of those are enforced by the schema and by the
// status filter here — there is no path that adopts a rule silently.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { validateRulesFile } from '../schemas.js';

export const RULES_PATH = fileURLToPath(new URL('./rules.json', import.meta.url));

/**
 * @param path            defaults to the shipped corpus
 * @param includeProposed when true, returns rules of every status — for the
 *                        review workflow, never for prompt construction
 * @returns rule objects ({ id, text, status, source, ... })
 */
export function loadRules(path = RULES_PATH, { includeProposed = false } = {}) {
  if (!existsSync(path)) return [];

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`invalid rules file (not valid JSON): ${path}: ${error.message}`);
  }

  const result = validateRulesFile(parsed);
  if (!result.ok) {
    // Loud, not lenient: silently loading zero rules would make every agent
    // quietly forget its standards, and the run would look normal.
    throw new Error(
      `invalid rules file ${path}: ${result.errors
        .map((error) => `${error.path}: ${error.message}`)
        .join('; ')}`,
    );
  }

  return includeProposed ? parsed.rules : parsed.rules.filter((rule) => rule.status === 'approved');
}
