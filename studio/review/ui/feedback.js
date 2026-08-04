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
  'valid-but-unfair',
  'good-unchanged',
  'strong-reveal',
  'difficulty-accurate',
  'not-always-true',
  'no-unifying-theme',
  'not-evocative',
  'feels-like-asto',
];

// Tags that read as praise, so the UI can tint them differently. Positive
// feedback is signal too — the spec is explicit that approvals are recorded.
const POSITIVE = new Set([
  'good-unchanged',
  'strong-reveal',
  'difficulty-accurate',
  'feels-like-asto',
]);

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

export function tagChips(scopeKey, { boardOnly = false } = {}) {
  return QUICK_TAGS.filter((tag) => boardOnly || !BOARD_ONLY.has(tag))
    .map(
      (tag) => `
      <label class="chip${POSITIVE.has(tag) ? ' chip-positive' : ''}">
        <input type="checkbox" data-scope="${escape(scopeKey)}" value="${escape(tag)}" />
        <span>${escape(tag)}</span>
      </label>`,
    )
    .join('');
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
  const sets = (board?.sets ?? [])
    .slice()
    .sort((a, b) => a.difficulty - b.difficulty)
    .map(
      (set) => `
      <section class="fb-block" data-set-id="${escape(set.id)}"
               data-difficulty="${escape(set.difficulty)}">
        <h4>${escape(set.id)} <span class="studio-muted">— ${escape(set.relationshipLabel)}</span></h4>
        <p class="fb-analogy">${escape(analogyOf(set))}</p>
        ${tierPicker(set.id, set.difficulty)}
        <div class="chips">${tagChips(set.id)}</div>
        <textarea class="note" data-scope="${escape(set.id)}" rows="2"
          placeholder="What is wrong with this set — or right about it?"></textarea>
      </section>`,
    )
    .join('');

  return `
    <section class="fb-block fb-board" data-set-id="">
      <h4>The board as a whole</h4>
      <div class="chips">${tagChips('', { boardOnly: true })}</div>
      <textarea class="note" data-scope="" rows="2"
        placeholder="Overall: variety, fairness, whether it feels like ASTO."></textarea>
    </section>
    ${sets}`;
}

/**
 * Reads the controls into schema-valid events. Blocks with no tag, no note and
 * no tier change are skipped — an untouched set is not an opinion.
 *
 * A tier change is its own event rather than a field on the verdict, because
 * the schema already models it that way: `change-difficulty` with `before` and
 * `after` has been in studio/schemas.js since the corpus was designed, waiting
 * for a control. Keeping it separate also keeps it countable — "how often does
 * the rater disagree with Max, and in which direction" is one filter over the
 * corpus, not a scan of prose.
 */
export function collectFeedback(root, { attemptId, defaultAction = 'revise-set' }) {
  const events = [];
  let counter = 0;
  const nextId = () => `fb-${attemptId}-${(counter += 1)}-${Date.now()}`;

  for (const block of root.querySelectorAll('.fb-block')) {
    const setId = block.dataset.setId;
    const tags = [...block.querySelectorAll('input[type=checkbox]:checked')].map((box) => box.value);
    const note = block.querySelector('.note').value.trim();
    const tierChange = tierChangeIn(block);
    if (tags.length === 0 && note.length === 0 && tierChange === null) continue;

    const isBoard = setId === '';
    if (tags.length > 0 || note.length > 0) {
      events.push({
        schemaVersion: '1.0',
        id: nextId(),
        attemptId,
        action: isBoard ? boardActionFor(defaultAction) : defaultAction,
        scope: isBoard ? { type: 'board' } : { type: 'set', setId },
        tags,
        ...(note.length > 0 ? { note } : {}),
        source: 'review-studio',
      });
    }

    if (tierChange !== null) {
      events.push({
        schemaVersion: '1.0',
        id: nextId(),
        attemptId,
        action: 'change-difficulty',
        scope: { type: 'set', setId },
        tags: [],
        before: { difficulty: tierChange.before },
        after: { difficulty: tierChange.after },
        source: 'review-studio',
      });
    }
  }
  return events;
}

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
