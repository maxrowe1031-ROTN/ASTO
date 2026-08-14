// The hand-editor (D-22): fix-in-place editing of a candidate board.
//
// Split exactly as feedback.js is split: `editorHtml` and `collectBoard` are
// pure string/DOM-reading functions node:test can drive with a stub, and
// `wireEditor` is the browser glue. The editor renders its own form panel —
// board-html.js stays inert, its "same markup as the game" contract untouched.
//
// The browser's validation here is CONVENIENCE — the same validatePuzzle the
// game runs, imported live so Max sees a duplicate word the moment he types
// it. The server re-runs everything on save and is the only authority; this
// module never computes a diff and never writes anything.

import { validatePuzzle } from '../../../src/source/validate-puzzle.js';
import { checkBoard } from '../../../src/engine/board-integrity.js';
import { difficultyToTier } from '../../../src/engine/tiers.js';
import { analogyOf } from './board-html.js';

const escape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const WORD_SLOTS = ['A', 'B', 'C', 'D'];

/** The whole form, values prefilled from the board being edited. */
export function editorHtml(board) {
  const inTierOrder = [...board.sets].sort((a, b) => a.difficulty - b.difficulty);
  return `
    <form class="edit-board" data-board-id="${escape(board.id)}">
      <label class="edit-title">Title
        <input data-edit="title" value="${escape(board.title)}" />
      </label>
      ${inTierOrder
        .map(
          (set) => `
      <fieldset class="edit-set" data-set-id="${escape(set.id)}">
        <legend>${escape(set.id)} · ${escape(analogyOf(set))}</legend>
        <label>Relationship
          <input data-edit="relationshipLabel" value="${escape(set.relationshipLabel)}" />
        </label>
        <label>Explanation
          <textarea data-edit="explanation">${escape(set.explanation)}</textarea>
        </label>
        <div class="edit-words">
          ${set.pairs
            .flat()
            .map(
              (word, i) => `
          <label>${WORD_SLOTS[i]}
            <input data-edit="word" value="${escape(word)}" />
          </label>`,
            )
            .join('')}
        </div>
        <label>Tier
          <select data-edit="difficulty">
            ${[1, 2, 3, 4]
              .map(
                (d) => `
            <option value="${d}" ${d === set.difficulty ? 'selected' : ''}>
              ${escape(difficultyToTier(d))}${d === set.difficulty ? '' : ' (swaps)'}
            </option>`,
              )
              .join('')}
          </select>
        </label>
      </fieldset>`,
        )
        .join('')}
      <ul class="edit-errors" hidden></ul>
      <div class="decisions">
        <button class="pill primary" type="submit" data-act="save-edit">Save edit</button>
        <button class="pill" type="button" data-act="reset-edit">Reset to generated</button>
        <button class="pill" type="button" data-act="cancel-edit">Cancel</button>
      </div>
    </form>`;
}

/**
 * The form read back as a schema-shaped board. Pure given a DOM-ish root.
 *
 * Difficulty swaps resolve here: picking an occupied tier hands the mover's
 * old tier to the holder, fieldset order deciding when several moved — so the
 * collected board holds each tier exactly once by construction. The validator
 * backstops it anyway; the server never trusts this arithmetic.
 *
 * A glossary on the base never survives: edited boards do not store one
 * (stage 09's gloss is merged at play and publish, filtered by gloss.js).
 */
export function collectBoard(root, base) {
  const fieldsets = [...root.querySelectorAll('.edit-set')];
  const assigned = new Map(base.sets.map((set) => [set.id, set.difficulty]));
  const baseOf = new Map(base.sets.map((set) => [set.id, set.difficulty]));

  // A MOVER is a set whose select differs from its own base tier — the sets it
  // displaces keep their untouched selects, so comparing against the running
  // assignment would read the displaced holder as moving back and undo the
  // swap. Movers resolve in fieldset order, each taking its tier from
  // whichever set currently holds it.
  for (const fieldset of fieldsets) {
    const setId = fieldset.dataset.setId;
    const wanted = Number(fieldset.querySelector('select[data-edit=difficulty]').value);
    if (wanted === baseOf.get(setId)) continue;
    const current = assigned.get(setId);
    for (const [otherId, otherDifficulty] of assigned) {
      if (otherId !== setId && otherDifficulty === wanted) {
        assigned.set(otherId, current);
        break;
      }
    }
    assigned.set(setId, wanted);
  }

  const { glossary: _dropped, ...bare } = base;
  return {
    ...bare,
    title: root.querySelector('input[data-edit=title]').value,
    sets: base.sets.map((set) => {
      const fieldset = fieldsets.find((f) => f.dataset.setId === set.id);
      const words = [...fieldset.querySelectorAll('input[data-edit=word]')].map((i) => i.value);
      return {
        ...set,
        relationshipLabel: fieldset.querySelector('input[data-edit=relationshipLabel]').value,
        explanation: fieldset.querySelector('textarea[data-edit=explanation]').value,
        pairs: [
          [words[0], words[1]],
          [words[2], words[3]],
        ],
        difficulty: assigned.get(set.id),
      };
    }),
  };
}

const DEBOUNCE_MS = 300;

/**
 * Browser glue: live validation while typing, the engine sweep only on Save.
 *
 * `board` is the board being edited (the current effective board), `generated`
 * the pipeline's original for "Reset to generated". `onSave(board)` posts;
 * `onClose()` re-renders the run. This module never fetches.
 */
export function wireEditor(panel, { board, generated, onSave, onClose }) {
  panel.innerHTML = editorHtml(board);
  const form = panel.querySelector('.edit-board');
  const errorsEl = form.querySelector('.edit-errors');
  const saveEl = form.querySelector('[data-act=save-edit]');

  const showErrors = (errors) => {
    errorsEl.hidden = errors.length === 0;
    errorsEl.innerHTML = errors
      .map((e) => `<li><code>${escape(e.path)}</code> ${escape(e.message)}</li>`)
      .join('');
  };

  let pending;
  const validateSoon = () => {
    clearTimeout(pending);
    pending = setTimeout(() => {
      const { ok, errors } = validatePuzzle(collectBoard(form, board));
      saveEl.disabled = !ok;
      showErrors(errors);
    }, DEBOUNCE_MS);
  };
  form.addEventListener('input', validateSoon);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const edited = collectBoard(form, board);
    const validity = validatePuzzle(edited);
    if (!validity.ok) {
      saveEl.disabled = true;
      showErrors(validity.errors);
      return;
    }
    // The 43,680-tuple sweep: cheap enough for a click, wrong on every keystroke.
    const integrity = checkBoard(edited);
    if (!integrity.ok) {
      showErrors([
        { path: 'board', message: 'fails the integrity sweep — see duplicate or colliding words' },
        ...integrity.duplicateWords.map((word) => ({ path: 'words', message: `duplicated: ${word}` })),
      ]);
      return;
    }
    onSave(edited);
  });

  form.querySelector('[data-act=reset-edit]').addEventListener('click', () => {
    wireEditor(panel, { board: generated, generated, onSave, onClose });
    validateSoon();
  });
  form.querySelector('[data-act=cancel-edit]').addEventListener('click', onClose);
}
