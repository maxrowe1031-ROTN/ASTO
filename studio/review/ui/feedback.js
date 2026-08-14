// feedback.js — the controls that turn a judgement into a stored event.
//
// The vocabulary is the spec's thirteen quick tags, fetched from nowhere and
// hard-coded here to match studio/schemas.js. That duplication is deliberate
// and small: the server revalidates every event against the schema, so if the
// two ever drift the server refuses the write rather than accepting a tag the
// corpus does not recognise. Browser validation is a convenience; the
// authority is server-side.

import { analogyOf } from './board-html.js';

export const QUICK_TAGS = [
  'relationship-does-not-click',
  'order-ambiguous',
  'too-obscure',
  'too-easy',
  'too-difficult',
  'cross-set-association',
  'repetitive-shape',
  'weak-explanation',
  'weak-label',
  'valid-but-unfair', // retired from the form 2026-08-05; still valid forever
  'good-unchanged',
  'strong-reveal',
  'difficulty-accurate',
  'not-always-true',
  'no-unifying-theme',
  'not-evocative',
  'feels-like-asto',
  'second-valid-reading',
  'sharp-words',
  'surprising-turn',
];

// Tags that read as praise, so the UI can tint them differently. Positive
// feedback is signal too — the spec is explicit that approvals are recorded.
//
// Rendered as one row above the faults, because Max uses them as a SCORECARD:
// all four on all four sets is his "this is ASTO" signal, and only two boards
// have ever earned it. Scannable beats alphabetical.
const POSITIVE = [
  'good-unchanged',
  'strong-reveal',
  'difficulty-accurate',
  'feels-like-asto',
];

// The faults, grouped by what kind of fault they are. Grouping is the whole
// point: seventeen chips in one undifferentiated wall is how
// `not-always-true` — added 2026-08-04 precisely because necessity failure is
// Max's most common reason for killing a set — went unused for four boards
// while he ticked `relationship-does-not-click` and wrote the necessity
// argument in prose underneath.
//
// The pair stays SPLIT rather than merged. The split was a considered decision
// with its reasoning recorded in schemas.js ("two different faults with two
// different fixes deserve two tags"), it is one day old, and Max's own ruling
// in the backlog is that silence is weak evidence of a wrong tag. What was
// missing was findability, not a smaller vocabulary.
const FAULT_GROUPS = [
  {
    label: 'the relationship',
    tags: [
      ['relationship-does-not-click', 'the link does not land, or the label reads badly'],
      ['not-always-true', 'B does not follow from A necessarily — "telescope : discovery"'],
      ['order-ambiguous', 'A : B reads much the same as B : A'],
      ['weak-label', 'the relationship is right but the wording is not'],
      ['weak-explanation', 'the reveal does not make it feel fair in hindsight'],
    ],
  },
  {
    label: 'difficulty',
    tags: [
      ['too-easy', 'lands below its tier'],
      ['too-difficult', 'lands above its tier'],
      ['too-obscure', 'the words, not the relationship, are the obstacle'],
    ],
  },
  {
    label: 'fairness',
    tags: [
      ['cross-set-association', 'a word pulls toward another set on the board'],
      // Replaced `valid-but-unfair` on 2026-08-05. That chip read "technically
      // correct, but the player could not have known", and across nine uses Max
      // never meant that — four of them meant this, and the rest were already
      // covered by `not-always-true` and `not-evocative`. A vague chip beside
      // precise ones collects everything; schemas.js RETIRED_TAGS has the count.
      //
      // It is the worst defect a board can carry, so it says so: the engine
      // accepts exactly one grouping, and a player who finds the other one is
      // marked wrong for being right.
      ['second-valid-reading', 'the same four words regroup into another analogy that also works'],
    ],
  },
  {
    label: 'the board as a whole',
    tags: [
      ['repetitive-shape', 'sets ask the same kind of question'],
      ['no-unifying-theme', 'the sixteen words do not read as one world'],
      ['not-evocative', 'nothing here is a pleasure to read'],
    ],
  },
];

// The taste axis (formVersion 4), its own row so the two kinds of praise stay
// distinguishable in the data. The scorecard above says a set WORKS; these say
// it delights, which the corpus keeps showing is a different question — five
// of six boards on 2026-08-08 were approved as "publishable, not exciting".
// Both from Max's own notes: `sharp-words` is the fun-house-mirror fix
// (specificity as delight), `surprising-turn` is fairy-tales' story-mixing
// conversion set ("works really well here").
const TASTE_TAGS = [
  ['sharp-words', 'the specific word where a general one would do — "fun house mirror", "Stealie"'],
  ['surprising-turn', 'the relationship or pairing you did not see coming — and loved'],
];

// The board-level delight verdict (formVersion 4), in Max's own vocabulary:
// "flat" is "didn't get the same rush", "delightful" is "YES! absolutely nails
// it". Deliberately orthogonal to the publishability verdict above it — the
// corpus's recurring pattern is boards that are one without the other, and
// until now only prose could say so.
export const TASTE_VERDICTS = [
  ['flat', 'flat', 'publishable maybe, but no spark'],
  ['solid', 'solid', 'good, enjoyable, does its job'],
  ['delightful', 'delightful', 'the rush — this is ASTO'],
];

const POSITIVE_SET = new Set(POSITIVE);

// The three set verdicts, in Max's words: publishable / publishable with an
// edit / replace it. Chosen per set and never inherited from the board button —
// his stated rule is that rejecting a board says the WHOLE is not publishable,
// while the individual analogies still deserve honest independent reads.
const SET_VERDICTS = [
  ['set-publishable', 'publishable', 'good as it stands'],
  ['set-needs-edit', 'needs an edit', 'close — say how below'],
  ['set-replace', 'replace', 'this one has to go'],
];

// The board verdict, tri-state. The middle state is the one the corpus kept
// producing with nowhere to put it: both boards rejected on 2026-08-05 had
// three of four sets praised and died on one blocking set.
export const BOARD_VERDICTS = [
  ['approve-board', 'publishable', 'ship it as it stands'],
  ['revise-board', 'publishable after a fix', 'name the set(s) blocking it'],
  ['reject-board', 'not publishable', 'the whole puzzle does not work'],
];

// Meaningless on a single set: a theme is a property of four sets together.
// Offering it per-set would collect events nothing could act on.
const BOARD_ONLY = new Set(['no-unifying-theme']);

// The four tiers, in difficulty order. Derived from difficulty 1–4 exactly as
// the game derives them (src/engine/tiers.js) — the picker records a
// DIFFICULTY, and the tier name is only how it is spelled to a human.
const TIERS = [
  { difficulty: 1, tier: 'green' },
  { difficulty: 2, tier: 'yellow' },
  { difficulty: 3, tier: 'red' },
  { difficulty: 4, tier: 'black' },
];

const escape = (value) =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const chip = (scopeKey, tag, title = '', extra = '') => `
      <label class="chip${extra}"${title ? ` title="${escape(title)}"` : ''}>
        <input type="checkbox" data-scope="${escape(scopeKey)}" value="${escape(tag)}" />
        <span>${escape(tag)}</span>
      </label>`;

/**
 * The tags for one scope: the positive scorecard row first, then the faults
 * grouped by kind. `boardOnly` decides whether board-scoped tags appear —
 * `no-unifying-theme` is meaningless on a single set, since a theme is a
 * property of four sets together.
 */
export function tagChips(scopeKey, { boardOnly = false } = {}) {
  const allowed = (tag) => (boardOnly ? true : !BOARD_ONLY.has(tag));

  const positives = POSITIVE.filter(allowed)
    .map((tag) => chip(scopeKey, tag, '', ' chip-positive'))
    .join('');

  // Taste is its own labelled row, never mixed into the scorecard: "it works"
  // and "it delights" must stay two different claims in the data.
  const taste = TASTE_TAGS.map(([tag, hint]) => chip(scopeKey, tag, hint, ' chip-positive')).join('');

  const groups = FAULT_GROUPS.map(({ label, tags }) => {
    const chips = tags
      .filter(([tag]) => allowed(tag))
      .map(([tag, hint]) => chip(scopeKey, tag, hint))
      .join('');
    return chips ? `
      <div class="fb-group">
        <span class="fb-group-label">${escape(label)}</span>
        <div class="chips">${chips}</div>
      </div>` : '';
  }).join('');

  return `
      <div class="fb-scorecard"><div class="chips">${positives}</div></div>
      <div class="fb-group fb-taste">
        <span class="fb-group-label">taste</span>
        <div class="chips">${taste}</div>
      </div>
      ${groups}`;
}

/** The three set verdicts as radios — a set gets one read, or none. */
export function setVerdictPicker(setId) {
  const options = SET_VERDICTS.map(
    ([value, label, hint]) => `
      <label class="chip chip-verdict" data-verdict="${escape(value)}" title="${escape(hint)}">
        <input type="radio" name="verdict-${escape(setId)}" data-scope="${escape(setId)}"
               data-role="verdict" value="${escape(value)}" />
        <span>${escape(label)}</span>
      </label>`,
  ).join('');
  return `
      <div class="fb-verdict">
        <span class="studio-muted">this set is</span>
        <div class="chips">${options}</div>
      </div>`;
}

/**
 * "Plays like" — the tier this set actually felt like while reading it.
 *
 * Max has written some version of "this should be a red" eight times in prose,
 * because a note was the only place to put it. A note cannot be counted; a
 * recorded difficulty can, and the difficulty rater's calibration is exactly
 * the thing that needs counting.
 *
 * Radios, not checkboxes: a set plays like one tier. There is no "none"
 * control because the unselected state IS none — nothing is pre-checked, so an
 * untouched picker says nothing rather than agreeing by default.
 */
export function tierPicker(setId, difficulty) {
  const options = TIERS.map(
    ({ difficulty: value, tier }) => `
      <label class="chip chip-tier" data-tier="${tier}">
        <input type="radio" name="tier-${escape(setId)}" data-scope="${escape(setId)}"
               data-role="tier" value="${value}" />
        <span>${tier}</span>
      </label>`,
  ).join('');
  return `
      <div class="fb-tier">
        <span class="studio-muted">plays like</span>
        <div class="chips">${options}</div>
      </div>`;
}

/** One feedback block per set, plus one for the board as a whole. */
export function feedbackControls(board) {
  const ordered = (board?.sets ?? []).slice().sort((a, b) => a.difficulty - b.difficulty);

  const sets = ordered
    .map(
      (set) => `
      <section class="fb-block" data-set-id="${escape(set.id)}"
               data-difficulty="${escape(set.difficulty)}">
        <h4>${escape(set.id)} <span class="studio-muted">— ${escape(set.relationshipLabel)}</span></h4>
        <p class="fb-analogy">${escape(analogyOf(set))}</p>
        ${setVerdictPicker(set.id)}
        ${tierPicker(set.id, set.difficulty)}
        ${tagChips(set.id)}
        <textarea class="note" data-scope="${escape(set.id)}" rows="2"
          placeholder="What is wrong with this set — or right about it?"></textarea>
        <textarea class="fix" data-scope="${escape(set.id)}" rows="2"
          placeholder="How would you fix it? (e.g. &quot;spy is to alias as gun is to holster — one uses the other to stay hidden&quot;)"></textarea>
      </section>`,
    )
    .join('');

  // Which set(s) stop the board being publishable. Only meaningful alongside
  // the middle verdict, but always rendered: hiding it behind a radio would
  // make it invisible until after the decision it belongs to.
  const blockers = ordered
    .map(
      (set) => `
      <label class="chip chip-blocker">
        <input type="checkbox" data-role="blocker" value="${escape(set.id)}" />
        <span>${escape(set.id)}</span>
      </label>`,
    )
    .join('');

  const verdicts = BOARD_VERDICTS.map(
    ([value, label, hint]) => `
      <label class="chip chip-verdict" data-verdict="${escape(value)}" title="${escape(hint)}">
        <input type="radio" name="board-verdict" data-role="board-verdict" value="${escape(value)}" />
        <span>${escape(label)}</span>
      </label>`,
  ).join('');

  // The delight row (formVersion 4). A separate radio group from the verdict
  // above it, because they answer different questions and the corpus needs to
  // be able to say "publishable AND flat" — which is exactly the combination
  // prose kept carrying with no field to land in.
  const tastes = TASTE_VERDICTS.map(
    ([value, label, hint]) => `
      <label class="chip chip-verdict" data-taste="${escape(value)}" title="${escape(hint)}">
        <input type="radio" name="board-taste" data-role="board-taste" value="${escape(value)}" />
        <span>${escape(label)}</span>
      </label>`,
  ).join('');

  return `
    <section class="fb-block fb-board" data-set-id="">
      <h4>The board as a whole</h4>
      <div class="fb-verdict">
        <span class="studio-muted">as a puzzle, this is</span>
        <div class="chips">${verdicts}</div>
      </div>
      <div class="fb-verdict fb-taste-verdict">
        <span class="studio-muted">as an experience, it felt</span>
        <div class="chips">${tastes}</div>
      </div>
      <div class="fb-blockers">
        <span class="studio-muted">blocked by</span>
        <div class="chips">${blockers}</div>
      </div>
      ${tagChips('', { boardOnly: true })}
      <textarea class="note" data-scope="" rows="2"
        placeholder="Overall: variety, fairness, whether it feels like ASTO."></textarea>
    </section>
    ${sets}`;
}

/**
 * Reads the controls into schema-valid events. A block with nothing said in it
 * is skipped — an untouched set is not an opinion.
 *
 * The load-bearing change of formVersion 2: **a set's verdict is its own**.
 * Version 1 stamped the board button's action onto every set block, so a set
 * Max called "a great green" was recorded `reject-set` because the board it sat
 * on was unpublishable. 21 of 79 tagged set-events in the corpus say that. His
 * rule, and now the form's: a board verdict is about the publishability of the
 * WHOLE; each set still gets an honest independent read, or none.
 *
 * A tier change stays its own event, as it has been since the corpus was
 * designed — keeping it separate keeps it countable ("how often does the rater
 * disagree with Max, and in which direction" is one filter, not a prose scan).
 *
 * @param defaultAction the board verdict when no radio was picked — the button
 *                      Max pressed, so pressing Reject with no radio still
 *                      records a rejection of the board.
 */
export function collectFeedback(root, { attemptId, defaultAction = 'revise-set', playthrough = null } = {}) {
  const events = [];
  let counter = 0;
  const nextId = () => `fb-${attemptId}-${(counter += 1)}-${Date.now()}`;
  const base = () => ({
    schemaVersion: '1.0',
    id: nextId(),
    attemptId,
    formVersion: FORM_VERSION,
    source: 'review-studio',
  });

  for (const block of root.querySelectorAll('.fb-block')) {
    const setId = block.dataset.setId;
    const isBoard = setId === '';
    const tags = [...block.querySelectorAll('input[type=checkbox][data-scope]:checked')].map(
      (box) => box.value,
    );
    const note = block.querySelector('.note').value.trim();
    const fix = block.querySelector('.fix')?.value.trim() ?? '';
    const tierChange = tierChangeIn(block);
    const verdict = isBoard ? boardVerdictIn(root) : setVerdictIn(block);
    const blockers = isBoard ? blockersIn(root) : [];
    const taste = isBoard ? tasteIn(root) : null;

    const saidSomething =
      tags.length > 0 ||
      note.length > 0 ||
      fix.length > 0 ||
      verdict !== null ||
      blockers.length > 0 ||
      taste !== null;

    if (saidSomething) {
      events.push({
        ...base(),
        // A set with no verdict picked records the neutral `revise-set`: Max
        // touched it without ruling on it. It never inherits the board's word.
        action: isBoard ? (verdict ?? boardActionFor(defaultAction)) : (verdict ?? 'revise-set'),
        scope: isBoard ? { type: 'board' } : { type: 'set', setId },
        tags,
        ...(note.length > 0 ? { note } : {}),
        ...(fix.length > 0 ? { fixSuggestion: fix } : {}),
        ...(isBoard && blockers.length > 0 ? { blockers } : {}),
        ...(taste !== null ? { taste } : {}),
      });
    }

    if (tierChange !== null) {
      events.push({
        ...base(),
        action: 'change-difficulty',
        scope: { type: 'set', setId },
        tags: [],
        before: { difficulty: tierChange.before },
        after: { difficulty: tierChange.after },
      });
    }
  }

  // How the board was actually played. Board-scoped, and only when a
  // playthrough was recorded — see play.js for the first-play-only rule.
  if (playthrough) {
    events.push({
      ...base(),
      action: 'playthrough',
      scope: { type: 'board' },
      tags: [],
      playthrough,
      source: 'review-studio-play',
    });
  }

  return events;
}

// Exported so review.js stamps the same number on the proposal-verdict events
// it writes. It had its own literal `2` until 2026-08-05, which is one version
// bump away from silently splitting one population into two.
//
// 4 (2026-08-09): the taste instrument — board-level flat/solid/delightful
// verdict and the two taste tags. schemas.js FEEDBACK_FORM_VERSION documents
// the population boundary.
//
// 5 (2026-08-13): B2 hand-editing exists. Events from this form now share the
// corpus with `hand-edit` records, and an unapplied change is a choice.
export const FORM_VERSION = 5;

const setVerdictIn = (block) =>
  block.querySelector('input[data-role=verdict]:checked')?.value ?? null;

const boardVerdictIn = (root) =>
  root.querySelector('input[data-role=board-verdict]:checked')?.value ?? null;

const tasteIn = (root) =>
  root.querySelector('input[data-role=board-taste]:checked')?.value ?? null;

const blockersIn = (root) =>
  [...root.querySelectorAll('input[data-role=blocker]:checked')].map((box) => box.value);

/**
 * The picked tier, or null when nothing was picked or the pick agrees with the
 * board.
 *
 * Agreement deliberately records nothing: `difficulty-accurate` already says
 * "this tier is right", and a change-difficulty event where before equals
 * after would be a disagreement that isn't one — noise in the exact number the
 * corpus exists to measure.
 */
function tierChangeIn(block) {
  const picked = block.querySelector('input[data-role=tier]:checked');
  if (!picked) return null;
  const before = Number(block.dataset.difficulty);
  const after = Number(picked.value);
  if (!Number.isInteger(before) || !Number.isInteger(after) || before === after) return null;
  return { before, after };
}

// The per-set actions have board-scoped twins; a board-scoped event must use
// the board one or the schema rejects it.
const boardActionFor = (action) =>
  ({ 'revise-set': 'revise-board', 'reject-set': 'reject-board', 'approve-set': 'approve-board' })[
    action
  ] ?? 'revise-board';
