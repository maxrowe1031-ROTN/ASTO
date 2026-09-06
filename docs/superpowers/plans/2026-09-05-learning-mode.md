# Learning Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Learning Mode setting (default off) under which the Vocab button arms the board and tapping any tile shows that word's definition, with every board carrying sixteen definitions.

**Architecture:** The mode is an engine rule (`learningMode`), arming is engine state (`vocabArmed`), and the controller only routes a tile tap to `defineWord` while armed. Definitions ship as a new optional puzzle field `definitions` beside the leak-checked one-word `glossary`, authored by a new low-effort pipeline stage and backfilled onto the catalog. Results, share text, the calendar record and the tutorial all read the same state.

**Tech Stack:** Vanilla ES modules, zero dependencies, `node:test`. Spec: `docs/superpowers/specs/2026-09-05-learning-mode-design.md`.

## Global Constraints

- **Zero dependencies.** No package may be added. Tests use `node --test` (`npm test`).
- **Boundary law.** `src/engine/**` and `src/source/validate-puzzle.js` import nothing outside themselves. Views never call engine mutators. Only `src/controller/game-controller.js` calls engine functions. In the Studio, `storage/run-store.js` and `storage/puzzle-store.js` are the only writers of their directories; `llm.js` owns the only `fetch`.
- **Schema v1.0 amendment is additive only:** the new field is `definitions: [{ word, definition }]`, optional. `glossary` is untouched.
- **Never sort a submission.** Nothing in this plan touches `submit`.
- **Copy rule (GDD §11.3):** short, friendly, no snark. Tutorial copy may never name a set, tier, relationship label, or board word.
- **Motion:** none added. The armed board is a stylesheet state.
- **No secrets** in code, fixtures, logs or output. `ANTHROPIC_API_KEY` is read by `studio/env.js` only.
- **Branch:** `work/learning-mode`. Commit after every task; conventional-commit subjects; each commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Baseline:** `npm test` is 1633/0 at the start. Every task ends green.

---

## File map

| File | Responsibility in this feature |
|---|---|
| `src/engine/engine.js` | `learningMode` rule, `vocabArmed` state, `revealVocab` toggle, `defineWord`, `withRules` |
| `src/controller/game-controller.js` | routes an armed tap to `defineWord`; `rulesChanged` |
| `src/source/validate-puzzle.js` | validates optional `definitions` |
| `src/storage.js` | `asto.learningMode` key |
| `src/view/vocab-view.js` | shows the latest revealed word; looks up glossary then definitions |
| `src/view/controls-view.js` | Vocab pill armed state |
| `src/view/board-view.js` | `defining` class while armed |
| `src/view/status-view.js` | copy for `vocab-armed`, clears on `vocab-disarmed` |
| `src/view/settings-view.js` | Help group with the Learning mode pill |
| `src/app.js` | merges the stored flag into every board's rules; wires the toggle |
| `src/controller/tutorial-script.js` | teaches Learning Mode |
| `src/results-recorder.js`, `src/share.js` | the light mark |
| `src/view/result-icons.js`, `src/view/calendar-view.js` | the book badge |
| `styles/components.css` | armed tiles, armed pill, badge, settings row |
| `studio/agents/definitions-author.js` | the new agent |
| `studio/stage-registry.js`, `studio/agents/index.js`, `studio/pipeline.js`, `studio/pipeline-config.js` | stage 10 registration |
| `studio/fixtures/responses/10-definitions-author.json` | mock reply for pipeline tests |
| `studio/gloss.js` | `mergeDefinitions` |
| `studio/review/api.js`, `studio/review/ui/review.js`, `studio/review/ui/edit.js` | merge at save/play/publish; fold on the card |
| `studio/definitions-backfill.js`, `tools/backfill-definitions.js` | catalog backfill |
| `test/content/definitions.test.js` | every published board carries sixteen |

---

### Task 1: Engine — the rule, the armed state, define, and live rule changes

**Files:**
- Modify: `src/engine/engine.js`
- Test: `test/engine/vocab.test.js`, `test/engine/game-flow.test.js`

**Interfaces:**
- Produces: `DEFAULT_RULES.learningMode === false`; state field `vocabArmed: boolean`; `revealVocab(state) → { state, outcome }` where outcome is `{ type: 'vocab' }` (one-word mode), `{ type: 'vocab-armed' }`, `{ type: 'vocab-disarmed' }`, or `null`; `defineWord(state, term) → { state, outcome: { type: 'vocab' } | null }`; `withRules(state, changes) → state`.

- [ ] **Step 1: Write the failing tests**

Append to `test/engine/vocab.test.js` (extend the import line to `import { defineWord, initGame, revealVocab, shuffle, submit, withRules } from '../../src/engine/engine.js';`):

```js
// ---------- Learning Mode (design.md D-33) ----------

const LEARNING = { learningMode: true };
const defined = () => ({
  ...glossed(),
  definitions: [
    { word: 'Seed', definition: 'the small hard part of a plant that a new plant grows from' },
    { word: 'Chisel', definition: 'a metal blade you hit with a mallet to carve wood or stone' }
  ]
});

test('with learning mode off, nothing new happens: no armed state, one reveal', () => {
  const start = initGame(defined());
  assert.equal(start.rules.learningMode, false);
  assert.equal(start.vocabArmed, false);
  const { state, outcome } = revealVocab(start);
  assert.equal(outcome.type, 'vocab');
  assert.deepEqual(state.vocabRevealed, ['Chisel']);
  assert.equal(state.vocabArmed, false);
});

test('with learning mode on, pressing Vocab arms the board instead of revealing', () => {
  const { state, outcome } = revealVocab(initGame(defined(), LEARNING));
  assert.deepEqual(outcome, { type: 'vocab-armed' });
  assert.equal(state.vocabArmed, true);
  assert.deepEqual(state.vocabRevealed, []);
});

test('pressing Vocab again while armed disarms', () => {
  const armed = revealVocab(initGame(defined(), LEARNING)).state;
  const { state, outcome } = revealVocab(armed);
  assert.deepEqual(outcome, { type: 'vocab-disarmed' });
  assert.equal(state.vocabArmed, false);
});

test('a tile tap while armed defines that word and disarms', () => {
  const armed = revealVocab(initGame(defined(), LEARNING)).state;
  const { state, outcome } = defineWord(armed, 'Seed');
  assert.deepEqual(outcome, { type: 'vocab' });
  assert.deepEqual(state.vocabRevealed, ['Seed']);
  assert.equal(state.vocabArmed, false);
  assert.deepEqual(state.selectedTerms, [], 'a define is not a select');
});

test('defineWord no-ops when not armed, off-board, or game over', () => {
  const idle = initGame(defined(), LEARNING);
  assert.equal(defineWord(idle, 'Seed').outcome, null);
  assert.equal(defineWord(idle, 'Seed').state, idle);

  const armed = revealVocab(idle).state;
  assert.equal(defineWord(armed, 'Cordwainer').outcome, null);
  assert.equal(defineWord(armed, 'Cordwainer').state, armed);
});

test('defining a word twice moves it to the end — the latest reveal wins', () => {
  let state = revealVocab(initGame(defined(), LEARNING)).state;
  state = defineWord(state, 'Seed').state;
  state = defineWord(revealVocab(state).state, 'Chisel').state;
  state = defineWord(revealVocab(state).state, 'Seed').state;
  assert.deepEqual(state.vocabRevealed, ['Chisel', 'Seed']);
});

test('a word with no definition can still be "defined" — the view says so, the engine records it', () => {
  const armed = revealVocab(initGame(defined(), LEARNING)).state;
  const { state, outcome } = defineWord(armed, 'Bear');
  assert.deepEqual(outcome, { type: 'vocab' });
  assert.deepEqual(state.vocabRevealed, ['Bear']);
});

test('withRules merges rules on the live state and disarms when learning mode turns off', () => {
  const armed = revealVocab(initGame(defined(), LEARNING)).state;
  const off = withRules(armed, { learningMode: false });
  assert.equal(off.rules.learningMode, false);
  assert.equal(off.rules.maxMistakes, armed.rules.maxMistakes, 'other rules survive');
  assert.equal(off.vocabArmed, false);
  assert.ok(Object.isFrozen(off));
  assert.ok(Object.isFrozen(off.rules));

  const on = withRules(initGame(defined()), { learningMode: true });
  assert.equal(on.rules.learningMode, true);
  assert.deepEqual(revealVocab(on).outcome, { type: 'vocab-armed' });
});

test('learning-mode functions return frozen states and never mutate their input', () => {
  const start = revealVocab(initGame(defined(), LEARNING)).state;
  const snapshot = JSON.parse(JSON.stringify(start));
  const { state } = defineWord(start, 'Seed');
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.vocabRevealed));
  assert.deepEqual(JSON.parse(JSON.stringify(start)), snapshot);
});
```

Append to `test/engine/game-flow.test.js` (extend its import to include `defineWord, revealVocab`):

```js
// The view-off proof for Learning Mode (D-33): arm, define, play on, win.
test('headless learning-mode playthrough: defining never selects, and the game still wins', () => {
  const puzzle = {
    ...board,
    definitions: board.sets.flatMap((set) => set.pairs.flat()).map((word) => ({
      word,
      definition: `what ${word.toLowerCase()} means`
    }))
  };
  let state = shuffle(initGame(puzzle, { learningMode: true }), mulberry32(7));

  state = revealVocab(state).state; // arm
  state = defineWord(state, 'Seed').state; // look one up
  assert.deepEqual(state.vocabRevealed, ['Seed']);
  assert.deepEqual(state.selectedTerms, []);

  for (const terms of [
    ['Seed', 'Tree', 'Spark', 'Fire'],
    ['Brush', 'Painter', 'Chisel', 'Sculptor'],
    ['Nest', 'Bird', 'Den', 'Bear'],
    ['Dough', 'Bread', 'Clay', 'Pottery']
  ]) {
    state = play(state, terms).state;
  }
  assert.equal(state.status, 'won');
  assert.equal(state.mistakes, 0);
  assert.equal(revealVocab(state).outcome, null, 'nothing arms after the game');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/engine/vocab.test.js test/engine/game-flow.test.js`
Expected: FAIL — `defineWord`/`withRules` are not exported; `vocabArmed` is undefined.

- [ ] **Step 3: Implement in `src/engine/engine.js`**

Update the header comment's state shape to include `vocabArmed`. Then:

```js
export const DEFAULT_RULES = Object.freeze({
  maxMistakes: MAX_MISTAKES,
  soCloseCostsMistake: true,
  clearSelectionOnFail: true,
  hintsAllowed: 1,
  // Learning Mode (design.md D-33): Vocab arms the board and a tile tap defines
  // that word. Off by default; the settings screen flips it per player.
  learningMode: false
});
```

In `initGame`, add `vocabArmed: false,` after `vocabRevealed: [],`.

Replace `revealVocab`:

```js
/**
 * The Vocab button. Two behaviours, one rule apart (design.md D-18 and D-33):
 *
 *   learningMode off — reveal the board's one authored gloss, once. Free and
 *   deterministic: the puzzle data names the word, so there is no RNG seam.
 *   learningMode on  — ARM the board: the next tile tap defines that word
 *                      (defineWord). Pressing again disarms. Nothing is revealed
 *                      here; the outcome only says which way the switch went.
 *
 * No-ops when the game is over.
 */
export function revealVocab(state) {
  if (state.status !== 'playing') return { state, outcome: null };

  if (state.rules.learningMode) {
    const vocabArmed = !state.vocabArmed;
    return {
      state: nextState(state, { vocabArmed }),
      outcome: { type: vocabArmed ? 'vocab-armed' : 'vocab-disarmed' }
    };
  }

  const entry = (state.puzzle.glossary ?? []).find(
    (candidate) =>
      state.boardTerms.includes(candidate.word) && !state.vocabRevealed.includes(candidate.word)
  );
  if (!entry) return { state, outcome: null };

  return {
    state: nextState(state, { vocabRevealed: [...state.vocabRevealed, entry.word] }),
    outcome: { type: 'vocab' }
  };
}

/**
 * Learning Mode's tile tap (design.md D-33). Only while armed, only for a word
 * on the board. Records the word LAST in `vocabRevealed` — the view shows the
 * latest — and disarms, so each press of Vocab buys one look-up. Whether a
 * definition exists is the view's problem: the engine records the ask, and a
 * tile without one is answered on screen, not refused here.
 */
export function defineWord(state, term) {
  if (state.status !== 'playing') return { state, outcome: null };
  if (!state.vocabArmed) return { state, outcome: null };
  if (!state.boardTerms.includes(term)) return { state, outcome: null };

  const vocabRevealed = [...state.vocabRevealed.filter((word) => word !== term), term];
  return {
    state: nextState(state, { vocabRevealed, vocabArmed: false }),
    outcome: { type: 'vocab' }
  };
}

/**
 * Change rules on a live game — how a settings toggle reaches the board the
 * player is already on. Rules merge; anything the old rules allowed that the
 * new ones forbid is cleaned up here (an armed board under a mode that no
 * longer exists). Pure and frozen like every other export.
 */
export function withRules(state, changes) {
  const rules = { ...state.rules, ...changes };
  return nextState(state, {
    rules,
    vocabArmed: rules.learningMode ? state.vocabArmed : false
  });
}
```

- [ ] **Step 4: Run the engine suite**

Run: `node --test test/engine/`
Expected: all PASS, including `immutability.test.js` (the new field is a boolean, frozen with the state).

- [ ] **Step 5: Commit**

```bash
git add src/engine/engine.js test/engine/vocab.test.js test/engine/game-flow.test.js
git commit -m "feat(engine): Learning Mode — Vocab arms the board, a tile tap defines the word

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Controller — route an armed tap, apply rule changes

**Files:**
- Modify: `src/controller/game-controller.js`
- Create: `test/controller/game-controller.test.js`

**Interfaces:**
- Consumes: `defineWord`, `withRules` from Task 1.
- Produces: `controller.rulesChanged(changes)`; `tileTapped(term)` defines while `state.vocabArmed`.

- [ ] **Step 1: Write the failing test**

Create `test/controller/game-controller.test.js`:

```js
// The controller, driven headlessly: fake views that record what they were
// handed. It owns no rules — every assertion here is about ROUTING.

import test from 'node:test';
import assert from 'node:assert/strict';

import { GameController } from '../../src/controller/game-controller.js';
import { board } from '../fixtures/board.js';

const puzzle = {
  ...board,
  definitions: [{ word: 'Seed', definition: 'a plant starts from one' }]
};

function recorder() {
  const paints = [];
  return { paints, update: (state, outcome) => paints.push({ state, outcome }) };
}

const settle = (controller) => controller.queue;

test('a tile tap selects when the board is not armed', async () => {
  const view = recorder();
  const controller = new GameController(puzzle, [view], { rules: { learningMode: true }, rand: () => 0 });
  controller.tileTapped('Seed');
  await settle(controller);
  assert.deepEqual(controller.state.selectedTerms, ['Seed']);
  assert.deepEqual(controller.state.vocabRevealed, []);
});

test('a tile tap while armed defines the word and selects nothing', async () => {
  const view = recorder();
  const controller = new GameController(puzzle, [view], { rules: { learningMode: true }, rand: () => 0 });
  controller.vocabPressed();
  controller.tileTapped('Seed');
  await settle(controller);
  assert.deepEqual(controller.state.selectedTerms, []);
  assert.deepEqual(controller.state.vocabRevealed, ['Seed']);
  assert.equal(controller.state.vocabArmed, false);
  assert.deepEqual(view.paints.at(-1).outcome, { type: 'vocab' });
});

test('rulesChanged reaches the live game and survives a restart', async () => {
  const view = recorder();
  const controller = new GameController(puzzle, [view], { rules: {}, rand: () => 0 });
  controller.rulesChanged({ learningMode: true });
  await settle(controller);
  assert.equal(controller.state.rules.learningMode, true);

  controller.restart();
  await settle(controller);
  assert.equal(controller.state.rules.learningMode, true, 'restart keeps the changed rule');
});

test('turning learning mode off while armed disarms the board', async () => {
  const view = recorder();
  const controller = new GameController(puzzle, [view], { rules: { learningMode: true }, rand: () => 0 });
  controller.vocabPressed();
  controller.rulesChanged({ learningMode: false });
  await settle(controller);
  assert.equal(controller.state.vocabArmed, false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/controller/game-controller.test.js`
Expected: FAIL — `rulesChanged is not a function`; the armed tap selects.

- [ ] **Step 3: Implement**

In `src/controller/game-controller.js`, extend the import with `defineWord` and `withRules` (alphabetical order in the list), then:

```js
  tileTapped(term) {
    // Learning Mode (D-33): an armed board turns the next tap into a look-up.
    // Routing only — the engine decides whether the tap counts.
    if (this.state.vocabArmed) {
      const { state, outcome } = defineWord(this.state, term);
      this.state = state;
      this.render(outcome);
      return;
    }
    // A tap on a selected tile means "take it back"; otherwise it's a select. The
    // engine ignores anything invalid (5th tap, off-board term, game over).
    this.state = this.state.selectedTerms.includes(term)
      ? deselect(this.state, term)
      : select(this.state, term);
    this.render();
  }

  /**
   * A setting changed under a live game. Kept in `this.rules` too, so a
   * restart() or the next loadPuzzle() merge starts from the changed rule
   * rather than the one the board was loaded with.
   */
  rulesChanged(changes) {
    this.rules = { ...this.rules, ...changes };
    this.state = withRules(this.state, changes);
    this.render();
  }
```

- [ ] **Step 4: Run the controller and engine suites**

Run: `node --test test/controller/ test/engine/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/controller/game-controller.js test/controller/game-controller.test.js
git commit -m "feat(controller): route an armed tile tap to defineWord; rulesChanged

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Validator — the optional `definitions` field

**Files:**
- Modify: `src/source/validate-puzzle.js`
- Test: `test/source/validate-puzzle.test.js`

**Interfaces:**
- Produces: `validatePuzzle` accepts `definitions: [{ word, definition }]`, partial lists allowed, each word a board word, no word twice; error paths `definitions`, `definitions[i]`, `definitions[i].word`, `definitions[i].definition`.

- [ ] **Step 1: Write the failing tests**

Append to `test/source/validate-puzzle.test.js`:

```js
// Learning Mode definitions (design.md D-33): optional, one entry per board
// word at most. PARTIAL lists are valid in the game — a hand-edit can drop a
// word's entry and the board must still load; the pipeline demands sixteen.
test('definitions is optional, and an empty list is allowed', () => {
  assert.equal(broken((p) => { delete p.definitions; }).ok, true);
  assert.equal(broken((p) => { p.definitions = []; }).ok, true);
});

test('a partial definitions list passes', () => {
  const result = broken((p) => {
    p.definitions = [
      { word: 'Seed', definition: 'a plant starts from one' },
      { word: 'Chisel', definition: 'a carving blade' }
    ];
  });
  assert.equal(result.ok, true, messages(result));
});

test('a definitions word must be one of the sixteen board words', () => {
  failsAt(
    broken((p) => { p.definitions = [{ word: 'Cordwainer', definition: 'a shoemaker' }]; }),
    'definitions[0].word'
  );
});

test('a word may not be defined twice, whatever its case', () => {
  failsAt(
    broken((p) => {
      p.definitions = [
        { word: 'Seed', definition: 'one' },
        { word: 'seed', definition: 'two' }
      ];
    }),
    'definitions[1].word'
  );
});

test('a definition must be a non-empty string', () => {
  failsAt(broken((p) => { p.definitions = [{ word: 'Seed', definition: '  ' }]; }), 'definitions[0].definition');
  failsAt(broken((p) => { p.definitions = [{ word: 'Seed' }]; }), 'definitions[0].definition');
});

test('definitions must be an array of objects when present', () => {
  failsAt(broken((p) => { p.definitions = 'Seed: a thing'; }), 'definitions');
  failsAt(broken((p) => { p.definitions = ['Seed']; }), 'definitions[0]');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/source/validate-puzzle.test.js`
Expected: the three `failsAt` tests FAIL (a bad `definitions` currently passes).

- [ ] **Step 3: Implement**

In `src/source/validate-puzzle.js`, directly after the glossary block and before `return { ok: ... }`:

```js
  // Optional definitions (D-33, Learning Mode): a plain definition for any board
  // word, revealed by tapping the tile. Partial lists are VALID here — the game
  // must load a board whose hand-edit removed a word's entry — and the pipeline
  // is where "all sixteen" is enforced. No word twice, so a tap has one answer.
  if ('definitions' in puzzle) {
    if (!Array.isArray(puzzle.definitions)) {
      fail('definitions', 'Optional, but when present must be an array of { word, definition }.');
    } else {
      const onBoard = new Set(words.map((word) => word.toLowerCase()));
      const defined = new Set();
      puzzle.definitions.forEach((entry, i) => {
        if (!isObject(entry)) {
          fail(`definitions[${i}]`, 'Each definitions entry must be an object { word, definition }.');
          return;
        }
        if (!isText(entry.word)) {
          fail(`definitions[${i}].word`, 'Required: a non-empty string naming a board word.');
        } else {
          const key = entry.word.toLowerCase();
          if (words.length === 16 && !onBoard.has(key)) {
            fail(`definitions[${i}].word`, `"${entry.word}" is not one of the sixteen board words.`);
          }
          if (defined.has(key)) {
            fail(`definitions[${i}].word`, `"${entry.word}" is defined twice.`);
          }
          defined.add(key);
        }
        if (!isText(entry.definition)) {
          fail(`definitions[${i}].definition`, 'Required: a non-empty definition.');
        }
      });
    }
  }
```

- [ ] **Step 4: Run the source and content suites**

Run: `node --test test/source/ test/content/`
Expected: PASS (no board carries `definitions` yet; nothing changes for them).

- [ ] **Step 5: Commit**

```bash
git add src/source/validate-puzzle.js test/source/validate-puzzle.test.js
git commit -m "feat(schema): optional definitions field, validated (D-33)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Storage — the Learning Mode preference

**Files:**
- Modify: `src/storage.js`
- Test: `test/storage.test.js`

**Interfaces:**
- Produces: `LEARNING_MODE_KEY = 'asto.learningMode'`; `storage.isLearningMode() → boolean` (false whenever unknowable); `storage.setLearningMode(bool)`.

- [ ] **Step 1: Write the failing tests**

Append to `test/storage.test.js` (extend the import to include `LEARNING_MODE_KEY`):

```js
// --- Learning Mode (D-33) ---

test('a fresh player has learning mode off', () => {
  assert.equal(new Storage({ store: fakeStore() }).isLearningMode(), false);
});

test('learning mode round-trips and survives a reload', () => {
  const store = fakeStore();
  new Storage({ store }).setLearningMode(true);
  assert.equal(new Storage({ store }).isLearningMode(), true);
  assert.equal(store.data.get(LEARNING_MODE_KEY), 'true');
  new Storage({ store }).setLearningMode(false);
  assert.equal(new Storage({ store }).isLearningMode(), false);
});

test('garbage in the learning key reads as off', () => {
  const storage = new Storage({ store: fakeStore({ [LEARNING_MODE_KEY]: 'maybe' }) });
  assert.equal(storage.isLearningMode(), false);
});

test('a hostile store leaves learning mode off and never throws', () => {
  const storage = new Storage({ store: hostileStore() });
  assert.equal(storage.isLearningMode(), false);
  assert.doesNotThrow(() => storage.setLearningMode(true));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/storage.test.js`
Expected: FAIL — `isLearningMode is not a function`.

- [ ] **Step 3: Implement**

In `src/storage.js`, add the key beside the others:

```js
export const LEARNING_MODE_KEY = 'asto.learningMode';
```

and after `setVolume`:

```js
  // --- Learning Mode (D-33) ---
  //
  // Same doctrine as the sound keys: when the store cannot be read, the answer
  // is the shipping default — off. A lost preference must never switch a
  // player into an easier game they did not ask for.

  /** False whenever we cannot know. */
  isLearningMode() {
    return this.read(LEARNING_MODE_KEY) === 'true';
  }

  setLearningMode(on) {
    this.write(LEARNING_MODE_KEY, String(Boolean(on)));
  }
```

Leave `clear()` alone: it forgets play state (tutorial flag, results, rated boards, history) and deliberately keeps preferences — the sound keys are not cleared there, and Learning Mode is a preference of the same kind.

- [ ] **Step 4: Run**

Run: `node --test test/storage.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage.js test/storage.test.js
git commit -m "feat(storage): asto.learningMode preference

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Views, settings and wiring

No unit tests for DOM views (the house rule at zero deps); this task is verified in the browser in Task 12. Keep every view read-only.

**Files:**
- Modify: `src/view/vocab-view.js`, `src/view/controls-view.js`, `src/view/board-view.js`, `src/view/status-view.js`, `src/view/settings-view.js`, `src/app.js`, `styles/components.css`

**Interfaces:**
- Consumes: `state.vocabArmed`, `state.rules.learningMode`, `puzzle.definitions`, `storage.isLearningMode()`, `controller.rulesChanged`.
- Produces: `settingsView.render({ muted, volume, learningMode })`; a `SettingsView` constructor option `onLearning`.

- [ ] **Step 1: `src/view/vocab-view.js` — show the latest revealed word, look up both lists**

Replace `update`:

```js
  update(state) {
    // The LATEST revealed word still on the board. In one-word mode that is the
    // gloss; in Learning Mode it is whichever tile was tapped last (D-33).
    const word = [...state.vocabRevealed].reverse().find((term) => state.boardTerms.includes(term));

    if (!word) {
      this.root.hidden = true;
      this.root.textContent = '';
      return;
    }

    // The leak-checked gloss outranks the Learning Mode definition for the same
    // word — it is the better-edited sentence.
    const entry =
      (state.puzzle.glossary ?? []).find((candidate) => candidate.word === word) ??
      (state.puzzle.definitions ?? []).find((candidate) => candidate.word === word);

    this.root.hidden = false;
    this.root.innerHTML = '';
    const strong = document.createElement('strong');
    strong.textContent = word;
    this.root.append(strong, ` — ${entry ? entry.definition : 'No definition for this one.'}`);
  }
```

- [ ] **Step 2: `src/view/controls-view.js` — the armed pill**

Replace the vocab section of `update`:

```js
    // Data-driven, not a rule: the pill exists only on a board that ships something
    // to reveal — a gloss (D-18) or Learning Mode definitions (D-33).
    const glossary = state.puzzle.glossary ?? [];
    const definitions = state.puzzle.definitions ?? [];
    this.vocabEl.hidden = glossary.length === 0 && definitions.length === 0;

    if (state.rules.learningMode) {
      // Learning Mode: the pill is a switch that arms the board, never spent.
      this.vocabEl.disabled = !playing;
      this.vocabEl.classList.toggle('armed', state.vocabArmed);
      this.vocabEl.setAttribute('aria-pressed', String(state.vocabArmed));
    } else {
      const revealable = glossary.some(
        (entry) =>
          state.boardTerms.includes(entry.word) && !state.vocabRevealed.includes(entry.word)
      );
      this.vocabEl.disabled = !playing || !revealable;
      this.vocabEl.classList.remove('armed');
      this.vocabEl.removeAttribute('aria-pressed');
    }
```

- [ ] **Step 3: `src/view/board-view.js` — the armed board**

In `update`, after `const over = state.status !== 'playing';` add:

```js
    // Learning Mode's armed state is a stylesheet state on the board, so every
    // tile shows it at once and no bookkeeping lives here (D-33).
    this.root.classList.toggle('defining', Boolean(state.vocabArmed) && !over);
```

- [ ] **Step 4: `src/view/status-view.js` — say what an armed board wants**

Add to `FEEDBACK`:

```js
  'vocab-armed': { text: 'Tap a tile to see what it means.', strong: false }
```

and in `update`, before the `else if (outcome && FEEDBACK[outcome.type])` branch:

```js
    } else if (outcome?.type === 'vocab-disarmed') {
      this.clear();
```

- [ ] **Step 5: `src/view/settings-view.js` — the Help group**

Add `onLearning` to the constructor options and this group after the Sound section, before the Back button:

```html
      <section class="settings-group" aria-labelledby="settings-help-heading">
        <h3 id="settings-help-heading" class="settings-group-title">Help</h3>
        <div class="settings-row">
          <span class="settings-label" id="settings-learning-label">Learning mode</span>
          <button class="pill settings-learning" data-action="learning"
                  aria-labelledby="settings-learning-label" aria-pressed="false"></button>
        </div>
        <p class="settings-note">Vocab defines any tile you tap.</p>
      </section>
```

Wire it:

```js
    this.learningButton = root.querySelector('[data-action="learning"]');
    this.learningButton.addEventListener('click', onLearning);
```

and extend `render`:

```js
  render({ muted, volume, learningMode }) {
    this.muteButton.textContent = muted ? 'Unmute' : 'Mute';
    this.muteButton.setAttribute('aria-pressed', String(muted));
    this.volumeSlider.value = String(volume);
    this.volumeSlider.disabled = muted;
    this.volumeValue.textContent = String(volume);
    // Says what pressing DOES, like Mute; aria-pressed carries the state.
    this.learningButton.textContent = learningMode ? 'Turn off' : 'Turn on';
    this.learningButton.setAttribute('aria-pressed', String(learningMode));
  }
```

Update the file's header comment: two sections now, Sound and Help (D-33).

- [ ] **Step 6: `src/app.js` — merge the flag into every game's rules, wire the toggle**

Add near `startGame`:

```js
  /**
   * Learning Mode (D-33) is a per-player setting, so it rides every board's
   * rules — the tutorial's included: the tutorial is a configuration of the
   * game, not a fork of it.
   */
  const withLearning = (rules) => ({ ...rules, learningMode: storage.isLearningMode() });
```

In `startGame`, change the two controller calls to `controller.loadPuzzle(puzzle, withLearning(rules))` and `new GameController(puzzle, views, { rules: withLearning(rules) })`.

Change `paintSettings`:

```js
  const paintSettings = () =>
    settingsView.render({
      muted: sound.isMuted(),
      volume: sound.getVolume(),
      learningMode: storage.isLearningMode()
    });
```

Add to the `SettingsView` options:

```js
    onLearning: () => {
      storage.setLearningMode(!storage.isLearningMode());
      // Reaches the board the player is already on; a setting that only applies
      // to the NEXT board reads as broken.
      controller?.rulesChanged({ learningMode: storage.isLearningMode() });
      paintSettings();
    }
```

- [ ] **Step 7: `styles/components.css`**

After `.tile.selected { ... }`:

```css
/* Learning Mode (D-33): an armed board asks for a tile, and every tile says so at
   once — a soft dashed ring in ink, no motion. Selection still outranks it. */
.board.defining .tile:not(.selected) {
  outline: 2px dashed var(--taupe);
  outline-offset: -3px;
}

.pill.armed {
  background: var(--oat);
  border-color: var(--ink);
}
```

After `.settings-mute { ... }`:

```css
.settings-learning {
  min-width: 96px;
}

.settings-note {
  margin: 4px 0 0;
  color: var(--soft-ink);
  font-size: 13px;
}
```

- [ ] **Step 8: Run the full suite and a smoke load**

Run: `npm test`
Expected: PASS (views are untested; this catches import breakage in app-adjacent modules).

Run: `node -e "import('./src/view/vocab-view.js').then(() => console.log('ok'))"` — Expected: `ok` (the module imports nothing DOM-only at load).

- [ ] **Step 9: Commit**

```bash
git add src/view/vocab-view.js src/view/controls-view.js src/view/board-view.js src/view/status-view.js src/view/settings-view.js src/app.js styles/components.css
git commit -m "feat(view): Learning Mode toggle in Settings; armed board, pill and footnote

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Tutorial copy

**Files:**
- Modify: `src/controller/tutorial-script.js`
- Test: `test/controller/tutorial-script.test.js`

**Interfaces:**
- Consumes: outcomes `vocab-armed`, `vocab` and `state.rules.learningMode` from Task 1.
- Produces: steps with ids `vocab`, `vocab-learning`, `vocab-armed`; the `done` step carries `note` on the first solve.

- [ ] **Step 1: Write the failing tests**

Append to `test/controller/tutorial-script.test.js`:

```js
// ---------- Learning Mode is taught (D-33) ----------

const glossedBoard = { ...board, glossary: [{ word: 'Chisel', definition: 'a carving blade' }] };

test('the vocab step tells the player where Learning Mode lives when it is off', () => {
  const step = tutorialStep(initGame(glossedBoard, TUTORIAL_RULES), { type: 'vocab' });
  assert.equal(step.id, 'vocab');
  assert.match(step.body, /Learning Mode/);
  assert.match(step.body, /Settings/);
});

test('with Learning Mode on, a define is narrated as a look-up you can repeat', () => {
  const on = initGame(glossedBoard, { ...TUTORIAL_RULES, learningMode: true });
  const step = tutorialStep(on, { type: 'vocab' });
  assert.equal(step.id, 'vocab-learning');
  assert.doesNotMatch(step.body, /Settings/);
  assert.match(step.body, /another tile/i);
});

test('arming the board is narrated', () => {
  const on = initGame(glossedBoard, { ...TUTORIAL_RULES, learningMode: true });
  const step = tutorialStep(on, { type: 'vocab-armed' });
  assert.equal(step.id, 'vocab-armed');
  assert.match(step.body, /tap any tile/i);
});

test('the first solve carries a note about Learning Mode; later solves do not repeat it', () => {
  const first = attempt(['Seed', 'Tree', 'Spark', 'Fire']);
  assert.equal(first.step.id, 'done');
  assert.match(first.step.note, /Learning Mode/);

  const order = ['Brush', 'Painter', 'Chisel', 'Sculptor'];
  const second = submit(pick(first.state, ...order), order);
  const step = tutorialStep(second.state, second.outcome);
  assert.equal(step.id, 'done');
  assert.equal(step.note, undefined);
});

test('the Learning Mode copy leaks nothing', () => {
  const on = initGame(glossedBoard, { ...TUTORIAL_RULES, learningMode: true });
  const texts = [
    tutorialStep(initGame(glossedBoard, TUTORIAL_RULES), { type: 'vocab' }).body,
    tutorialStep(on, { type: 'vocab' }).body,
    tutorialStep(on, { type: 'vocab-armed' }).body,
    attempt(['Seed', 'Tree', 'Spark', 'Fire']).step.note
  ];
  for (const text of texts) {
    for (const leak of FORBIDDEN) assert.ok(!names(text, leak), `leaked "${leak}": ${text}`);
  }
});
```

(`attempt`, `pick`, `names`, `FORBIDDEN` already exist in this file.)

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/controller/tutorial-script.test.js`
Expected: FAIL on the Learning Mode assertions.

- [ ] **Step 3: Implement**

In `src/controller/tutorial-script.js`, replace the `vocab` step and add two more inside `STEPS`:

```js
  vocab: {
    id: 'vocab',
    body: "That's the trickiest word on the board, defined. It stays on screen, so read it whenever you like. Want every word defined? Turn on Learning Mode in Settings — the gear on the calendar."
  },
  // Learning Mode (D-33), narrated when it is already on.
  'vocab-armed': {
    id: 'vocab-armed',
    body: 'Learning Mode is on — tap any tile to see what it means.'
  },
  'vocab-learning': {
    id: 'vocab-learning',
    body: "That's what that word means. Press Vocab and tap another tile whenever you like."
  }
```

Add a constant beside `REASSURANCE`:

```js
// Said once, on the first solve, so a player who never presses Vocab still hears it.
const LEARNING_NOTE = 'Need more word help? Learning Mode in Settings lets Vocab define any tile you tap.';
```

In `coaching`, replace the first three outcome lines:

```js
  if (outcome?.type === 'solved') {
    return state.solvedSetIds.length === 1 ? { ...STEPS.done, note: LEARNING_NOTE } : STEPS.done;
  }

  // The help pills, narrated at the moment of use. Neither competes with the branches
  // below: a hint or vocab press is never also a submission or a tile pick.
  if (outcome?.type === 'hint') return STEPS.hint;
  if (outcome?.type === 'vocab-armed') return STEPS['vocab-armed'];
  if (outcome?.type === 'vocab') {
    return state.rules.learningMode ? STEPS['vocab-learning'] : STEPS.vocab;
  }
```

(`vocab-disarmed` deliberately falls through to the board-state coaching.)

- [ ] **Step 4: Run the controller suite**

Run: `node --test test/controller/`
Expected: PASS. If an existing test asserted the `done` step has no note on the first solve, update it: the first solve now carries `LEARNING_NOTE`.

- [ ] **Step 5: Commit**

```bash
git add src/controller/tutorial-script.js test/controller/tutorial-script.test.js
git commit -m "feat(tutorial): teach Learning Mode — what it does and where to turn it on

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The light mark — results and share

**Files:**
- Modify: `src/results-recorder.js`, `src/share.js`
- Test: `test/results-recorder.test.js`, `test/share.test.js`

**Interfaces:**
- Produces: result/history rows carry `learning: true` only when help was used; `buildShareText` appends ` · 📖` under the same condition.

- [ ] **Step 1: Write the failing tests**

Append to `test/results-recorder.test.js`:

```js
// --- Learning Mode (D-33): marked lightly, and only when help was actually used ---

test('a learning-mode game that looked a word up records learning: true', () => {
  const storage = fakeStorage();
  const recorder = new ResultsRecorder(storage, on('first-light'), TODAY);
  recorder.update(state('won', {
    solvedSetIds: ['a', 'b', 'c', 'd'],
    rules: { learningMode: true },
    vocabRevealed: ['Seed']
  }));
  assert.equal(storage.calls[0].result.learning, true);
  assert.equal(storage.history[0].learning, true);
});

test('learning mode on but never used records no mark at all', () => {
  const storage = fakeStorage();
  const recorder = new ResultsRecorder(storage, on('first-light'), TODAY);
  recorder.update(state('won', {
    solvedSetIds: ['a', 'b', 'c', 'd'],
    rules: { learningMode: true },
    vocabRevealed: []
  }));
  assert.equal('learning' in storage.calls[0].result, false);
});

test('the one-word gloss in normal mode is not a mark (D-18 kept its deferral)', () => {
  const storage = fakeStorage();
  const recorder = new ResultsRecorder(storage, on('first-light'), TODAY);
  recorder.update(state('won', {
    solvedSetIds: ['a', 'b', 'c', 'd'],
    rules: { learningMode: false },
    vocabRevealed: ['Chisel']
  }));
  assert.equal('learning' in storage.calls[0].result, false);
});
```

Append to `test/share.test.js` (extend the engine import with `defineWord, revealVocab`):

```js
test('a learning-mode win that used a definition carries the book marker', () => {
  const puzzle = { ...board, definitions: [{ word: 'Seed', definition: 'd' }] };
  let state = initGame(puzzle, { learningMode: true });
  state = defineWord(revealVocab(state).state, 'Seed').state;
  for (const id of ['set-growth', 'set-tools', 'set-homes', 'set-material']) state = solve(state, bySetId(id));
  assert.equal(buildShareText(state), 'ASTO — Test Board\n4/4 · no beans · 📖\n🟩🟨🟥⬛');
});

test('learning mode on but unused shares exactly as a normal game', () => {
  let state = initGame(board, { learningMode: true });
  for (const id of ['set-growth', 'set-tools', 'set-homes', 'set-material']) state = solve(state, bySetId(id));
  assert.equal(buildShareText(state), 'ASTO — Test Board\n4/4 · no beans\n🟩🟨🟥⬛');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/results-recorder.test.js test/share.test.js`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement**

`src/results-recorder.js`, inside `update` where `result` is built:

```js
    // Learning Mode (D-33): marked only when help was actually USED — the mode
    // being on says nothing about how the board was played. Omitted rather
    // than false, so older blobs and this one have the same shape.
    const learning = Boolean(state.rules?.learningMode) && (state.vocabRevealed?.length ?? 0) > 0;
    const result = {
      status: state.status,
      mistakes: state.mistakes,
      solvedCount: state.solvedSetIds.length,
      // ?? 0: a state from before hints existed still records a truthful zero.
      hintsUsed: state.hintsUsed ?? 0,
      ...(learning ? { learning: true } : {})
    };
```

`src/share.js`, in `buildShareText`:

```js
  const usedDefinitions = Boolean(state.rules?.learningMode) && state.vocabRevealed.length > 0;
  const lines = [
    `ASTO — ${state.puzzle.title}`,
    `${solved.length}/${state.puzzle.sets.length} · ${beans(state.mistakes)}${usedDefinitions ? ' · 📖' : ''}`
  ];
```

Update the file's doc comment example: a learning-mode line reads `4/4 · 2 beans · 📖`.

- [ ] **Step 4: Run**

Run: `node --test test/results-recorder.test.js test/share.test.js test/stats.test.js`
Expected: PASS (stats ignores the new field).

- [ ] **Step 5: Commit**

```bash
git add src/results-recorder.js src/share.js test/results-recorder.test.js test/share.test.js
git commit -m "feat: mark a learning-mode game lightly in results and share text

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The book badge on the player's record

**Files:**
- Modify: `src/view/result-icons.js`, `src/view/calendar-view.js`, `styles/components.css`
- Create: `test/result-icons.test.js`

**Interfaces:**
- Produces: `BOOK` (SVG string with class `result-badge`); `badgeFor(result) → string` (empty unless `result.learning`).

- [ ] **Step 1: Write the failing test**

Create `test/result-icons.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { BOOK, badgeFor, iconFor, CUP_STEAMING } from '../src/view/result-icons.js';

// The third mark on a cup (D-33): pose says how it ended, colour says whether
// the hint was taken, the book says definitions were looked up.
test('badgeFor returns the book only for a learning result', () => {
  assert.equal(badgeFor(null), '');
  assert.equal(badgeFor({ status: 'won', hintsUsed: 0 }), '');
  assert.equal(badgeFor({ status: 'won', hintsUsed: 1 }), '');
  assert.equal(badgeFor({ status: 'lost', learning: true }), BOOK);
});

test('the book is a hidden-from-AT svg wearing the badge class, and leaves the cup alone', () => {
  assert.match(BOOK, /class="result-badge"/);
  assert.match(BOOK, /aria-hidden="true"/);
  assert.equal(iconFor({ status: 'won', learning: true }), CUP_STEAMING);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/result-icons.test.js`
Expected: FAIL — `badgeFor` not exported.

- [ ] **Step 3: Implement `src/view/result-icons.js`**

Append:

```js
// The third mark (D-33). A small closed BOOK beside the cup says Learning Mode
// definitions were looked up on this board. Static, ink-drawn, and a badge
// rather than a pose: how the board ended and whether the hint was taken are
// still the cup's to say. Corner-sized in the calendar grid, beside the cup on
// the day card — components.css sizes it per host.
export const BOOK = `
  <svg class="result-badge" viewBox="0 0 24 24" aria-hidden="true">
    <path class="book-cover" d="M5 4.5 H17.5 A1.5 1.5 0 0 1 19 6 V18.5 A1.5 1.5 0 0 1 17.5 20 H5 Z"/>
    <path class="book-spine" d="M5 4.5 H7.6 V20 H5 Z"/>
    <path class="book-lines" d="M10 8.5 H16 M10 11.5 H16 M10 14.5 H14"/>
  </svg>`;

/** The badge for a day's result: the book when definitions were used, else nothing. */
export const badgeFor = (result) => (result?.learning ? BOOK : '');
```

- [ ] **Step 4: `src/view/calendar-view.js`**

Extend the import: `import { badgeFor, iconFor } from './result-icons.js';`

In `paintDay`, after `icon.innerHTML = iconFor(day.result);`:

```js
    if (day.result?.learning) {
      icon.classList.add('is-learning');
      icon.insertAdjacentHTML('beforeend', badgeFor(day.result));
    }
```

In `paintCard`, change the icon span:

```js
      <span class="day-card-icon${hinted ? ' is-hinted' : ''}${day.result?.learning ? ' is-learning' : ''}" aria-hidden="true">${iconFor(day.result)}${badgeFor(day.result)}</span>`;
```

In `spokenResult`, add after the `hinted` line:

```js
  const learning = result.learning ? ' Definitions were used.' : '';
```

and append `${learning}` to both returned strings (`...${hinted}${learning}`).

- [ ] **Step 5: `styles/components.css`**

Change `.result-cup-slot` to include `position: relative;`, and `.day-card-icon` to include `position: relative;`. Then add after `.is-hinted .cup-spill { ... }`:

```css
/* The book badge (D-33): a corner mark on the grid cell, a companion on the card. */
.result-badge {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 11px;
  height: 11px;
}

.day-card-icon .result-badge {
  right: 2px;
  bottom: 2px;
  width: 24px;
  height: 24px;
}

.book-cover {
  fill: var(--milk);
  stroke: var(--ink);
  stroke-width: 1.2;
}

.book-spine {
  fill: var(--ink);
}

.book-lines {
  fill: none;
  stroke: var(--ink);
  stroke-width: 1.2;
  stroke-linecap: round;
}
```

- [ ] **Step 6: Run**

Run: `node --test test/result-icons.test.js test/calendar-month.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/view/result-icons.js src/view/calendar-view.js styles/components.css test/result-icons.test.js
git commit -m "feat(calendar): a book badge beside the cup when definitions were used

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: The Definitions Author agent and stage 10

**Files:**
- Create: `studio/agents/definitions-author.js`, `studio/fixtures/responses/10-definitions-author.json`, `test/studio/agents/definitions-author.test.js`
- Modify: `studio/agents/index.js`, `studio/stage-registry.js`, `studio/pipeline.js` (`STAGE_INPUTS`), `studio/pipeline-config.js`, `studio/README.md`
- Modify tests: `test/studio/stage-registry.test.js`, `test/studio/agents/contract.test.js`, `test/studio/pipeline/pipeline-config.test.js`, `test/studio/pipeline/resume.test.js`, `test/studio/pipeline/revision.test.js`

**Interfaces:**
- Produces: agent id `definitions-author`, stage id `10-definitions-author`; output `{ definitions: [{ word, definition }] }` with exactly sixteen entries; input `{ board }`.

- [ ] **Step 1: Write the failing agent test**

Create `test/studio/agents/definitions-author.test.js`:

```js
// The Definitions Author (design.md D-33) — one plain definition per board
// word, for Learning Mode. The leak rule is RELAXED here by Max's decision:
// a definition may say what a thing does. What the validator still enforces is
// completeness — every word once, nothing extra, nothing empty.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as author from '../../../studio/agents/definitions-author.js';

const BOARD = {
  id: 'asto-test',
  title: 'Sewing Room',
  sets: [
    { id: 'set-a', relationshipLabel: 'a', explanation: 'e', difficulty: 1,
      pairs: [['jar', 'button'], ['spool', 'thread']] },
    { id: 'set-b', relationshipLabel: 'b', explanation: 'e', difficulty: 2,
      pairs: [['thimble', 'needle'], ['buttonhook', 'boot']] },
    { id: 'set-c', relationshipLabel: 'c', explanation: 'e', difficulty: 3,
      pairs: [['loose', 'missing'], ['new', 'outgrown']] },
    { id: 'set-d', relationshipLabel: 'd', explanation: 'e', difficulty: 4,
      pairs: [['snap', 'buttonhole'], ['zipper', 'shank']] },
  ],
};
const WORDS = BOARD.sets.flatMap((set) => set.pairs.flat());
const full = () => ({ definitions: WORDS.map((word) => ({ word, definition: `plainly, a ${word}` })) });
const validate = (output) => author.validateOutput(output, { input: { board: BOARD } });

test('the prompt asks for all sixteen, plainly, and steers off naming the pairing', () => {
  const prompt = author.buildPrompt({ board: BOARD }, {});
  assert.match(prompt, /sixteen|16/);
  assert.match(prompt, /may say what it does|what it is for|does/i);
  assert.match(prompt, /do not .*(pair|go together|belongs with)/i);
  assert.match(prompt, /buttonhook/);
});

test('sixteen well-formed entries validate', () => {
  const result = validate(full());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('a definition may mention another board word — the leak rule is relaxed here', () => {
  const output = full();
  output.definitions[0].definition = 'a small disc sewn on with thread';
  assert.equal(validate(output).ok, true);
});

test('a missing word is refused, and named', () => {
  const output = full();
  output.definitions.pop();
  const result = validate(output);
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /shank/);
});

test('an extra word is refused', () => {
  const output = full();
  output.definitions.push({ word: 'cordwainer', definition: 'a shoemaker' });
  const result = validate(output);
  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.errors), /cordwainer/);
});

test('a word defined twice is refused', () => {
  const output = full();
  output.definitions[1] = { ...output.definitions[0] };
  assert.equal(validate(output).ok, false);
});

test('matching is case-insensitive, like the game validator', () => {
  const output = full();
  output.definitions[0].word = output.definitions[0].word.toUpperCase();
  assert.equal(validate(output).ok, true);
});

test('an over-long definition is refused by the schema', () => {
  const output = full();
  output.definitions[0].definition = 'x'.repeat(161);
  assert.equal(validate(output).ok, false);
});

test('without input it validates shape only', () => {
  assert.equal(author.validateOutput({ definitions: [] }).ok, true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/studio/agents/definitions-author.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `studio/agents/definitions-author.js`**

```js
// Definitions Author (design.md D-33) — one plain definition for EVERY board
// word, for Learning Mode: press Vocab, tap a tile, read what it means.
//
// This is the glossary author's sibling with the leak rule deliberately
// relaxed (Max, 2026-09-05): Learning Mode is an easy mode by intent, so a
// definition may say what a thing does. The one-word gloss stage 09 writes
// keeps D-18's full leak check and is what the default game reveals. What is
// enforced here mechanically is completeness — every word once, nothing extra,
// nothing empty — and a soft steer in the prompt not to spell out pairings.

import { JSON_ONLY, asJsonBlock, composePrompt, parseJson, validateAgainst } from './agent-kit.js';

export const id = 'definitions-author';
export const stageId = '10-definitions-author';

const MAX_DEFINITION_LENGTH = 160;

const SCHEMA = {
  type: 'object',
  required: ['definitions'],
  properties: {
    definitions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['word', 'definition'],
        properties: {
          word: { type: 'string', minLength: 1 },
          definition: { type: 'string', minLength: 1, maxLength: MAX_DEFINITION_LENGTH },
        },
      },
    },
  },
};

export function getOutputSchema() {
  return SCHEMA;
}

const wordsOf = (board) => (board?.sets ?? []).flatMap((set) => (set.pairs ?? []).flat());

export function buildPrompt(input = {}, context) {
  const { board = null } = input;
  const words = wordsOf(board);

  return composePrompt({
    role:
      'You are the Definitions Author for ASTO, a cozy word-analogy puzzle. In Learning Mode a ' +
      'player can tap any tile to read what the word means. You write those definitions — one for ' +
      'each of the sixteen words on the board.',
    context,
    task: [
      'Write exactly sixteen definitions, one per board word, every word once and no others.',
      'Each definition says what the thing IS, as a friend would put it. It may say what it does or what it is for — plain and useful beats careful here.',
      'Do not spell out the puzzle: never say which board words pair up, go together, or belong with each other, and never quote a relationship label. Define the word, not the analogy.',
      `Keep each under ${MAX_DEFINITION_LENGTH} characters. Warm, plain, no dictionary-ese.`,
      'Match each word exactly as it appears on the board.',
    ].join('\n'),
    data: [asJsonBlock('The board', board), `The sixteen words to define:\n${words.map((w) => `  - ${w}`).join('\n')}`].join('\n\n'),
    outputRules: [
      'Return { "definitions": [ { "word", "definition" } ] } with EXACTLY sixteen entries.',
      JSON_ONLY,
    ].join(' '),
  });
}

export function parse(text) {
  return parseJson(text);
}

/**
 * Every board word exactly once, nothing else. Called without input it checks
 * shape only, like every agent in the registry.
 */
const everyWordOnce = (output, board) => {
  if (!board) return [];
  const expected = new Map(wordsOf(board).map((word) => [word.toLowerCase(), word]));
  const seen = new Set();
  const errors = [];
  for (const entry of output.definitions) {
    const key = entry.word?.toLowerCase();
    if (!expected.has(key)) {
      errors.push({ path: 'definitions', message: `"${entry.word}" is not one of the sixteen board words` });
      continue;
    }
    if (seen.has(key)) {
      errors.push({ path: 'definitions', message: `"${entry.word}" is defined twice` });
    }
    seen.add(key);
  }
  for (const [key, word] of expected) {
    if (!seen.has(key)) errors.push({ path: 'definitions', message: `"${word}" has no definition — every board word needs one` });
  }
  return errors;
};

export function validateOutput(output, { input = null } = {}) {
  return validateAgainst(output, SCHEMA, [(value) => everyWordOnce(value, input?.board ?? null)]);
}
```

- [ ] **Step 4: Register the stage**

`studio/stage-registry.js`: append `{ id: '10-definitions-author', kind: 'agent', agent: 'definitions-author' },` after the glossary author, and update the header comment to "Ten agents … plus D-33's definitions author".

`studio/agents/index.js`: `import * as definitionsAuthor from './definitions-author.js';` and `'definitions-author': definitionsAuthor,` after `'glossary-author'`. Header: "the twelve modules".

`studio/pipeline.js` `STAGE_INPUTS`, after the `'09-glossary-author'` builder:

```js
  // The definitions author writes one plain definition per board word for
  // Learning Mode (D-33). It only needs the board.
  '10-definitions-author': (board) => ({ board: boardOf(board) }),
```

`studio/pipeline-config.js` effort map, after `'09-glossary-author': 'low',`:

```js
    // Sixteen short plain definitions with a relaxed leak rule (D-33) — a
    // writing task with no search in it. Low, like the glossary author.
    '10-definitions-author': 'low',
```

and `effortProfile: '2026-09-05-learning-mode',`.

Create `studio/fixtures/responses/10-definitions-author.json` (the mock board's sixteen words):

```json
{
  "text": "{\"definitions\":[{\"word\":\"Seed\",\"definition\":\"the small hard part of a plant that a new plant grows from\"},{\"word\":\"Tree\",\"definition\":\"a tall woody plant with a trunk and branches\"},{\"word\":\"Spark\",\"definition\":\"a tiny bit of burning material that can start a fire\"},{\"word\":\"Fire\",\"definition\":\"burning that gives off heat, light and flames\"},{\"word\":\"Painter\",\"definition\":\"someone who makes pictures with paint\"},{\"word\":\"Brush\",\"definition\":\"a handle with bristles used to apply paint\"},{\"word\":\"Sculptor\",\"definition\":\"an artist who shapes figures from stone, wood or clay\"},{\"word\":\"Chisel\",\"definition\":\"a metal blade you strike with a mallet to carve hard material\"},{\"word\":\"Nest\",\"definition\":\"a home a bird builds to lay its eggs in\"},{\"word\":\"Bird\",\"definition\":\"a feathered animal with wings that lays eggs\"},{\"word\":\"Den\",\"definition\":\"a wild animal's sheltered home, often a cave or hollow\"},{\"word\":\"Bear\",\"definition\":\"a large heavy furry animal that sleeps through winter\"},{\"word\":\"Spring\",\"definition\":\"the season after winter when plants start to grow\"},{\"word\":\"Sowing\",\"definition\":\"scattering or planting seeds in the ground\"},{\"word\":\"Autumn\",\"definition\":\"the season after summer when leaves fall\"},{\"word\":\"Harvest\",\"definition\":\"gathering ripe crops from the fields\"}]}"
}
```

- [ ] **Step 5: Update the pinned tests**

`test/studio/stage-registry.test.js`: eleven stages, ten agents, one gate; append `'10-definitions-author'` to both order lists; `stageAfter('09-glossary-author').id === '10-definitions-author'` and `stageAfter('10-definitions-author') === null`.

`test/studio/agents/contract.test.js`: `AGENT_IDS.length` 10; add to `someInput`:

```js
  'definitions-author': { board: { id: 'b', title: 'B', sets: [] } },
```

`test/studio/pipeline/pipeline-config.test.js` line 107: `'2026-09-05-learning-mode'`.

`test/studio/pipeline/resume.test.js` and `test/studio/pipeline/revision.test.js`: append `'10-definitions-author'` to each pinned stage list (three places).

`studio/README.md`: the diagram gains a `10 definitions author ← sixteen plain definitions for Learning Mode` line under 09; the stage table gains `| 10 definitions-author | Writes one plain definition per board word for Learning Mode (D-33); leak rule relaxed by design | Sonnet / low |`; the agent count sentence reads twelve.

- [ ] **Step 6: Run the studio suite**

Run: `node --test test/studio/`
Expected: PASS. `prompt-schema-agreement.test.js` and `no-full-set-examples.test.js` iterate the registry and should pick the new agent up; if either fails, read its assertion and fix the prompt (it must not quote a finished four-word set — it does not).

- [ ] **Step 7: Commit**

```bash
git add studio/agents/definitions-author.js studio/agents/index.js studio/stage-registry.js studio/pipeline.js studio/pipeline-config.js studio/fixtures/responses/10-definitions-author.json studio/README.md test/studio/
git commit -m "feat(studio): stage 10, the Definitions Author — sixteen plain definitions per board

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Definitions ride the board — merge at save, play and publish; fold on the card

**Files:**
- Modify: `studio/gloss.js`, `studio/review/api.js`, `studio/review/ui/review.js`, `studio/review/ui/edit.js`
- Test: `test/studio/gloss.test.js`, `test/studio/review/api.test.js`

**Interfaces:**
- Produces: `mergeDefinitions(board, definitions) → { board, dropped }` (same contract as `mergeGlossary`); publish records `droppedDefinitions` when any; `GET` attempt reports include `10-definitions-author`.

- [ ] **Step 1: Write the failing tests**

Append to `test/studio/gloss.test.js` (extend the import: `import { mergeDefinitions, mergeGlossary } from '../../studio/gloss.js';`):

```js
// Learning Mode definitions (D-33) follow the gloss's drop rule exactly.
test('definitions whose word is on the board ride along; a departed word is dropped and reported', () => {
  const { board: merged, dropped } = mergeDefinitions(board, [
    { word: 'chisel', definition: 'Stays, case aside.' },
    { word: 'Loom', definition: 'Edited away.' }
  ]);
  assert.deepEqual(merged.definitions, [{ word: 'chisel', definition: 'Stays, case aside.' }]);
  assert.deepEqual(dropped, [{ word: 'Loom', definition: 'Edited away.' }]);
  assert.equal('glossary' in merged, false, 'the other field is untouched');
});

test('no definitions, or none surviving, leaves the board without the field', () => {
  assert.equal('definitions' in mergeDefinitions(board, undefined).board, false);
  assert.equal('definitions' in mergeDefinitions(board, [{ word: 'Loom', definition: 'x' }]).board, false);
});
```

In `test/studio/review/api.test.js`, extend `seedReviewable` to accept `definitions = null` and write it before `completeAttempt`:

```js
  if (definitions) {
    store.writeStageArtifact(runId, attemptId, '10-definitions-author', 'output.json', { definitions });
  }
```

Then add directly after the existing test `'a glossary on the attempt rides the published puzzle'` (around line 627), using that file's own `withPuzzles()` and `approve(api, runId)` helpers:

```js
test('stage 10 definitions ride the published puzzle, a departed word dropped and recorded', async () => {
  const { store, api, puzzlesDir, cleanup } = withPuzzles();
  try {
    const { runId } = seedReviewable(store, {
      definitions: [
        { word: 'Seed', definition: 'a plant starts from one' },
        { word: 'Loom', definition: 'no longer on the board' },
      ],
    });
    await approve(api, runId);

    const { status } = await api.handle({ method: 'POST', path: `/api/runs/${runId}/publish`, body: {} });
    assert.equal(status, 200);

    const published = JSON.parse(readFileSync(join(puzzlesDir, 'lantern.json'), 'utf8'));
    assert.deepEqual(published.definitions, [{ word: 'Seed', definition: 'a plant starts from one' }]);
    assert.equal('glossary' in published, false, 'no glossary stage on this attempt');

    const publishEvent = store.readDecisions(runId).find((event) => event.type === 'publish');
    assert.deepEqual(publishEvent.droppedDefinitions, [{ word: 'Loom', definition: 'no longer on the board' }]);
  } finally {
    cleanup();
  }
});

test('an attempt without a definitions stage publishes exactly as before', async () => {
  const { store, api, puzzlesDir, cleanup } = withPuzzles();
  try {
    const { runId } = seedReviewable(store);
    await approve(api, runId);
    await api.handle({ method: 'POST', path: `/api/runs/${runId}/publish`, body: {} });
    const published = JSON.parse(readFileSync(join(puzzlesDir, 'lantern.json'), 'utf8'));
    assert.equal('definitions' in published, false);
  } finally {
    cleanup();
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/studio/gloss.test.js test/studio/review/api.test.js`
Expected: FAIL — `mergeDefinitions` not exported; published board lacks `definitions`.

- [ ] **Step 3: Implement `studio/gloss.js`**

Refactor to one internal merge with two exports:

```js
function mergeField(board, entries, field) {
  const list = Array.isArray(entries) ? entries : [];
  const words = wordsOf(board);
  const kept = list.filter((entry) => words.has(entry.word.toLowerCase()));
  const dropped = list.filter((entry) => !words.has(entry.word.toLowerCase()));

  const { [field]: _previous, ...bare } = board;
  return {
    board: kept.length > 0 ? { ...bare, [field]: kept } : bare,
    dropped
  };
}

/** @returns {{ board, dropped }} — see the header. */
export function mergeGlossary(board, glossary) {
  return mergeField(board, glossary, 'glossary');
}

/** Learning Mode definitions (D-33): the same rule, the other field. */
export function mergeDefinitions(board, definitions) {
  return mergeField(board, definitions, 'definitions');
}
```

- [ ] **Step 4: `studio/review/api.js`**

Import `mergeDefinitions` beside `mergeGlossary`. Add beside `glossaryOf`:

```js
  /** Stage 10's definitions for an attempt, or null — Learning Mode (D-33). */
  const definitionsOf = (runId, attemptId) => {
    try {
      const output = store.readStageArtifact(runId, attemptId, '10-definitions-author', 'output.json');
      return Array.isArray(output?.definitions) && output.definitions.length > 0 ? output.definitions : null;
    } catch {
      return null; // pre-D-33 runs have no definitions stage
    }
  };
```

Add `['10-definitions-author', 'output.json'],` to the reports list after the glossary line.

In the save handler, widen the advisory: `const dropped = [...mergeGlossary(board, glossaryOf(runId, attemptId)).dropped, ...mergeDefinitions(board, definitionsOf(runId, attemptId)).dropped];`

In `publishRun`, after `board = withGloss;`:

```js
    // Learning Mode definitions ride the same door (D-33), same drop rule.
    const { board: withDefinitions, dropped: droppedDefinitions } = mergeDefinitions(
      board,
      definitionsOf(runId, manifest.currentAttemptId),
    );
    board = withDefinitions;
```

and on the publish record beside `droppedGloss`: `...(droppedDefinitions.length > 0 ? { droppedDefinitions } : {}),`.

- [ ] **Step 5: `studio/review/ui/review.js` and `edit.js`**

`review.js`: import `mergeDefinitions` too; in the `wirePlay` call, wrap the merged board once more:

```js
  wirePlay(
    effectiveBoard
      ? mergeDefinitions(
          mergeGlossary(effectiveBoard, attempt.reports?.['09-glossary-author']?.glossary).board,
          attempt.reports?.['10-definitions-author']?.definitions,
        ).board
      : effectiveBoard,
  );
```

Add after `glossLine`:

```js
/**
 * Learning Mode definitions (D-33), folded shut: sixteen lines Max did not ask
 * to read on every card, one click away when a tapped tile reads oddly.
 */
function definitionsFold(attempt) {
  const definitions = attempt.reports?.['10-definitions-author']?.definitions ?? [];
  if (definitions.length === 0) return '';
  return `<details class="panel report"><summary>Learning Mode definitions (${definitions.length})</summary>
    <ul class="studio-muted">${definitions
      .map((entry) => `<li><strong>${escape(entry.word)}</strong> — ${escape(entry.definition)}</li>`)
      .join('')}</ul></details>`;
}
```

and render `${definitionsFold(attempt)}` on the line after `${glossLine(attempt)}`.

`edit.js` `collectBoard`: `const { glossary: _dropped, definitions: _droppedDefinitions, ...bare } = base;` and extend the doc comment: neither field survives an edit; both are merged at play and publish.

- [ ] **Step 6: Run the studio suite**

Run: `node --test test/studio/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add studio/gloss.js studio/review/api.js studio/review/ui/review.js studio/review/ui/edit.js test/studio/gloss.test.js test/studio/review/api.test.js
git commit -m "feat(studio): definitions merge at save, play and publish; folded on the card

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: The backfill — module, tool, and the content gate

**Files:**
- Create: `studio/definitions-backfill.js`, `tools/backfill-definitions.js`, `test/studio/definitions-backfill.test.js`, `test/content/definitions.test.js`
- Modify: `package.json` (no new script needed; the tool is run by path like the glossary backfill)

**Interfaces:**
- Consumes: `loadAgent('definitions-author')`, `createLlm`, `effortFor/modelFor/maxTokensFor` (as `glossary-backfill.js` does), `puzzle-store.publish({ board, slug, replace: true })`.
- Produces: `listBoardsNeedingDefinitions({ puzzles }) → [{ slug, board, missing: number }]`; `authorDefinitions({ entry, transport, config?, context? }) → { ok: true, definitions } | { ok: false, failure }`; `applyDefinitions({ puzzles, slug, definitions })`.

- [ ] **Step 1: Write the failing tests**

Create `test/studio/definitions-backfill.test.js`:

```js
// The definitions backfill (D-33) — every published board gets sixteen plain
// definitions through the same seams the glossary backfill used: the same
// agent the pipeline runs, and puzzle-store.publish as the only door. No
// review file, by Max's call: everything auto-applies.
//
// Temp directories and an injected transport. Zero network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyDefinitions,
  authorDefinitions,
  listBoardsNeedingDefinitions,
} from '../../studio/definitions-backfill.js';
import { createPuzzleStore } from '../../studio/storage/puzzle-store.js';

const goodBoard = (id = 'board-01', title = 'Gotham Connections') => ({
  id,
  title,
  sets: [
    { id: 'set-1', relationshipLabel: 'a broad category and one specific example of it',
      explanation: 'Joker is a villain the way the Batmobile is a vehicle.',
      pairs: [['villain', 'Joker'], ['vehicle', 'Batmobile']], difficulty: 1 },
    { id: 'set-2', relationshipLabel: 'the hero and the tool that marks them',
      explanation: 'Batman carries a Batarang the way Catwoman carries a whip.',
      pairs: [['Batman', 'Batarang'], ['Catwoman', 'whip']], difficulty: 2 },
    { id: 'set-3', relationshipLabel: 'a substance and the effect it produces',
      explanation: 'Venom grants strength the way toxin induces fear.',
      pairs: [['Venom', 'strength'], ['toxin', 'fear']], difficulty: 3 },
    { id: 'set-4', relationshipLabel: 'the time of day and the activity that belongs to it',
      explanation: 'Night is for patrol the way dusk is for a stakeout.',
      pairs: [['night', 'patrol'], ['dusk', 'stakeout']], difficulty: 4 },
  ],
});
const WORDS = goodBoard().sets.flatMap((set) => set.pairs.flat());
const sixteen = () => WORDS.map((word) => ({ word, definition: `plainly, ${word}` }));

function world() {
  const puzzlesDir = mkdtempSync(join(tmpdir(), 'asto-defs-puzzles-'));
  const puzzles = createPuzzleStore({ rootDir: puzzlesDir });
  return { puzzles, puzzlesDir, cleanup: () => rmSync(puzzlesDir, { recursive: true, force: true }) };
}

function scriptedTransport(replies) {
  const calls = [];
  const transport = async (request) => {
    calls.push(request);
    const reply = replies[Math.min(calls.length, replies.length) - 1];
    return { text: reply, usage: { inputTokens: 1, outputTokens: 1 }, stopReason: 'end_turn', model: request.model };
  };
  transport.calls = calls;
  return transport;
}

test('boards without a full sixteen are listed; complete ones are not', (t) => {
  const w = world();
  t.after(w.cleanup);
  w.puzzles.publish({ board: goodBoard('b1', 'Bare'), slug: 'bare' });
  w.puzzles.publish({ board: { ...goodBoard('b2', 'Partial'), definitions: sixteen().slice(0, 3) }, slug: 'partial' });
  w.puzzles.publish({ board: { ...goodBoard('b3', 'Full'), definitions: sixteen() }, slug: 'full' });

  const entries = listBoardsNeedingDefinitions({ puzzles: w.puzzles });
  assert.deepEqual(entries.map((e) => [e.slug, e.missing]).sort(), [['bare', 16], ['partial', 13]]);
});

test('a valid reply is authored on the first round', async () => {
  const transport = scriptedTransport([JSON.stringify({ definitions: sixteen() })]);
  const result = await authorDefinitions({ entry: { slug: 'x', board: goodBoard() }, transport });
  assert.equal(result.ok, true, JSON.stringify(result.failure));
  assert.equal(result.definitions.length, 16);
  assert.equal(transport.calls[0].stageId, '10-definitions-author');
});

test('an invalid reply is retried with feedback, and two failures leave a diagnosable record', async () => {
  const short = JSON.stringify({ definitions: sixteen().slice(0, 15) });
  const transport = scriptedTransport([short, short]);
  const result = await authorDefinitions({ entry: { slug: 'x', board: goodBoard() }, transport });
  assert.equal(result.ok, false);
  assert.equal(result.failure.category, 'invalid-output');
  assert.equal(result.failure.rounds.length, 2);
  assert.match(result.failure.reply, /definitions/);
  // llm.js appends validation feedback to the retry's prompt — the missing
  // word ("stakeout", the sixteenth) must be named there.
  assert.equal(transport.calls.length, 2);
  assert.match(transport.calls[1].prompt, /rejected/);
  assert.match(transport.calls[1].prompt, /stakeout/);
});

test('applyDefinitions writes through puzzle-store and changes nothing else', (t) => {
  const w = world();
  t.after(w.cleanup);
  const board = { ...goodBoard(), glossary: [{ word: 'Batarang', definition: 'a bat-shaped throwing blade' }] };
  w.puzzles.publish({ board, slug: 'gotham' });

  applyDefinitions({ puzzles: w.puzzles, slug: 'gotham', definitions: sixteen() });

  const after = w.puzzles.read('gotham');
  assert.equal(after.definitions.length, 16);
  assert.deepEqual(after.glossary, board.glossary);
  assert.equal(after.title, board.title);
});
```

Create `test/content/definitions.test.js`:

```js
// Every published board carries sixteen Learning Mode definitions (D-33) —
// the content gate that keeps a tile from ever answering "no definition".
// Skipped, loudly, until the backfill has run: the assertion is that once any
// board has definitions, every board does.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { deriveWords } from '../../src/engine/arrangements.js';

const dir = fileURLToPath(new URL('../../puzzles/', import.meta.url));
const boards = readdirSync(dir)
  .filter((name) => name.endsWith('.json') && name !== 'index.json')
  .map((name) => ({ name, puzzle: JSON.parse(readFileSync(`${dir}${name}`, 'utf8')) }));

const anyDefined = boards.some(({ puzzle }) => Array.isArray(puzzle.definitions));

test('once the catalog has definitions, every board defines all sixteen words', { skip: !anyDefined && 'backfill not yet run' }, () => {
  for (const { name, puzzle } of boards) {
    const words = new Set(deriveWords(puzzle.sets).map((w) => w.toLowerCase()));
    const defined = new Set((puzzle.definitions ?? []).map((e) => e.word.toLowerCase()));
    assert.equal(defined.size, 16, `${name}: ${defined.size} definitions`);
    for (const word of words) assert.ok(defined.has(word), `${name}: "${word}" has no definition`);
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/studio/definitions-backfill.test.js test/content/definitions.test.js`
Expected: the backfill test FAILS (module missing); the content test reports skipped.

- [ ] **Step 3: Create `studio/definitions-backfill.js`**

```js
// definitions-backfill.js — giving every published board its sixteen Learning
// Mode definitions (design.md D-33), through the seams that already exist: the
// same definitions-author agent the pipeline runs at stage 10, and
// puzzle-store.publish as the only door into puzzles/.
//
// No review file, by Max's call (2026-09-05): every result auto-applies. The
// leak rule is relaxed for these definitions, so a bad one is a flat sentence,
// not a broken board — and the validator still holds the line on completeness.
//
// Boundary law: no fetch (the model is reached through llm.js), and the only
// fs in this module is through the injected puzzle store.

import { loadAgent } from './agents/index.js';
import { createLlm } from './llm.js';
import { DEFAULT_CONFIG, effortFor, maxTokensFor, modelFor } from './pipeline-config.js';
import { deriveWords } from '../src/engine/arrangements.js';

const STAGE = '10-definitions-author';

/** Every published board short of sixteen definitions, with how many it lacks. */
export function listBoardsNeedingDefinitions({ puzzles }) {
  const entries = [];
  for (const { slug } of puzzles.list()) {
    let board;
    try {
      board = puzzles.read(slug);
    } catch {
      continue;
    }
    const words = new Set(deriveWords(board.sets).map((w) => w.toLowerCase()));
    const have = new Set((board.definitions ?? []).map((e) => e.word.toLowerCase()).filter((w) => words.has(w)));
    const missing = words.size - have.size;
    if (missing > 0) entries.push({ slug, board, missing });
  }
  return entries;
}

/**
 * Sixteen definitions for one board — the bounded two-round loop the glossary
 * backfill uses, with the agent's own validator binding. Never throws.
 */
export async function authorDefinitions({ entry, transport, config = DEFAULT_CONFIG, context = {} }) {
  const agent = loadAgent('definitions-author');
  const input = { board: entry.board };

  const llm = createLlm({ transport });
  const effort = effortFor(STAGE, config);
  const request = {
    stageId: STAGE,
    model: modelFor(STAGE, config),
    prompt: agent.buildPrompt(input, context),
    maxTokens: maxTokensFor(STAGE, config),
    ...(effort ? { effort } : {}),
  };

  const rounds = [];
  let lastReply = null;

  try {
    let feedbackForRetry;
    for (let round = 1; round <= 2; round += 1) {
      const { text } = await llm.send(request, { maxAttempts: 2, feedback: feedbackForRetry });
      lastReply = text;
      const parsed = agent.parse(text);
      const validation = parsed.ok ? agent.validateOutput(parsed.value, { input }) : parsed.failure;

      if (parsed.ok && validation.ok) return { ok: true, definitions: parsed.value.definitions };

      const errors = parsed.ok ? validation.errors : [{ path: '(parse)', message: validation.message }];
      rounds.push({ round, errors });
      feedbackForRetry = `Your previous reply was rejected: ${errors
        .map((e) => `${e.path}: ${e.message}`)
        .join('; ')}. Reply with corrected JSON only.`;
    }
    return {
      ok: false,
      failure: {
        slug: entry.slug,
        category: 'invalid-output',
        message: 'the model answered twice and neither reply was a valid set of definitions',
        rounds,
        reply: lastReply,
      },
    };
  } catch (error) {
    return {
      ok: false,
      failure: { slug: entry.slug, category: error.category ?? 'transport', message: error.message, rounds, reply: lastReply },
    };
  }
}

/**
 * Writes the definitions onto one published board through the only door. The
 * board is re-read, gains exactly `definitions`, and goes back through
 * `publish` — schema validation and the integrity sweep run again. Nothing
 * else about the board changes.
 */
export function applyDefinitions({ puzzles, slug, definitions }) {
  const board = puzzles.read(slug);
  const withDefinitions = {
    ...board,
    definitions: definitions.map(({ word, definition }) => ({ word, definition })),
  };
  return puzzles.publish({ board: withDefinitions, slug, replace: true });
}
```

`createLlm` is imported from `studio/llm.js`; `llm.send(request, { maxAttempts, feedback })` appends `feedback` to the outbound prompt on the retry, which is what the third test reads.

- [ ] **Step 4: Create `tools/backfill-definitions.js`**

```js
#!/usr/bin/env node
// backfill-definitions.js — the CLI adapter for D-33's Learning Mode
// definitions. argv in, studio/definitions-backfill.js does the work, results
// printed. No logic, no shelling out.
//
//   node tools/backfill-definitions.js [--dry-run]
//
// Authors sixteen definitions for every published board short of them (needs
// ANTHROPIC_API_KEY) and applies each result immediately — no review file, by
// Max's call. --dry-run lists the boards and spends nothing. Sequential on
// purpose: a wall (rate limit, credit) stops the walk with a readable tail.
// Re-runnable: a board that failed is simply still short next time.

import { parseArgs } from 'node:util';

import { applyDefinitions, authorDefinitions, listBoardsNeedingDefinitions } from '../studio/definitions-backfill.js';
import { createPuzzleStore } from '../studio/storage/puzzle-store.js';
import { createAnthropicTransport } from '../studio/llm.js';
import { loadEnv } from '../studio/env.js';

async function main(argv) {
  const { values } = parseArgs({ args: argv, options: { 'dry-run': { type: 'boolean', default: false } }, strict: true });
  loadEnv();
  const puzzles = createPuzzleStore();
  const entries = listBoardsNeedingDefinitions({ puzzles });
  console.log(`${entries.length} board(s) short of sixteen definitions`);
  if (values['dry-run']) {
    for (const entry of entries) console.log(`  ${entry.slug} (${entry.missing} missing)`);
    return 0;
  }

  const transport = createAnthropicTransport();
  let applied = 0;
  const failures = [];
  for (const entry of entries) {
    const result = await authorDefinitions({ entry, transport });
    if (!result.ok) {
      failures.push(result.failure);
      console.log(`  ✖ ${entry.slug} — [${result.failure.category}] ${result.failure.message}`);
      continue;
    }
    applyDefinitions({ puzzles, slug: entry.slug, definitions: result.definitions });
    applied += 1;
    console.log(`  ✔ ${entry.slug} — 16 definitions applied`);
  }
  console.log(`applied: ${applied} · failed: ${failures.length}`);
  return failures.length > 0 ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(error.message);
    process.exit(1);
  },
);
```

Check `studio/glossary-backfill.js` for how the tool obtains a transport (`createAnthropicTransport` from `llm.js`) and copy the exact export name if it differs.

- [ ] **Step 5: Run**

Run: `node --test test/studio/definitions-backfill.test.js test/content/definitions.test.js && node tools/backfill-definitions.js --dry-run`
Expected: tests PASS (content test skipped); dry run prints `52 board(s) short of sixteen definitions` and lists them (51 boards plus the tutorial's board file if it is separate — `puzzles.list()` decides).

- [ ] **Step 6: Commit**

```bash
git add studio/definitions-backfill.js tools/backfill-definitions.js test/studio/definitions-backfill.test.js test/content/definitions.test.js
git commit -m "feat(studio): definitions backfill — sixteen per board, auto-applied

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Browser verification of the game

**Files:** none modified unless a defect is found.

- [ ] **Step 1: Start the preview**

Use `preview_start` with the `serve` configuration in `.claude/launch.json` (create it if missing: `{"name":"serve","runtimeExecutable":"npm","runtimeArgs":["run","serve"],"port":<the port npm run serve uses>}`). Resize to 375×812.

- [ ] **Step 2: Default mode is unchanged**

Open a board (`?puzzle=bedside-manor`). Press Vocab → the phlebotomist footnote appears, pill disables, status reads "A little vocabulary — on the house." Tap tiles → they select. Zero console errors.

- [ ] **Step 3: Turn Learning Mode on**

Title → Play → gear icon → Settings. The Help group shows "Learning mode" and a "Turn on" pill; press it → reads "Turn off", `aria-pressed="true"`. Back → board. The Vocab pill is enabled and unpressed.

- [ ] **Step 4: Arm, define, disarm**

Press Vocab → status "Tap a tile to see what it means.", every unselected tile has the dashed outline, pill `aria-pressed="true"`. Tap a tile → footnote `word — definition` (with no backfill yet the footnote reads "No definition for this one." for every tile except the glossed word; that is the expected pre-backfill state), outline clears, tile is NOT selected. Press Vocab, tap the glossed word → its leak-checked gloss. Press Vocab twice → armed then disarmed, status clears.

- [ ] **Step 5: Live rule change**

Arm the board, go to Settings, turn Learning Mode off, come back → board is disarmed, Vocab behaves as one-word mode.

- [ ] **Step 6: The mark**

With Learning Mode on, define one word, win the board (use `localStorage`-free approach: play it). End screen → Share → clipboard/share text carries `· 📖`. Calendar: the day's cell shows the book at the cup's corner; the day card shows the book beside the cup; `spokenResult` label contains "Definitions were used." Replay with Learning Mode on but never define → no marker anywhere.

- [ ] **Step 7: Tutorial**

Title → How to play. Press Vocab → coach mentions Learning Mode and Settings. Solve one set → the done step shows the Learning Mode note. With Learning Mode on, replay: press Vocab → "Learning Mode is on — tap any tile…"; tap a tile → the look-up line.

- [ ] **Step 8: Evidence**

Screenshot the armed board, the Settings Help group, the footnote, and the calendar badge at both sizes. Run `read_console_messages` with `onlyErrors: true` → empty.

- [ ] **Step 9: Commit any fix**

```bash
git add -A src styles
git commit -m "fix: <what the browser pass found>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Run the backfill and gate the content

- [ ] **Step 1: Dry run** — `node tools/backfill-definitions.js --dry-run` lists every board.

- [ ] **Step 2: Live run** — `node tools/backfill-definitions.js`. Expected: `applied: N · failed: 0`. Re-run for any failures.

- [ ] **Step 3: Gate** — `npm test` (the content test now runs and must pass) and `node tools/check-board.js puzzles/*.json` clean. `npm run manifest` is run by `publish` already; confirm `git diff --stat puzzles/index.json` shows no ordering change.

- [ ] **Step 4: Spot-check** — read three boards' `definitions` by eye (`node -e` printing `bedside-manor`, `ascent`, `first-light`) and confirm in the browser (Task 12 Step 4 again) that a tapped tile now shows a real definition.

- [ ] **Step 5: Commit**

```bash
git add puzzles/
git commit -m "content: sixteen Learning Mode definitions on every published board (D-33 backfill)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Docs — D-33, CLAUDE.md, log; then /wrapup

- [ ] **Step 1: `docs/design.md`** — add `### D-33 — Learning Mode: the Vocab button defines any tile (2026-09-05)` after D-32 (before `## House-rule exceptions`), covering: Max's idea; the seven decisions in order; the schema amendment (optional `definitions`, additive, Max-initiated); the relaxed leak rule and why the gloss keeps its check; the light mark and the book badge; the tutorial copy; the new stage and backfill; verification evidence from Tasks 12–13; the reconsider-when from the spec. Also update the schema example near line 25 to note `definitions` optional.

- [ ] **Step 2: `CLAUDE.md` §4** — `date`/`baitTags`/`glossary`/`definitions` optional. §7 gains: "Learning Mode (D-33) arms the board on Vocab; a tile tap while armed defines, never selects."

- [ ] **Step 3: `docs/log.md`** — new entry at the top for 2026-09-05 (latest), ending with `- **Next:**` (the capstone items carried forward; the GDD bump now also owes a Learning Mode line).

- [ ] **Step 4: `docs/backlog.md`** — one line: "Stats page could count assisted plays (`learning: true` is recorded, D-33) — unbuilt."

- [ ] **Step 5** — invoke `/wrapup`: full gate, drift check, merge `work/learning-mode` into `main`, push, `npm run check-deploy`.
