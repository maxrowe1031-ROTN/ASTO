// feedback.js — the controls that turn a judgement into a stored event.
//
// The vocabulary is the spec's thirteen quick tags, fetched from nowhere and
// hard-coded here to match studio/schemas.js. That duplication is deliberate
// and small: the server revalidates every event against the schema, so if the
// two ever drift the server refuses the write rather than accepting a tag the
// corpus does not recognise. Browser validation is a convenience; the
// authority is server-side.

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
];

// Tags that read as praise, so the UI can tint them differently. Positive
// feedback is signal too — the spec is explicit that approvals are recorded.
const POSITIVE = new Set(['good-unchanged', 'strong-reveal', 'difficulty-accurate']);

const escape = (value) =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function tagChips(scopeKey) {
  return QUICK_TAGS.map(
    (tag) => `
      <label class="chip${POSITIVE.has(tag) ? ' chip-positive' : ''}">
        <input type="checkbox" data-scope="${escape(scopeKey)}" value="${escape(tag)}" />
        <span>${escape(tag)}</span>
      </label>`,
  ).join('');
}

/** One feedback block per set, plus one for the board as a whole. */
export function feedbackControls(board) {
  const sets = (board?.sets ?? [])
    .slice()
    .sort((a, b) => a.difficulty - b.difficulty)
    .map(
      (set) => `
      <section class="fb-block" data-set-id="${escape(set.id)}">
        <h4>${escape(set.id)} <span class="studio-muted">— ${escape(set.relationshipLabel)}</span></h4>
        <div class="chips">${tagChips(set.id)}</div>
        <textarea class="note" data-scope="${escape(set.id)}" rows="2"
          placeholder="What is wrong with this set — or right about it?"></textarea>
      </section>`,
    )
    .join('');

  return `
    <section class="fb-block fb-board" data-set-id="">
      <h4>The board as a whole</h4>
      <div class="chips">${tagChips('')}</div>
      <textarea class="note" data-scope="" rows="2"
        placeholder="Overall: variety, fairness, whether it feels like ASTO."></textarea>
    </section>
    ${sets}`;
}

/**
 * Reads the controls into schema-valid events. Blocks with neither a tag nor
 * a note are skipped — an untouched set is not an opinion.
 */
export function collectFeedback(root, { attemptId, defaultAction = 'revise-set' }) {
  const events = [];
  let counter = 0;

  for (const block of root.querySelectorAll('.fb-block')) {
    const setId = block.dataset.setId;
    const tags = [...block.querySelectorAll('input[type=checkbox]:checked')].map((box) => box.value);
    const note = block.querySelector('.note').value.trim();
    if (tags.length === 0 && note.length === 0) continue;

    const isBoard = setId === '';
    events.push({
      schemaVersion: '1.0',
      id: `fb-${attemptId}-${(counter += 1)}-${Date.now()}`,
      attemptId,
      action: isBoard ? boardActionFor(defaultAction) : defaultAction,
      scope: isBoard ? { type: 'board' } : { type: 'set', setId },
      tags,
      ...(note.length > 0 ? { note } : {}),
      source: 'review-studio',
    });
  }
  return events;
}

// The per-set actions have board-scoped twins; a board-scoped event must use
// the board one or the schema rejects it.
const boardActionFor = (action) =>
  ({ 'revise-set': 'revise-board', 'reject-set': 'reject-board', 'approve-set': 'approve-board' })[
    action
  ] ?? 'revise-board';
