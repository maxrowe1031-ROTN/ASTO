// examples.js — the teaching examples agents are shown, and the rule about
// what shape they may take.
//
// Pure. Imports nothing.
//
// ═══ WHY THIS MODULE EXISTS ═══
//
// D-8 put a FULL SET in 01's prompt to teach arrangement-hard difficulty:
// "planting : felling :: budding : withering". It taught, and then it was
// handed in. `trees-tools-and-time`'s published Black is that line verbatim,
// and the 2026-08-08 rose board returned "planting : uprooting :: budding :
// wilting" — a paraphrase, so no ban on the literal words would have caught it.
//
// The measurement that explains it, taken across all 15 published boards:
//
//   36 PAIR-level examples (the vocabulary block: `flower : tulip`,
//   `moon : crater`, `constellation : Orion`) → ZERO verbatim leaks.
//   1 FULL-SET example → leaked into a published board, then paraphrased
//   into the next one that needed a hard set.
//
// The difference is not how vivid an example is; it is whether it is shaped
// like the DELIVERABLE. A pair illustrates a property and still leaves the
// model everything to do — find a partner pair, a theme, an order. A finished
// four-word set is an answer, and an answer in the prompt is an answer in the
// output.
//
// ═══ THE RULE ═══
//
// Teaching examples are PAIR-LEVEL, and they live here rather than inline in
// agent files. Two reasons, and the second is the one that matters:
//
//   One source. 01 and 03 taught the same lesson from two hand-written copies
//   of the same sentence, which is exactly the drift `vocabulary.js` exists to
//   prevent for shapes.
//
//   No agent prompt may quote a concrete full set. Pinned for EVERY registered
//   agent in test/studio/agents/no-full-set-examples.test.js, so this is a
//   property of the pipeline rather than a fact about two files that someone
//   later re-breaks in a third. See design.md D-12.

/**
 * The arrangement-hard anchor, at pair level.
 *
 * `planting : felling` is kept because it is genuinely the clearest instance
 * of the property — two ordinary words bracketing a span — and the leak was
 * never the words, it was the finished set they sat in. The partner pair is
 * deliberately absent: finding one from a DIFFERENT span is the work being
 * taught, and supplying it is what turned teaching into dictation.
 */
export const ARRANGEMENT_HARD = Object.freeze({
  pair: Object.freeze(['planting', 'felling']),
  label: "a span's start and end, in ordinary words",
  property:
    'the work is seeing that both pairs run start-to-end across different spans — opposites facing each other, a shift of scale, a reversal, a pair that runs the other way',
});

/**
 * The arrangement bullet, rendered for a prompt.
 *
 * @param context 'author' for the stage that must CREATE such a set,
 *                'grade' for the stage that must RECOGNISE one.
 */
export function renderArrangementHard(context = 'author') {
  const { pair, label, property } = ARRANGEMENT_HARD;
  const example = `"${pair[0]} : ${pair[1]}" is ${label}`;

  const closing =
    context === 'grade'
      ? 'A set built from two such pairs, across different spans, is a grade 4 even though every word in it is ordinary.'
      : // The no-reuse line is aimed at paraphrase, not just copying, because
        // paraphrase is what actually happened.
        'That pair is an ILLUSTRATION, not a starting point: it needs a partner pair from a different span, and finding one is the work. Do not build your set from this pair, its span, or near-synonyms of it — a set assembled from the example is borrowed, not authored.';

  return `ordinary words whose placement is the puzzle. ${example} — four words a child knows can make one of the hardest sets in this game, because ${property}. ${closing}`;
}
