// No published board may be built from a teaching example.
//
// The sibling of manifest.test.js and board-integrity.test.js, and it exists
// for the same reason they do: content ships as data, so `npm test` is what
// keeps the data honest.
//
// What it makes impossible: a board whose hardest set was lifted from the
// prompt that asked for it. That is not a hypothetical — `trees-tools-and-time`
// shipped on 2026-08-05 with a Black that is 01's own arrangement example
// verbatim, and nobody noticed until 2026-08-08, when the rose board returned a
// paraphrase of the same line and the two together made the pattern visible.
//
// The prompt side is fixed (studio/corpus/examples.js demotes the example to a
// pair; test/studio/agents/no-full-set-examples.test.js keeps finished sets out
// of every generative prompt). This is the other half: prompts can be edited
// back, and a board once published stays published. A board is the artifact
// that reaches players, so it gets its own guard.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PUZZLES = join(import.meta.dirname, '..', '..', 'puzzles');

/**
 * Word pairs that have appeared in an agent prompt as teaching material.
 *
 * A set is flagged when it contains BOTH words of an entry as one of its
 * pairs — not merely somewhere on the board. "planting" is a perfectly good
 * rose word; "planting : felling" as an authored pair is the example being
 * handed back.
 */
const TAUGHT_PAIRS = [
  { pair: ['planting', 'felling'], source: "01's arrangement-hard example" },
  { pair: ['budding', 'withering'], source: "01's arrangement-hard example" },
  // rule-008's failing set, which rides into every generative prompt as
  // context. Safe to ban outright: neither pair is a plausible board pair a
  // real theme would reach for, so a match can only be the rule coming back.
  { pair: ['sonar', 'mapping'], source: 'rule-008, the grain-mismatch example' },
  { pair: ['submersible', 'exploration'], source: 'rule-008, the grain-mismatch example' },
];

/**
 * Deliberately NOT banned, though they are also taught in rule-009.
 *
 * `second : minute`, `hour : day` — the rule's own fix for a repeated word,
 * and a set a themed time board could honestly author on its own. Banning it
 * would fail real work to prevent a copy that 82 boards say has never happened.
 *
 * `president : air force one`, `monarch : royal train` — same, and the backlog's
 * own analysis of the Obama run says `President : Air Force One` is a perfectly
 * good pair "once it has a partner from elsewhere". A ban here would contradict
 * a conclusion already reached.
 *
 * The line: ban a taught pair only when nothing but the lesson would produce
 * it. Everything else is watched at the prompt instead
 * (test/studio/agents/no-full-set-examples.test.js).
 */
const DELIBERATELY_UNBANNED = ['second : minute', 'hour : day', 'president : air force one'];

/**
 * Boards that predate the rule and are knowingly kept.
 *
 * `trees-tools-and-time` — Max's call, 2026-08-08: it is a good set, players
 * never know its provenance, and republishing would cost a board for a reason
 * no player can perceive. The provenance is recorded in design.md D-12 instead,
 * so a rubric compiled from the corpus later does not credit the pipeline with
 * authoring that Black.
 *
 * Grandfathering is deliberately per-slug and not per-pair: a NEW board with
 * the same defect still fails, which is the point.
 */
const GRANDFATHERED = new Set(['trees-tools-and-time']);

const boardFiles = readdirSync(PUZZLES).filter((f) => f.endsWith('.json') && f !== 'index.json');

const asPair = (pair) => pair.map((word) => String(word).toLowerCase().trim());

for (const file of boardFiles) {
  const slug = file.replace(/\.json$/, '');

  test(`${slug}: no set is built from a prompt example`, () => {
    const board = JSON.parse(readFileSync(join(PUZZLES, file), 'utf8'));

    for (const set of board.sets) {
      for (const pair of set.pairs) {
        const [a, b] = asPair(pair);
        for (const taught of TAUGHT_PAIRS) {
          const [x, y] = taught.pair;
          const matches = (a === x && b === y) || (a === y && b === x);
          if (!matches) continue;

          assert.ok(
            GRANDFATHERED.has(slug),
            `${slug} set "${set.id}" uses ${taught.pair.join(' : ')}, which is ${taught.source}. ` +
              'A board must not be assembled from the prompt that asked for it. Re-run the ' +
              'theme, or add the slug to GRANDFATHERED with the decision recorded in design.md.',
          );
        }
      }
    }
  });
}

test('every board on disk was actually checked', () => {
  // A guard that silently checked nothing would look exactly like a guard that
  // passed — the same failure mode manifest.test.js was written against.
  assert.ok(boardFiles.length >= 15, `only ${boardFiles.length} boards found in puzzles/`);
});

// Keeps the judgment above honest: if someone later adds one of these to
// TAUGHT_PAIRS, they have to delete it here and read why it was left out.
test('the pairs we chose not to ban are still not banned', () => {
  const banned = new Set(TAUGHT_PAIRS.map((t) => t.pair.join(' : ')));
  for (const pair of DELIBERATELY_UNBANNED) {
    assert.ok(!banned.has(pair), `${pair} was banned — see DELIBERATELY_UNBANNED for why not`);
  }
});

test('the grandfather list still describes reality', () => {
  // If trees is ever re-run or unpublished, this exemption should go with it
  // rather than sitting here granting permission nobody needs.
  for (const slug of GRANDFATHERED) {
    assert.ok(
      boardFiles.includes(`${slug}.json`),
      `${slug} is grandfathered but no longer published — drop it from the list`,
    );
  }
});
