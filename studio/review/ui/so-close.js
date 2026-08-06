// so-close.js — how many of the test player's own submissions were
// right-words-wrong-order (design.md D-9).
//
// Its own module for the same reason board-html.js is one: review.js reaches
// for `document` at module scope, so anything that needs testing under node has
// to live beside it rather than inside it. This is pure arithmetic over the
// engine's accepted-order algebra and an artifact 07 already produces — no DOM,
// no fetch, no judgement.
//
// Why the number is worth showing. Across 13 recorded playthroughs Max has
// never won, and on the four boards where he reached three sets most or all of
// his mistakes were "So close!" — on Yankees, four out of four, without ever
// grouping the wrong words. The model's count on the same board is expected to
// be LOW, because a model does not experience a coin flip: it picks an order
// and writes a fluent rationale for it. The gap between the two counts is the
// signal, which is why this is shown beside his real one rather than instead.

import { acceptedOrders } from '../../../src/engine/arrangements.js';

/**
 * @param {object|null} board - the finished board, or null
 * @param {object|null|undefined} report - 07's output
 * @returns {{ soClose: number, submissions: number }}
 */
export function simulatedSoClose(board, report) {
  // Keyed by the SET of four words, so a submission is matched to its set
  // regardless of the order it was written in — which is the whole question.
  const accepted = new Map(
    (board?.sets ?? []).map((set) => [
      key(set.pairs.flat()),
      new Set(acceptedOrders(set.pairs).map((order) => order.join('\u0000'))),
    ]),
  );

  let soClose = 0;
  let submissions = 0;
  for (const trial of report?.trials ?? []) {
    for (const submission of trial.submissions ?? []) {
      const words = submission.words ?? [];
      if (words.length !== 4) continue;
      submissions += 1;
      const orders = accepted.get(key(words));
      // Found the right four words, wrote them in an order the engine refuses.
      if (orders && !orders.has(words.join('\u0000'))) soClose += 1;
    }
  }
  return { soClose, submissions };
}

// NUL-joined, not space-joined: board words contain spaces ("Opening Day",
// "practice swings"), so ["a b", "c"] and ["a", "b c"] would key identically
// and one foursome would be scored against the other's accepted orders.
const key = (words) => [...words].sort().join('\u0000');
