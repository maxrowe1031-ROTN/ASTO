// The mock transport — fixture replay, zero network.
//
// Swaps in wherever the real transport goes, so `--mock` changes one argument
// rather than threading a flag through the pipeline. It reads files; it never
// calls fetch and never reads an API key.
//
// A fixture is `<stageId>.json` (or `.txt`) in the fixtures directory:
//   { "text": "..." }                       one reply
//   "raw text"                              one reply, shorthand
//   [ {...}, {...} ]                        a script, consumed in order
//   { "status": 529, "error": "overloaded" } an error instead of a reply
//
// A script that runs out repeats its last entry, so a stage retried more times
// than scripted still behaves predictably.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function createMockTransport({ fixturesDir }) {
  const scripts = new Map(); // stageId → { entries, index }
  const calls = [];

  const transport = async function mockTransport(request) {
    calls.push(request);
    const entry = nextEntry(request.stageId);

    if (entry.status !== undefined || entry.error !== undefined) {
      throw Object.assign(new Error(entry.error ?? `HTTP ${entry.status}`), {
        ...(entry.status === undefined ? {} : { status: entry.status }),
        ...(entry.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: entry.retryAfterSeconds }),
      });
    }

    const text = entry.text ?? '';
    return {
      text,
      stopReason: entry.stopReason ?? 'end_turn',
      model: entry.model ?? request.model ?? 'mock-model',
      // Deterministic, roughly token-shaped: enough for budget accounting to
      // be exercised offline without pretending to be a real tokenizer.
      usage: {
        inputTokens: estimateTokens(`${request.system ?? ''}${request.prompt ?? ''}`),
        outputTokens: estimateTokens(text),
      },
    };
  };

  transport.calls = calls;
  return transport;

  function nextEntry(stageId) {
    if (!scripts.has(stageId)) scripts.set(stageId, { entries: loadFixture(stageId), index: 0 });
    const script = scripts.get(stageId);
    const entry = script.entries[Math.min(script.index, script.entries.length - 1)];
    script.index += 1;
    return entry;
  }

  function loadFixture(stageId) {
    for (const extension of ['.json', '.txt']) {
      const path = join(fixturesDir, `${stageId}${extension}`);
      if (!existsSync(path)) continue;
      const raw = readFileSync(path, 'utf8');
      if (extension === '.txt') return [{ text: raw }];
      const parsed = JSON.parse(raw);
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      return entries.map((entry) => (typeof entry === 'string' ? { text: entry } : entry));
    }
    throw new Error(`no mock fixture for stage "${stageId}" in ${fixturesDir}`);
  }
}

const estimateTokens = (text) => Math.max(1, Math.ceil(text.length / 4));
