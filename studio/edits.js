// edits.js — the pure heart of B2 hand-editing (design.md D-22).
//
// The server route in review/api.js owns the writes; this module owns the
// derivations: where an edited board lives, what changed between two boards,
// and how a change becomes a feedback event. Pure on purpose — every diff rule
// is testable against two fabricated boards, and the UI never computes a diff
// (it sends the whole edited board; the server derives the record, so the
// before/after in the corpus can never be a browser's opinion).
//
// The fix-in-place scope is enforced here: sets are joined BY ID, and a board
// whose set ids do not match its predecessor's exactly is not an edit — it is
// a different board, and diffBoards throws rather than guess at intent.

import { FEEDBACK_FORM_VERSION } from './schemas.js';

/** One field the editor may touch, per set. `pairs` is one field: order is the game. */
const SET_FIELDS = ['relationshipLabel', 'explanation', 'difficulty', 'pairs'];

/** The run-level artifact an edit is saved to — keyed by attempt, like the
 * Revision Proposer's briefs, so a revision can never inherit a stale edit. */
export const editedBoardFile = (attemptId) => `edited-board-${attemptId}.json`;

/**
 * What changed, field by field: [{ scope, before: {field: v}, after: {field: v} }].
 *
 * One entry per changed field — a difficulty swap yields two entries, one per
 * set, because both sets honestly moved. Throws when the set ids differ:
 * fix-in-place editing never adds, removes, or renames a set.
 */
export function diffBoards(before, after) {
  const beforeIds = before.sets.map((s) => s.id);
  const afterIds = after.sets.map((s) => s.id);
  if (
    beforeIds.length !== afterIds.length ||
    !beforeIds.every((id) => afterIds.includes(id))
  ) {
    throw new Error(
      'the edited board must keep the same sets — adding, removing, or renaming a set is not a fix-in-place edit'
    );
  }

  const diff = [];

  if (before.title !== after.title) {
    diff.push({
      scope: { type: 'board' },
      before: { title: before.title },
      after: { title: after.title }
    });
  }

  for (const previous of before.sets) {
    const edited = after.sets.find((s) => s.id === previous.id);
    for (const field of SET_FIELDS) {
      if (JSON.stringify(previous[field]) === JSON.stringify(edited[field])) continue;
      diff.push({
        scope: { type: 'set', setId: previous.id },
        before: { [field]: previous[field] },
        after: { [field]: edited[field] }
      });
    }
  }

  return diff;
}

/**
 * Diff entries → ready-to-append feedback events. `ids` is injected (a counter
 * or timestamped factory) so this stays pure and the route owns uniqueness.
 */
export function handEditEvents(diff, { attemptId, ids }) {
  return diff.map((entry, index) => ({
    schemaVersion: '1.0',
    id: ids(index + 1),
    attemptId,
    formVersion: FEEDBACK_FORM_VERSION,
    source: 'review-studio-edit',
    action: 'hand-edit',
    scope: entry.scope,
    tags: [],
    before: entry.before,
    after: entry.after
  }));
}
