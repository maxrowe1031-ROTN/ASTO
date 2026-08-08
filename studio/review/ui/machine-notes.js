// machine-notes.js — what the pipeline found, filed under the set it is about.
//
// Split out of review.js on 2026-08-08 so it can be tested with no DOM, the
// same reason board-html.js is a string builder. It was not split for elegance:
// this function had a crash in it that survived every review of every board,
// because nothing could reach it without a browser.
//
// The crash: 06 answers the cross-reading checklist BY ID, and this code read
// two fields — `setId` and `reading` — that its output has never carried. A
// `valid: false` entry skipped before the destructure, so boards rendered
// perfectly while the check found nothing, and the FIRST board where a check
// came back true blanked the whole review page. A crash that fires only when
// the finding is real, on the note this file calls the defect that makes a
// board actively unfair.
//
// Pure: takes an attempt, returns { setId: [notes] }. No DOM, no fetch.

/**
 * The evaluators' findings, regrouped from stage-shaped to set-shaped.
 *
 * 05 and 06 have been describing real defects for weeks, filed by stage in a
 * collapsed panel at the foot of the page — so Max rediscovered them by
 * playing the boards instead. Their findings were per-set all along; this is
 * only a regrouping, and `board-html.js` stays ignorant of which stage said
 * what.
 *
 * A cross-reading answered `valid: true` is the loudest thing on the page,
 * because it is the one defect that makes a board actively unfair: the engine
 * refuses that reading, so a player who finds it is marked wrong for being
 * right. Answered `false` is silent — a checklist item that passed is not news.
 */
export function machineNotesBySet(attempt) {
  const notes = {};
  const add = (setId, note) => {
    if (!setId) return;
    (notes[setId] ??= []).push(note);
  };

  for (const verdict of attempt.reports['05-analogy-validator']?.verdicts ?? []) {
    // Only the failures. A pass note says the set works, which is what the set
    // already looks like — it would be noise on every card.
    if (verdict.pass === false) {
      add(verdict.setId, { source: 'analogy validator', level: 'medium', text: verdict.notes });
    }
  }

  const solver = attempt.reports['06-adversarial-solver'];
  const setIdsByWord = new Map();
  for (const set of attempt.board?.sets ?? []) {
    for (const word of (set.pairs ?? []).flat()) setIdsByWord.set(word, set.id);
  }
  for (const finding of solver?.findings ?? []) {
    // A finding names words, not a set. It belongs to a set when all its words
    // come from one; anything spanning sets is a board-level observation and
    // stays in the panel below rather than being filed under a set arbitrarily.
    const owners = new Set((finding.words ?? []).map((word) => setIdsByWord.get(word)));
    if (owners.size === 1) {
      const [setId] = [...owners];
      add(setId, { source: finding.kind, level: finding.severity, text: finding.note });
    }
  }
  // 07 is blind by construction — it names words, never sets — so the mapping
  // from word to set happens here, exactly as it does for 06's findings above.
  // This is the detector for a set only its subject's fans can solve, which is
  // the defect Max found by playing (design.md D-8).
  for (const gated of attempt.reports['07-test-player']?.knowledgeGated ?? []) {
    add(setIdsByWord.get(gated.word), {
      source: 'needs knowledge',
      level: 'medium',
      text: `"${gated.word}" — ${gated.note}`,
    });
  }

  // 06 answers the cross-reading checklist BY ID — `{ id: "set-seasons#1",
  // valid, note }` — because the readings themselves were enumerated
  // deterministically and handed to it. This code used to read `reading.setId`
  // and destructure `reading.reading`, and neither field has ever existed.
  //
  // The cost was not cosmetic. `valid: false` skipped before the destructure,
  // so the whole board rendered fine while the check found nothing — and the
  // first time a check came back TRUE the destructure threw and blanked the
  // entire review page. A crash that fires only when the finding is real, on
  // the one note this file calls the defect that makes a board actively
  // unfair. Found 2026-08-08 by a mock run whose fixture says `valid: true`.
  for (const reading of solver?.crossReadings ?? []) {
    if (!reading.valid) continue;
    // "set-seasons#1" → "set-seasons". The suffix is which of the set's two
    // cross-readings it is, which the note already says in words.
    const setId = String(reading.id ?? '').split('#')[0];
    if (!setId) continue;
    // Both halves' relations, when 06 named them (design.md D-13). The verdict
    // used to be a bare boolean, so a claim this expensive arrived with nothing
    // to weigh it against — and a wrong one looked exactly like a right one.
    // Showing the reasoning is what lets Max score the check against his own
    // `order-ambiguous` calls, which is what D-7's graduation trigger reads.
    const relations =
      reading.leftRelation && reading.rightRelation
        ? ` Both halves read as: "${reading.leftRelation}" and "${reading.rightRelation}".`
        : '';
    add(setId, {
      source: 'also reads',
      level: 'high',
      text: `${reading.note} The engine refuses this reading, so a player who finds it loses a mistake.${relations}`,
    });
  }

  // Order fairness (design.md D-9). Three sources, deliberately combined here
  // rather than shown as three panels: 04a says which sets are structurally
  // symmetric, 06 says whether the words rescue the order, 07 says whether it
  // felt like a guess. Only the unrescued ones are news — a set 06 cleared is
  // silent for the same reason a cross-reading answered `false` is.
  const cleared = new Set(
    (solver?.orderReadings ?? []).filter((entry) => entry.inferable).map((entry) => entry.setId),
  );
  for (const flag of attempt.reports['04a-integrity']?.orderFairness?.flagged ?? []) {
    if (cleared.has(flag.setId)) continue;
    const verdict = (solver?.orderReadings ?? []).find((entry) => entry.setId === flag.setId);
    add(flag.setId, {
      source: 'order may be a coin flip',
      level: 'high',
      text:
        `${flag.note ?? `this set's relationship reads the same both ways round`}. ` +
        `The engine accepts a flip only when BOTH pairs flip together, so a player who reads one pair the other way round loses a mistake on a grouping they had right` +
        (verdict ? '. The adversarial solver agrees a player would be guessing' : ''),
    });
  }
  // 07 names words, never sets — mapped here like everything else it reports.
  for (const guessed of attempt.reports['07-test-player']?.orderGuessed ?? []) {
    const owners = new Set((guessed.words ?? []).map((word) => setIdsByWord.get(word)));
    if (owners.size !== 1) continue;
    const [setId] = [...owners];
    add(setId, { source: 'test player guessed the order', level: 'medium', text: guessed.note });
  }

  // Self-matching pairs (design.md D-12). Computed deterministically by 04a,
  // so this only phrases it. Two levels, matching the two things it means: one
  // pair is a foothold worth noticing, two mean the analogy is never read.
  //
  // Never framed as a defect, because Max has explicitly not decided that it
  // is — *"It seems too easy but maybe that needs testing from other
  // audiences"* — and one of his favourite sets carries one. The note states
  // the fact and leaves the verdict where it belongs.
  for (const [setId, count] of Object.entries(
    attempt.reports['04a-integrity']?.lexical?.bySet ?? {},
  )) {
    add(setId, {
      source: count === 2 ? 'solvable by word-matching' : 'one pair matches on sight',
      level: count === 2 ? 'medium' : 'low',
      text:
        count === 2
          ? 'Both pairs share visible text, so a player can couple all four words without reading the relationship at all — the set assembles itself.'
          : 'One pair shares visible text, so it couples on sight. Often a good way in; worth knowing it is doing that work rather than the relationship.',
    });
  }

  // Span sets, with the refused readings spelled out (design.md D-13).
  //
  // Deterministic, so unlike every other note on this card it cannot go quiet.
  // The point is not that a time set is bad — Max has approved several — but
  // that when four words share one timeline, the regrouping usually reads
  // "earlier : later" too, and the engine marks that player wrong. He caught
  // exactly that by hand on the flowers board while 06 said `valid: false`.
  // Louder at the top tier, where a set carries the most weight.
  for (const flag of attempt.reports['04a-integrity']?.spanFairness?.flagged ?? []) {
    add(flag.setId, {
      source: 'span set — check the refused readings',
      level: flag.difficulty === 4 ? 'medium' : 'low',
      text:
        `Both pairs are time spans, so the readings the engine refuses may be valid analogies too — ` +
        `a player who finds one is marked wrong for being right. Refused here: ${flag.readings.join('  ·  ')}.`,
    });
  }

  return notes;
}
