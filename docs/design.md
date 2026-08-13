# ASTO — HTML Prototype Build Plan

**Status: approved 2026-08-01** (planned in the Development Brain, executed here).
Work the phases in order; each phase gate is a stop-and-playtest point. The GDD this
plan implements is committed alongside at **`docs/asto-gdd.html`** (v0.13, standalone —
open it in a browser). Deeper background (tech spec, architecture doc, design system
sources) lives in the handbook repo: `maigd-course-handbook/projects/asto/`.

## Context

MAIGD coursework and the handbook's knowledge work have carried ASTO to the point where
the actual game gets built. This repo houses the real game. This plan turns the GDD +
tech spec + architecture doc into a phased build of the playable HTML prototype.

The old crew boards and pipeline (handbook repo) are **test artifacts** — new boards
will be authored in this repo's schema; the crew gets re-tooled later (out of scope).

## Decisions locked with Max (2026-08-01)

1. **Stack: vanilla HTML/CSS/JS ES modules. Zero dependencies. No build step.**
   Tests via node's built-in `node:test` (engine is pure ESM node can import).
2. **Canonical puzzle schema v1.0** — camelCase; pairs as single source of truth
   (16 words derived, no `words[]`); `explanation` + per-set `id` required; **no `tier`
   field** (derived from `difficulty` 1–4 → Green/Yellow/Red/Black); `date`/`baitTags`
   optional. Exactly 4 sets, one per difficulty. Example:
   ```json
   {
     "id": "asto-first-light", "title": "First Light", "date": "2026-08-01",
     "sets": [{
       "id": "set-growth",
       "relationshipLabel": "Small origin becomes larger result",
       "explanation": "A seed grows into a tree the way a spark grows into a fire.",
       "pairs": [["Seed","Tree"],["Spark","Fire"]],
       "difficulty": 1, "baitTags": ["nature"]
     }]
   }
   ```
3. **Scope: phased to full MVP** — every GDD Must-have, built in gated phases so Max can
   stop/playtest at any gate.

## Architecture (prescribed by asto-architecture.md — not re-decided)

Headless **PuzzleEngine** (pure functions, no DOM/IO/globals) · read-only **View**
components · thin **GameController** glue · **PuzzleSource** seam (`LocalJsonSource` now,
`ApiSource` later; validates schema at the boundary). Build order: **engine + tests
first**, then view, then controller, then source. Invariant: *the game must run
correctly with the view turned off.*

Engine API: `initGame(puzzle)` · `shuffle(state)` · `clearSelection(state)` ·
selection ops · `submit(state, orderedTerms) → { state, outcome }`,
outcome ∈ `solved` / `so-close` / `miss`. Reducer: guard → derive the 4 accepted orders
per unsolved set from pairs (`[A,B,C,D] [C,D,A,B] [B,A,D,C] [D,C,B,A]`) → **ordered**
comparison (never sort) → resolve → status. `MAX_MISTAKES = 4`.

Key rules from the GDD: 4th tap fills the frame **without submitting**; Confirm only at
4 filled; drag-to-reorder inside the frame; "So close!" (right words, wrong order)
**costs a mistake** (single tunable); Clear free; Shuffle touches unsolved tiles only;
solved sets animate to canonical order + reveal tier & label; lose on 4th mistake, loss
screen reveals unsolved answers with explanations.

Design system (GDD Appendix E): Cream `#F3ECDC` / Milk / Oat / Taupe / Ink palette,
4 tier color triples, Bree Serif + Nunito, pill buttons (ink fill = primary only),
coffee-bean mistake pips (never red), paper grain on tiles/cards only, motion 120–180ms
ease-out, ±4px shake, **no confetti/particles/timers**.

## Implementation plan

### Repo layout

```
ASTO/
├── package.json          # {type:"module", scripts:{test:"node --test", serve}} — ZERO deps
├── index.html            # single page; screens are <section>s toggled by app.js
├── styles/               # tokens.css (design tokens as CSS vars) · base.css · components.css
├── src/
│   ├── engine/           # PURE — no DOM, no fetch, no globals; RNG injected
│   │   ├── engine.js         # initGame, select, deselect, reorderSelected,
│   │   │                     #   clearSelection, shuffle, submit, MAX_MISTAKES
│   │   ├── arrangements.js   # acceptedOrders(pairs), deriveWords(sets)
│   │   ├── rng.js            # fisherYates(arr, rand)
│   │   ├── tiers.js          # difficultyToTier(1..4) → green/yellow/red/black
│   │   └── board-integrity.js# brute-force alternate-solution checker
│   ├── source/
│   │   ├── validate-puzzle.js    # pure schema v1.0 validator → {ok, errors[]}
│   │   ├── validate-manifest.js  # pure manifest validator, same {ok, errors[]} contract
│   │   └── local-json-source.js  # fetch + validate at boundary (ApiSource later, same interface)
│   ├── view/             # READ-ONLY renderers, emit intents via callbacks
│   │   ├── header-view.js · board-view.js · frame-view.js · solved-sets-view.js
│   │   ├── controls-view.js · end-view.js · tutorial-overlay.js · select-view.js
│   ├── controller/
│   │   ├── game-controller.js    # the ONLY writer: intents → engine → re-render
│   │   └── tutorial-script.js    # coach-mark steps keyed to controller events (no DOM)
│   ├── storage.js        # localStorage: per-puzzle results, tutorialSeen
│   ├── results-recorder.js # reads finished games off the views array → storage
│   ├── share.js          # navigator.share → clipboard fallback
│   └── app.js            # bootstrap, screen routing, first-run check
├── puzzles/              # index.json manifest + first-light.json + tutorial.json + 10+
├── tools/check-board.js  # CLI: validate + integrity-check a board file
├── tools/build-manifest.js # CLI over puzzle-store.writeManifest() (`npm run manifest`)
├── docs/design.md        # this design, committed
└── test/                 # engine/ · source/ · content/ (node:test)
```

**Boundary law (goes in README):** `src/engine` + `validate-puzzle.js` import nothing
outside themselves; views never import engine mutators; only `game-controller.js` calls
engine functions.

### Engine design (key decisions)

- **GameState:** `{ puzzle, rules: {maxMistakes}, boardTerms, selectedTerms,
  solvedSetIds, mistakes, status }`. **`boardTerms` = unsolved tiles only** — solving
  removes the 4 words, so grid-shrink, shuffle-unsolved-only, and submit guards fall out
  by construction.
- **Selection order lives in the engine** (`selectedTerms`, ordered) and drag-reorder
  commits via `reorderSelected(state, from, to)` — order decides so-close vs solved, so
  it's game-semantic, not presentational ("game must run with the view off"). The view
  owns only transient mid-drag visuals; on drop the controller commits the reorder.
- **Submit reducer** (single synchronous pass): guards (playing, exactly 4, all on
  board, no dups → `invalid` no-op) → ordered comparison against each unsolved set's
  `acceptedOrders` (never sort) → resolve:
  - `solved` — add setId, remove words, clear selection; 4 solved → `won`. Outcome
    carries `{setId, canonicalOrder}` for the snap-to-canonical animation.
  - `so-close` — same 4-word membership as an unsolved set, wrong order → mistake+1.
    Outcome payload deliberately empty (no setId) so the view *can't* leak which set/tier.
  - `miss` — otherwise → mistake+1. Both paths: 4th mistake → `lost`.
  - **Per GDD §8: selection clears on so-close and miss** (deliberate playtest bet).
    Tunable via `rules` (like `maxMistakes`) if playtesting revisits it.
- **Tutorial no-lose without forking:** `initGame(puzzle, {maxMistakes: Infinity})` —
  consulted at exactly one line in submit. Engine knows *rules*, not tutorials; mistakes
  still increment (the "So close!" beat still teaches) but never trigger loss. Tested in
  Phase 1 before any tutorial code exists.
- **Immutability guard:** `Object.freeze` state in dev + a test asserting inputs
  unchanged after each engine call.

### Phases (each gate = stop/playtest point)

**Phase 1 — Headless engine + validation + tests.** package.json, engine modules,
`validate-puzzle.js` (all schema rules incl. loud rejection of old-schema `words[]`/
`tier` boards), `board-integrity.js` (43,680 ordered 4-tuples — instant; asserts exactly
16 accepted = 4 orders × 4 sets, reports collisions), `tools/check-board.js`,
`puzzles/first-light.json` (from GDD Appendix B).
*Gate:* `node --test` green incl. headless full win + full loss played through engine
imports only; check-board passes First Light. **No index.html yet — that's the point.**

**Phase 2 — Core play screen.** index.html + tokens/base CSS (GDD palette, Bree Serif/
Nunito with fallback stacks), `local-json-source.js`, views (header+bean pips, 4×4
board, frame with honey-glow next slot, controls with Confirm-gating, solved cards),
`game-controller.js`, drag-to-reorder via Pointer Events + `setPointerCapture` +
`touch-action:none` (**never HTML5 DnD** — broken on iOS; taps alone must fully suffice,
drag is additive). Views own persistent keyed DOM nodes per term, updated in place —
decided *now* because Phase 3's FLIP animations die under rebuild-from-state rendering.
*Gate:* playable in mobile-emulation browser: win, lose, so-close costs a mistake +
clears, Clear free, Shuffle unsolved-only, deselect compresses order.

**Phase 3 — Win/loss screens + motion polish.** `end-view.js` (win: tier cards in order,
Share, Next puzzle; loss: unsolved sets revealed in canonical order **with
explanations**, REVEALED badges), motion pass per Appendix E (120–180ms ease-out, FLIP
solve→canonical→card sequence, ±4px shake ×3, 1px press, `prefers-reduced-motion`
support), paper grain (inline SVG feTurbulence data-URI, tiles/cards only).
*Gate:* GDD §16 acceptance checklist for core loop + end states; solve animation
glitch-free; the no-list held (no confetti/particles/timers, beans never red).

**Phase 4 — First-run tutorial.** `puzzles/tutorial.json` (ordinary schema-v1.0 board,
difficulty-1 set = Seed:Tree::Spark:Fire, same validator+integrity bar),
`tutorial-script.js` (3 coach-marks: relationship-not-category · order matters · what
`::` means, advance conditions keyed to controller events), `tutorial-overlay.js`,
pips hidden via view flag, `storage.js` tutorialSeen + skip affordance.
*Gate:* fresh profile lands in tutorial, cannot lose, coach-marks fire correctly,
completion routes to First Light; returning visitor skips.

**Phase 5 — Puzzle select + content.** Author 10+ boards (draft JSON →
`tools/check-board.js` → fix reported collisions → commit; `board-integrity.test.js`
globs `puzzles/*.json` so `npm test` regates all content forever), manifest,
`select-view.js` with per-puzzle persisted results, routing + Next-puzzle chaining.
*Gate:* all boards green, select state survives reload, full §16 acceptance pass.

*Status 2026-08-07:* **COMPLETE.** Content done (10 boards, all clean); manifest, select
screen, per-puzzle results and Next-puzzle chaining built and verified (see D-10). All
three parts of the gate met — `npm test` 1003/0 and `check-board.js` clean, reload
persistence demonstrated in the browser, and **Max's playtest passed**. Tagged
`v0.1.0-local`. **Phases 1–5 are done**; publishing to Pages is a separate milestone.

### Test layout (all `node:test`, Phase 1 unless noted)

`arrangements` (the exact 4 orders) · `selection` (guards, order preservation,
reorder) · `submit` (each accepted order solves; cross-pair `A:C::B:D` → so-close not
solved; so-close = mistake + clears; guards; outcome payloads) · `shuffle` (seeded RNG,
selection untouched) · `game-flow` (headless win/loss/mixed + `maxMistakes: Infinity`
never loses) · `validate-puzzle` (each rule rejects distinctly; old-schema rejected) ·
`board-integrity` (exactly 16 accepted tuples; grows with content in P4/P5).
UI phases have **no automated browser tests** (deliberate at zero deps) — manual
acceptance checklists compensate; everything decision-shaped is in the tested engine.

### Key risks (from the design review)

1. **Human-plausible-but-rejected analogies** — boards need playtest eyes in Phase 5.
   *Sharpened 2026-08-02 (Studio A3), with the fact verified in code:* the integrity
   tool cannot reject a schema-valid board at all. With sixteen distinct words no two
   sets can share an ordered 4-tuple, so the accepted count is always exactly sixteen
   and `collisions` is always empty. `board-integrity.js` is therefore a **regression
   guard on the engine** — it would catch a future change that sorted a submission or
   widened acceptance — not a per-board content check. What actually rejects a board
   mechanically is `validate-puzzle.js`.

   *Amended 2026-08-03:* the 04a gate now also enforces **≥4 distinct relationship
   labels across the four sets** — the first mechanical check in this repo that *can*
   fail a schema-valid board, and the answer to the backlog question about whether one
   should exist. It is carried over from the retired prototype crew, which shipped a
   schema-valid ocean board using only two relation types and added the gate in
   response. A rejection feeds the count *and* the offending labels back through the
   gate's existing bounded rebuild loop, so the retry has something to act on.
   Everything else that makes a board merely *bad* remains the Studio's Adversarial
   Solver (stage 06), its evaluation pass (A5), and finally Max.
2. **`file://` fails** (ESM + fetch) — README line 1: use `npm run serve`.
3. **Google Fonts = hidden network dep** — ship fallback stacks; self-host woff2 later.
4. **iOS specifics** — `100dvh`, safe-area insets, `touch-action`; test on a real
   iPhone at every gate.
5. **Scope creep at polish** — the GDD's no-list is spec; keep Phase 3 checklist-driven.

## Verification

- **Phase gates:** each phase ends with its `node --test` suite green + the relevant
  GDD §16 acceptance-checklist items passed manually in the browser (served via a
  static server through the preview tools, mobile viewport).
- **Engine correctness (Phase 1):** headless full win + full loss through engine
  imports alone — the "view turned off" proof — plus the unit suites above.
- **Board integrity:** `tools/check-board.js` on every board; the glob test regates all
  shipped content on every `npm test`.
- **End-to-end (final):** in the preview browser — fresh profile → tutorial →
  First Light win → loss path → puzzle select persistence across reload.

## Handbook touchpoint (post-build, separate small step)

- GDD Appendix A now diverges from canonical schema v1.0 → **flag for Max** (human-owned
  page; propose, don't rewrite): update Appendix A + `asto-tech-spec.md` to match.
- Log the build session in `system/log.md` at wrapup; crew re-tooling to schema v1.0 is
  a later session.

## Decisions taken during the build

### D-1 — The Board Builder may promote a set to Black (2026-08-03)

**The problem, from evidence:** the Difficulty Rater has never returned a 4. Ten graded
sets across two real runs came back `1,2,3,1,2` and `1,2,2,3`. Nothing upstream is asked to
produce a hard set, and the rater grades each candidate on its own merits, so a pool that
spans all four tiers is luck rather than design. The Board Builder needs one set per tier,
so it could not build at all — and on a rebuild it **invented a set nothing had rated** and
assigned it difficulty 4 itself.

**What Claude proposed:** either allow authoring and re-rate the result, or forbid it and
fix the shortage upstream.

**Max's choice, and his reasoning:** neither. Ship the board with the sets you have, and
label the hardest one Black even though it was graded lower — *"upping the difficulty of
level 4 maybe something we can train with the studio."* The rater's ceiling is a thing to
teach through the review loop, not to engineer around before the loop has run.

**What this does and does not change.** Schema v1.0 is **untouched**: a board still carries
exactly four sets at difficulties 1–4, and Black is still *derived* from difficulty 4 — there
is no `tier` field to set. What changed is Studio behaviour: the builder ranks its four
chosen sets and assigns 1–4 in that order rather than requiring an exact match to the grades.

**The accepted risk:** a promoted Black set's difficulty is the builder's ranking, not an
independent judgement, so GDD §16's difficulty loop has no *predicted* value to compare its
*simulated* one against for that set. Max accepted this knowingly — it is the thing being
trained.

**Three guards, so the risk stays visible rather than silent:**
- The builder may **choose and relabel, never author**. Enforced at the 04a gate in code, not
  in the prompt: any board set absent from the graded pool is rejected and sent back.
- Every promotion is **recorded** (`promotions: [{setId, gradedDifficulty, assignedDifficulty}]`)
  and checked against the board it claims to promote.
- Every promotion is **shown in the Review Studio** on the card itself — *"graded 3 — promoted
  to Black"*. A promotion Max cannot see is a judgement he cannot give feedback on, which
  would defeat the purpose of the choice.

**Reconsider-when:** the rater starts returning 4s of its own accord after a rubric recompile
(the promotion machinery then costs nothing but should be re-examined), **or** the review
corpus shows promoted Black sets are consistently rated too easy — at which point the fix
belongs upstream, in what the Pair Author is asked for, not in the builder's relabelling.

### D-2 — The first rules compiled from Max's own reviews, adopted at 10 boards (2026-08-04)

**The plan of record** was to judge ~30 boards, then compile `rubric.md` from the corpus in
one pass. The reasoning still holds: rules written from concrete judgements beat rules
articulated in the abstract.

**What changed:** at 10 boards / 55 events, Max asked what his feedback had actually taught
the pipeline, and the honest answer was **nothing** — the ten rules reaching every agent came
from the GDD (six) and the retired prototype crew (four), and the only reader of
`feedback.jsonl` anywhere in the Studio was the page that displays it back. Reading the corpus
end to end, two patterns were already past arguing:

- **7 events** — B must follow from A *necessarily*, not occasionally. Max's most common
  reason for killing a set, and twice he wrote the corrected pair himself.
- **8 events** — word familiarity drives difficulty. The green slot kept landing too hard
  because the rater grades relationship trickiness alone.

**Max's decision:** adopt both now, **amending the second in his own words** — familiarity
*affects* difficulty; the relationship and the words **together** set it. Familiarity does not
replace the relationship as the driver, which the first drafting had implied.

**What this does and does not change.** The ~30-board compilation milestone is **unchanged**;
this is a partial pull-forward of two rules, not a replacement for it. `rules.json` gains
source `feedback-batch-1`, and both rules carry `provenance.runs` naming the runs that
justified them — a rule whose evidence is not recorded cannot be re-examined when it turns out
to be wrong.

**Also decided against, for the record:** a "keep relationship labels short" rule. It felt
right — Max had called one label "far too long" — but the corpus refuted it. Sets he praised
averaged 8.8 words, sets he faulted 9.3, and the longest label he *liked* (16 words) was
longer than the longest he faulted (12). The label he objected to was convoluted, not long.

**Reconsider-when:** the corpus reaches ~30 boards and `rubric.md` is compiled — at which
point these two are re-derived from the full set rather than grandfathered, **or** boards
built under them start drawing the *opposite* complaint (analogies too literal, greens too
trivial), which would mean a rule overshot.

### D-3 — The arrow finding, and the pipeline work it authorises (2026-08-04)

**The finding, from two blind playtests.** Max noticed the boards felt samey and proposed
generating relationship-first. Measured against the corpus he was right about the symptom:
~80% of all 284 pairs ever authored are "one thing becomes/produces another". Two hand-made
A/B experiments followed (`experiments/four-family-board/`, `experiments/arrow-round-2/`):

- **Round 1 invalidated its own design.** A board drawing its four sets from four different
  formal families of the Bejar/Chaffin/Embretson taxonomy read to Max as *"all the same — an
  object moving forward in time somehow"*, and he demoted yellow, red **and** black to green:
  *"once you notice one relationship you start to see the same relationship again quickly."*
  Formal taxonomy diversity produced **zero** felt diversity, because every set still carried
  a temporal/causal **arrow**.
- **Round 2 replicated the corrected hypothesis, blind, with the letters flipped and an
  equally evocative control.** The board mixing one arrowed on-ramp with three **arrowless**
  relations — membership (`Constellation : Orion`), static feature (`Moon : Crater`), absence
  (`Shadow : Weight`) — was approved as *"the best puzzle yet… This is ASTO"* and became the
  first board in the corpus to score `good-unchanged + strong-reveal + difficulty-accurate +
  feels-like-asto` on **all four sets**. The all-arrowed control was rejected, with Max naming
  the effect himself while blind: *"another 'arrow' puzzle."*

**The design rule, stated:** *the theme unifies the words; the relationships diversify the
questions* — and the variable that makes questions feel different is **whether a set carries
an arrow**, not which formal family it belongs to. Two supporting observations worth keeping:
an arrowless set changes the player's *activity* (*"hunting around the board for the name of
something till I found Venus"*), and the biggest reaction came from the set that **inverted**
the rest, suggesting the Black slot may belong to the set running against the board's grain.

**Status: n=2 — deliberately not law.** Max's instruction, and correct: *"lets make sure we
don't view the revised principle as immutable."* Individual arrowed sets are still good
(`Ember : Ash :: Echo : Silence` earned `strong-reveal` inside a rejected board) — the finding
is about boards made *only* of them.

**What this authorises next session, in order.** Nothing below is built yet:

1. **Reword `rule-007`.** "A pair must be directional **and transformative**" literally
   forbids `Brush : Painter`, `Nest : Bird` and `Dove : Peace` — three of the four sets on the
   approved First Light board, and the whole class of arrowless sets Max just rated best. Its
   real intent was to ban static *adjectives* (`Gulf Stream : warm`), which a rewrite must
   keep.
2. **Make `shape` a controlled vocabulary** drawn from the taxonomy in
   `docs/research/semeval-2012-taxonomy.md`, each entry tagged **arrowed / arrowless**. This
   also fixes a measurement bug found the same day: the field is free text, 48 distinct
   strings for a 13-shape list, leaving **40% of authored pairs uncountable** by the variety
   brief.
3. **A board-composition rule for the builder** — not four sets of one texture; candidate
   refinement is Black for the set that inverts the board.
4. **Then real runs, judged in the existing review loop** — the machine's arrowless sets have
   never been seen, and only Max's judgement says whether they are any good.

**Reconsider-when:** a third and fourth board fail to reproduce the effect, **or** pipeline
boards built to the rule draw the opposite complaint (incoherent, four unrelated puzzles
sharing a theme) — at which point the unifying force is too weak and the theme has to do more
work.

### D-3 amendment — the two-axis vocabulary, and the pipeline taught it (2026-08-04)

**The goal, in Max's words, which every change serves:** *a puzzle unified by theme and words,
varied in execution by different kinds of relationships.* Sixteen words that feel like one
world; four sets that feel like four different questions about it. A line to walk, not a dial
to max — the two failure modes are the arrow boards (too unified in kind) and four unrelated
puzzles sharing a title (too varied).

**Research grounding (docs/research/semeval-2012-taxonomy.md, appendix):** Herrmann & Chaffin's
Relation Definition Theory (1984) — same authors as the adopted taxonomy — decomposes relations
into ~30 elements and shows element agreement predicts *felt* relation similarity (r = .707)
while family membership alone leaves variance unexplained (partial r = .355 with family held
constant; part-whole weakest at r = .329). Max's playtests reproduced this: the four-family
kitchen board felt like one question; the three-family night board felt like four. **Family
does not carry felt variety; the kind of question does.**

**What was adopted, decided over 2026-08-04's session:**

1. **`rule-007` eliminated** (D-3 authorised a reword; Max chose removal). Retired in
   `rules.json`, never deleted — provenance records the two experiments that refuted it. Its
   real intent (B must be a thing, never an adjective) is enforced by the vocabulary's
   contents instead of by a rule. *Accepted risk:* nothing else forbade `Gulf Stream : warm`
   in the gap before the vocabulary landed (same session — the gap never shipped).
2. **The controlled vocabulary** (`studio/corpus/relationship-index.json`, v2.0): 36 relation
   types from the Bejar taxonomy, each carrying **family** (coverage axis) · **stance** (the
   kind of question — composition axis) · paradigm pair · named failure mode · its Chaffin
   elements for audit. Adjective-shaped types are absent by construction; families 5 and 6
   excluded (their thing-shaped types add only stances covered three other ways, and their
   vocabulary runs against rules 004/012). Legacy 13-shape ids resolve through aliases so
   history stays countable — the field was free text, leaving **40% of pairs uncountable**.
3. **Eight stances** — inclusion · possession · absence · dimension · event · cause ·
   reference · time. `absence` is separate from `possession` because the verification test
   demanded it: with them folded together, Night B (`Moon : Crater` + `Shadow : Weight`, both
   PART-WHOLE) would have failed its own rule. The **portable five** (inclusion, possession,
   event, cause, time — reachable from 4+ families) are what quotas draw from; `reference`
   reaches one family and is never required.
4. **Composition enforced at every door, creation first** (the repo's recurring scar is a rule
   at one door only): stance quotas in every brief (both drivers, themed and surprise-me) →
   pair author validates its own pool is **groupable** → grouper floor (≥4 stances or the
   retry is told to re-read setAside) → 04a gate rejects a board whose four sets repeat a
   stance, naming them.

   **Corrected 2026-08-05 — the quota was at the wrong granularity.** A set is two pairs
   sharing **one relationship**; a stance is a **category** of relationships. The original
   check counted stances across all pairs, so a pool could satisfy the quota completely and
   still be ungroupable — the `paris` run spanned all four stances using eleven shapes exactly
   once each, and the grouper searched until it truncated at 40,000 tokens. Across three real
   runs the correlation was monotonic and explosive: relationships carried by ≥2 pairs of
   **7 / 3 / 1** gave grouping times of **18s / 129s / truncation**. 01 now requires **four
   relationships each carried by two pairs, spanning four stances**, and names the orphaned
   shapes on rejection. Verified on the failing theme: `paris-retry` fell from 40,000 tokens
   truncated to 1,392 tokens in 12s, at half the cost. The three real pools are pinned as
   tests. **Family is never enforced at board level** — it would reject Night B,
   and both the playtests and the 1984 partial correlation say it is the wrong axis. It stays
   the coverage axis: the brief steers toward underused families, spreading requests across
   them.
5. **Unity scored, never gating:** stage 08 (now Sonnet) judges whether the sixteen words read
   as one world — strong/adequate/weak with named outliers, a weak verdict that names no words
   is invalid output. Shown on the review card beside the board; Max stays the authority.
   **The card teaches while it shows:** each set carries its stance, paradigm pair and failure
   mode, so more kinds of output widen Max's checklist instead of outrunning it.
6. **Pipeline structure: quotas now, merge armed.** The stage skeleton holds. The 01+02
   set-first merge (relationship-first generation, parked in the backlog) stays parked behind
   a named trigger: **if stance-floor retries at 02 fire on most runs after this lands, the
   pre-agreed fix is the merge** — which also deletes the stage where three recent failures
   lived. One variable at a time, so the next judged runs can attribute their result.
7. **Shakedown profile `2026-08-04-taxonomy-shakedown-2`:** lean-2 was measured against the old
   asks. 01 → high; 03/08 → Sonnet at medium (the rater has never returned a 4 and now
   weighs stance; 08 carries a taste call). Ceilings raised, not removed (Max: never shut a
   run down mid-test): stage 15 min / 600k tokens, attempt $20, run $60 — ~40× expected
   spend, still catching a wedged loop. **Slim-down trigger: ~10 judged boards under this
   profile**, then the lean-2 measurement pass again, caps and effort reverting together.

   **Corrected 2026-08-05 — `02` was raised to high here and it was wrong.** It truncated the
   first real run (`beach`) at 16k, then at 24k, for $0.71 and no board. Three findings, all
   available before the run: 02's own six-run medium baseline was 3,756–4,435 tokens for a ~4k
   JSON answer; `high` is fine on non-combinatorial stages (06 never truncates at high); and
   the justification given — "02 composes under a stance floor now" — was backwards, since the
   stance work had been moved *upstream* into 01's quotas, which the failed run confirmed
   (01 delivered exactly the four quota'd stances). This is the same failure mode 04 came down
   from xhigh for. **Also recorded: the wrong ceiling was raised** — `limits` bounds a runaway
   run; `maxTokens` is the per-request ceiling thinking shares with the answer, and it was left
   at 16k. *Open, deliberately:* at medium 02 still returned 13,645 tokens (85% of that
   ceiling) on the retry — n=1 at a stage with documented 4.5× variance, so a signal to watch.
   If it truncates again the lever is cutting 02's work (it is shown all 36 vocabulary entries
   though its candidate pairs already carry shapes), not a bigger number — `llm.js` is
   non-streaming with a 300s timeout, so the transport binds before the token ceiling does.

**A known limit, pinned as a test rather than papered over**
(`test/studio/pipeline/stance-composition.test.js`): round 1's kitchen board declares four
stances under this vocabulary (conversion, object-instrument, time-activity, sign-significant)
yet Max read it as one arrow. Stance is a per-shape proxy for the felt arrow; word choice can
defeat it. The gate catches monostance boards; the review card showing claimed stances is what
covers the rest. If a refinement ever makes the machine agree with Max about that board, the
test's assertion flips knowingly.

**Verified:** 771 tests green · retired wording proven absent from all eight agent prompts
(read from disk, not inferred from the filter) · the machine reproduces Max's blind round-2
verdicts (Night A refused at the grouper, Night B completes) · a mock run rendered in the
Review Studio with stance lines + unity header, and its board played through the game's own
controller.

**Reconsider-when (this amendment):** D-3's own trigger stands, plus — the grouper's stance
floor fires on most runs (→ the 01+02 merge), or the kitchen-board limit starts biting on real
boards (Max repeatedly rejects stance-diverse boards as "all the same"), at which point the
proxy needs word-level teeth, not more prompt.

### D-4 — The feedback instrument, rebuilt around how Max judges (2026-08-05)

**What prompted it.** Two boards (`paris-retry`, `spy`) were rejected as *wholes* while three
of four sets on each drew praise — and the form could not say that. Analysis of all **141
feedback events** found the instrument drifting from the judgement:

- **21 of 79 tagged set-events record `reject-set` while carrying only praise**, including sets
  Max called *"a great green"*. The board button stamped its action onto every set block.
- His richest signal was prose: 103 notes averaging 112 characters, carrying **fix proposals 6×**
  (two of which became rules 011/012), emotion 10×, solve order 5×, cross-set comparison 14×.
- Three tags had never been used; the vocabulary was seventeen undifferentiated chips.
- **Stages 05/06 had already found both defects he found** — 06 named the Louvre/Museum
  collision almost in his words — and nothing routed that anywhere.

**Max's rule, now the design law of the form:** *a board rejection means something prevents the
whole puzzle from being publishable; the individual analogies still get honest independent
reads.* Severity and quality are different questions — standard playtest triage, and the same
publishability line NYT Connections' editorial process draws.

**What was built.**

1. **Board verdict, tri-state:** publishable · **publishable after a fix** (naming the blocking
   sets) · not publishable. The middle state is what the corpus kept producing with nowhere to
   put it.
2. **Set verdicts, decoupled:** `set-publishable` / `set-needs-edit` / `set-replace`, chosen per
   set and never inherited. The inheritance bug is dead and guarded by a regression test.
3. **"How would you fix it?"** is its own field — his highest-value habit, promoted from prose
   to a queryable place, and the Revision Proposer's primary input.
4. **Tags grouped by kind**, positives as a scorecard row. **`not-always-true` stays split**
   from `relationship-does-not-click` despite four boards of disuse: the split is one day old
   with its reasoning recorded, and Max's own ruling is that silence is weak evidence. What was
   missing was findability, not vocabulary.
5. **Play telemetry**, riding the existing view contract — a recorder is a view that renders to
   a data structure — so solve order, mistakes and so-close events are captured with no change
   to the game and no extra clicks. First completed playthrough only; a replay is not a first
   read. Observed behaviour outranks recalled opinion.
6. **`formVersion` on every event.** Boards judged under two instruments are two populations;
   rubric compilation segments on this rather than guessing from dates. Under version 1 a set's
   `action` is untrustworthy — its tags and note are not.
7. **The Revision Proposer** (see below).

**The corpus is now under version control.** `studio/runs/.gitignore` was `*`, so all 141
events existed only on one disk. `feedback.jsonl`, `decisions.jsonl`, `board.json` and
`manifest.json` are versioned; machine output stays ignored. A test replays every historical
event against the current schema, so a change that orphaned one fails loudly.

### D-5 — The Revision Proposer, and its graduation trigger (2026-08-05)

**Why:** Max was re-deriving by hand what the pipeline had already written down. It is a pure
agent held to the same contract as the eight, but **deliberately not a pipeline stage** — it
runs once at review time.

**Authority ordering, and the reason for it:** his judgement is read **first**, the evaluators'
findings second. On the paris board 05 failed and 06 flagged `[high] unfair` the set he liked
*best*; an agent keyed to machine findings alone would have "fixed" what he loved. Every set he
praised is named untouchable in the brief.

**It proposes, never authors** (the D-1 guardrail). Output is a brief for the existing
`requestRevision` machinery, **editable in place** before sending.

**Triggered by "publishable after a fix" only.** `rejected` is a terminal status leading only to
`archived`, so a brief offered after a hard rejection proposes a revision that cannot be
requested. The middle verdict therefore *saves* rather than decides, leaving the run in
`awaiting-review`. Approve and reject spend nothing.

**Graduation trigger (Max's stated aspiration, gated on evidence):** every brief records a
`proposal-verdict` — accepted / **edited, with the text** / discarded. The edit is precisely
what the proposer got wrong. At **~10 briefs with verdicts recorded**, evaluate agreement; if he
is accepting them substantially unedited, propose the bounded auto-revise loop then.

**Three architectural corrections the storage layer forced, all of them right:** run-store
refuses an unregistered stage id, and refuses any write into a completed attempt ("completed
work is never rewritten"). An attempt directory records what the *pipeline* did; a review-time
brief is not that. Proposals are run artifacts beside `feedback.jsonl`, written through the new
`writeRunArtifact` — run-store stays the only writer.

**D-5 amendment — a brief that never arrives says so (2026-08-07).** `proposeRevision` had two
ways to come back empty and recorded only one of them: a throw wrote a failure artifact, while
"the model answered twice and neither reply was valid" was a bare `return null`. Both produced
the same blank page, so **an absent brief and a failed one were indistinguishable** — which is
how the 2026-08-06 Harry Potter proposal became unknowable by construction. Now **every path out
that returns null writes `revision-proposal-<attemptId>-failure.json`** through `run-store`,
carrying the category, each round's validation errors, the prompt, and **the model's last raw
reply** — the field whose absence is what made that case undiagnosable. `GET
/api/runs/:id/proposal` gives four distinguishable answers rather than three (brief · `working`
· `failure` · nothing attempted, the last omitting the key entirely), a brief outranks a stale
failure record beside it, and the review page names the failure instead of showing silence.
`Request revision` stays clickable in that state **by design**: a brief that is never coming must
not deadlock the button that exists for exactly that case. Nothing here may be fatal — the
recorder itself cannot throw, because saving Max's feedback is the irreplaceable half of the
transaction. No change to the graduation trigger above; a failed proposal still records no
`proposal-verdict`, it just stops being invisible.

### D-6 — Approved boards reach the game, and the id they carry (2026-08-05)

**Why now:** the rubric loop had produced faster than the project could absorb. Four approved
boards were sitting in run directories with nowhere to land while `puzzles/` still held only
the two hand-authored boards, and Phase 5 needs 10+. This is HR-2's named deferral coming due.

**No translator, because there is nothing to translate.** A run's `attempts/NNNN/board.json` is
already schema v1.0 — `tools/check-board.js` passes a candidate board unmodified. Publishing is
validate-then-write plus one decision: the id.

**A second write seam, deliberately.** `studio/storage/puzzle-store.js` is the only module that
writes into `puzzles/`, beside — never inside — `run-store.js`. They are separate because they
answer to different laws: a run directory is the Studio's own record, while `puzzles/` is what
the shipped game loads and what `test/content/board-integrity.test.js` re-gates on every
`npm test`. The gate therefore lives in the store rather than in callers: the board is checked
with the **game's own** `validatePuzzle` and `checkBoard` before a byte is written, a refusal
writes nothing at all, and the slug is pattern-matched before it is joined onto a path.

What the sweep actually guards, stated honestly: a board that passed schema v1.0 has four sets
of sixteen distinct words, so 16/16 acceptance is arithmetic and no board defect can fail there.
The sweep is kept because it samples the real `engine.submit()` — if the engine ever widened
acceptance, publishing stops rather than shipping boards whose answers changed underneath them.

**Publication is recorded, not transitioned.** The run stays `approved`; `approved → archived`
remains the only move out of it. The record lands in `decisions.jsonl` beside the approval it
followed, and it doubles as the republish signal — a run may replace its own file, while another
run claiming an occupied slug is a 409.

**The id comes from the board's TITLE.** Max first chose the theme slug; publishing the first
board showed why that is wrong. A run slug is a *lifecycle* name — `beach-retry` records that
the first beach run truncated — and the published id is the key Phase 5 will persist per-puzzle
results under, so renaming it later orphans saved progress. The precedent settled it:
`asto-first-light` is derived from the title "First Light". The derivation lives in
`studio/slug.js` and is **served to the review page**, so the destination shown before the click
is the destination — the same reasoning that put the stage list in `stage-registry.js`. It
replaced three drifting copies of the same function.

**Provenance stays out of the puzzle file.** Schema v1.0 is locked, and a published board must
be indistinguishable from a hand-authored one. Which run it came from — and the model's original
id — live in that run's `decisions.jsonl`, where the rest of its history already is.

**A bug this uncovered, fixed before it could bite:** `variety.js` counted any board in
`puzzles/` without a `SHIPPED_LABELS` entry as `unknown`. Publishing four boards would have
added sixteen to the tally the variety brief reads, while their shapes were already counted
through their runs. The `puzzles/` walk now counts only the hand-labelled boards it was written
for. Measured against the real corpus after publishing: published boards contribute 0.

**Reversibility is git**, not an un-publish route ([[version-control-for-agents]]): a published
board is a file in a commit, and removing one is a revert plus a deletion.

### D-7 — The two axes the pipeline was missing (2026-08-05)

**What prompted it:** Max ran six boards in parallel and approved none — three rejected, one
failed, two left in revise. The worst batch since the taxonomy work, and the most useful,
because the complaints were consistent enough to name causes.

#### An instruction is a request; a check is not

The finding that set the method. I read the actual `prompt.txt` that produced the cars defect.
**All twelve compiled editorial rules were present verbatim**, including rule-010 (*"check
whether any four of its words form another valid analogy"*), rule-011 (*"B must follow from A
necessarily, not occasionally"*) and rule-008 (same grain). All three were broken. And that was
the **revision** attempt, whose notes *also* named the specific defect — and it returned
`ignition : shutdown :: departure : arrival`, the identical four words.

So: **validity defects get a mechanical check, not a thirteenth rule.** Taste keeps using
instruction, because nothing else can judge it — but even there the output is a scored, visible
verdict rather than an exhortation.

#### The cross-reading check

Six of six before-after / sequence sets in the batch were rejected; two were outright fairness
bugs. `ignition : shutdown :: departure : arrival` also reads `ignition : departure :: shutdown
: arrival`, and because the engine refuses that reading, **a player who sees it is marked wrong
for being right**. `board-integrity.js` says in its own header that exhaustive search cannot
catch this (risk 1): the sixteen words *are* distinct, so the sweep sees a clean board.

`crossPairings` (in `src/engine/arrangements.js`, beside the accepted-order algebra it is the
complement of) enumerates the two refused groupings of a set's own four words — four words
admit exactly three pairings, so this is finite, deterministic and pure. `06` receives them as
a checklist with one closed question each, and its validator refuses an answer that skipped
one, invented one, or answered one twice. That required the pipeline to hand a stage's **input**
to `validateOutput`, which it never did: a validator that cannot see the question can only
check that the answer is well-formed.

**It reports; it does not gate.** Measured first, because "just enforce the validator" was the
obvious move and the numbers refute it: `05`'s `boardPasses` is **false on 31 of 36 attempts
ever (86%)** and agrees with Max on **13 of 24 sets (54%)**, flagging 4 he called publishable
and missing 7 he rejected. A signal that fires 86% of the time cannot gate anything.
**Reconsider-when:** if the cross-reading check agrees with Max's `valid-but-unfair` /
`order-ambiguous` calls across roughly the next six boards, promote it to a blocking check at
`04a`. It earns its gate the way D-5's auto-revise does — on evidence.

The stance is not cursed, and the check must not be read as condemning it:
`planting : felling :: budding : withering` drew *"I felt especially good about this one."* The
difference is whether the cross-pairing is *also* strong, which is exactly the question asked.

**And it did not work the first time.** Replaying it over the six judged boards — the step that
exists because Max's verdicts are an answer key — three of six came back **unparseable**, two
failed validation, and the one that validated missed the defect he had found. Diagnosed on a
single board: **`stop_reason max_tokens`, 16,000 output tokens, zero characters of text.** The
whole budget went to thinking.

I had made 06 combinatorial and left it at `high`. That is the **third** time this repo has met
that failure — 02 died on the `beach` run at high, 04 came down from xhigh with *"94% of its
billed output was thinking behind an 876-token answer"* — and `pipeline-config.js` was already
carrying both notes when I walked into it. The lesson generalises past any one stage: **raising
effort on a stage whose ask has just become combinatorial does not buy convergence, it buys
silence.**

Fixed by shrinking the ask rather than raising the ceiling: checklist lines carry short ids
(`set-b#1`) which the answer echoes instead of retyping four words — the old shape invited the
model to send back the formatted *string* it had been shown, which is what it did — and a `note`
is required only on a reading that HOLDS. Then 06 came down to `medium`, which its pinned test
had forbidden for a good reason (*"the last thing between a flawed board and Max's time"*) that
a stage returning nothing outranks. Same board after: `end_turn`, 6,234 output tokens, all eight
readings answered.

**And then it still did not work.** Three measured rounds over the same six boards:

| round | caught | spurious | behaviour |
|---|---|---|---|
| 1 — high effort, verbose shape | — | — | 3 of 6 unparseable, 16k tokens of thinking, no text |
| 2 — compact shape, medium | 1 of 3 | 13 | flags any tidy 2×2 grid as an analogy |
| 3 — round 2 plus an anti-grid instruction | 0 of 3 | 2 | quiet, and misses what it was built for |

Round 2's every false flag had one signature — *"guitarist and drummer are parallel musician
roles"*, *"song and album are parallel categories"* — the model calling **symmetry** an analogy,
which is precisely what round 2's prompt already told it not to do. Round 3's sharper wording
fixed that and over-corrected into silence.

**Conclusion, recorded rather than papered over: the mechanism works and the judgement does
not.** The enumerator is exact, deterministic and pins both real defects as tests; the checklist
plumbing forces a complete answer and no longer truncates. What is not reliable is the model's
answer to the question, in either direction, after two honest attempts at the wording. It ships
**quiet** (round 3) — advisory, folded shut, ~2 false flags across six boards — and it is
**nowhere near a gate**. The reconsider-when above stands, with its bar restated: it must catch
the defects Max describes in prose before it is trusted with a veto.

#### The tag that turned out to be three tags

Building the answer key exposed something about the corpus itself. `valid-but-unfair` is Max's
catch-all for *"technically works but the player gets cheated"*, and across this batch it covers
at least three unrelated defects: **a cross-reading also works** (cars, grateful-dead — he
writes the reading out verbatim), **the claim is overgeneral** (*"not every crew contains a
mason"*, *"many kinds of workshops"*), and **the set is simply weak** (*"technically works
but… boring"*). My first score conflated all three and reported eight misses where the narrow
answer key holds three.

That matters beyond this measurement: **the rubric compiled from this corpus will conflate them
too**, and no automated check can be scored against a tag that means three things.

**Split with Max the same day.** Reading the form changed the shape of the fix. The chip's own
description was *"technically correct, but the player could not have known"* — a **fourth**
meaning, and one he had never used it for. Sorting the nine uses:

| what he meant | uses | chip that already covered it |
|---|---|---|
| the same four words regroup into a second analogy that also works | 4 | **none — the real gap** |
| the claim is only sometimes true | 2 | `not-always-true` |
| technically valid but flat | 3 | `not-evocative`, `weak-explanation` |

So the work was **one precise tag and one retirement**, not three new chips — `second-valid-reading`,
in the *fairness* group, where the vague one had been. Note that `order-ambiguous` is not the
same thing (*A : B reads like B : A*, a direction problem); Max reached for it on the cars board
because it was the closest available, which is itself the evidence for the gap.

**Retiring is subtraction from the form, never from the record.** `schemas.js` already carried
the rule — *"APPEND ONLY. A removed tag would orphan the events that already carry it"* — so
`valid-but-unfair` stays in `QUICK_TAGS` and validates forever; a new `RETIRED_TAGS` set is what
keeps it off the form. `FEEDBACK_FORM_VERSION` moved to 3, because the **absence** of that tag
now means something different before and after this line, and rubric compilation has to segment
on it exactly as it does for version 1's untrustworthy `action`.

Why retire rather than keep a catch-all: a vague chip beside precise ones collects everything.
That is the same failure that left `not-always-true` unused for four boards while Max ticked
`relationship-does-not-click` and wrote the necessity argument in prose underneath.

#### Evocativeness, and Max's correction to it

`not-evocative` was the top tag at **15 uses across four boards**, and the word appeared in **no
agent prompt anywhere**. Stage 08 rated the board Max called *"an absolute snooze"* as
**`unity: strong`** — *"every word sits comfortably inside one coherent world"*. Both readings
were correct: **unity and evocativeness are orthogonal**, a board of a subject's most obvious
nouns is perfectly unified *by construction*, and only one axis was being measured.

**Max's correction is the load-bearing part.** I framed it as one axis, generic ←→ obscure, with
the target in the middle. He corrected it: *obscurity comes from overgeneralisation too*, and
his own notes prove it — *"so boring and **unspecific** the puzzles barely make sense"*, and
*"Theres many kinds of **workshops**… if you had said **woodshop** : carpentry, that would have
worked a lot better."*

So one root cause produces three complaints. A word chosen too general is **boring**
(`not-evocative`), **untrue** (`valid-but-unfair`, `not-always-true` — *"to state that every
crew contains a mason?"*), and **vague** (`too-obscure` — of the batch's six uses only "squit"
was an esoteric word; the rest were vagueness). His fix is always the *more specific* word,
which repairs all three at once.

The instruction is therefore not "be evocative" but **"prefer the most specific word your
reader will still recognise"**, with all three failure modes named — and the rarer opposite
failure named too, scaled to difficulty: an easy set wants words anyone knows, a hard set may
ask for the word an enthusiast knows, never one they would look up. `01`'s theme line stopped
being `Theme to work within: X`, and its *"prefer familiar words"* line stopped saying
*familiar* when it meant *recognisable* — common is exactly the generic middle.

`08` scores the result beside unity, naming the flat words and the sharper ones. Shown, never
enforced — same treatment as unity, and for the same reason.

#### The Revision Proposer worked and lost to the button beside it

`cars` produced the first brief ever, and it was right: correct root cause (pair selection, not
layout), correct re-entry stage, three candidate fixes, and the three praised sets listed under
`doNotChange`. It was never sent. The plain "Request revision" button answered first, carrying
raw tag-and-note text and no protection list — so the revision churned the three good sets and
reproduced the defect. **Zero `proposal-verdict` events existed in the whole corpus**, which is
the only thing D-5's graduation trigger was ever waiting on.

The button now defers to the brief when one exists or is being written. It does not send the
brief silently in its place: Max still accepts, edits or discards it, because an inferred
verdict is not evidence.

#### And the evaluators moved to the sets they are about

`05` and `06` had been describing these defects in prose for weeks, filed by stage in a
collapsed panel at the foot of the page — so Max rediscovered them by playing the boards. Their
findings are per-set, so they now render on the set card, **folded shut**: the review loop
exists to capture an unbiased first read, so the machine's opinion is one click away rather
than in the way.

### D-8 — Two kinds of hard, and why the pipeline could only make one (2026-08-05)

**What prompted it:** Max ran seven boards and judged five. **Five approved, zero rejected**
— the first batch with no rejections at all. And: *"while these are publishable, i didn't
get the same rush or joyous reaction as a few of the earlier puzzles."* He asked whether he
was simply going numb.

**He was not, and his own scoring is the proof.** Praise-tags per set went 1.43 → **3.15**,
and 15 of 20 sets scored all four — the *"this is ASTO"* signal `feedback.js` records as
having been earned by only two boards ever. `not-evocative` **15 → 0**, `too-obscure`
**6 → 0**, `valid-but-unfair` **9 → 0**. Numbness shows up as lower scores. Craft went up
while delight went down: two axes, and the gap between them was the work.

#### The diagnosis, after two corrections from Max

My first reading was that the naming set had moved into the Black slot, so forbid that.
Max: *"they can both be black, depending on the puzzle. I don't want to fall into a
repetitive hole where only one type of puzzle is one difficulty."* The data agreed with
him — this batch's Blacks were the **more** varied five shapes, against a-tree and birds
both running `before-after`. A placement rule would have swapped one predictable pattern
for another.

Sorting every set in the batch by where its difficulty came from found the real gap:

- *ordinary words, surprising arrangement* — `start line : finish line :: clip in : clip
  out` — present, and **always easy** (Max: all four praise tags **and** `too-easy`);
- *rare words, ordinary arrangement* — `coronagraph : glare`, `speleothem : stalactite` —
  present, and **always the hard end**.

Nothing in the batch was a plain-word set that was genuinely difficult. That is exactly
what a-tree's Black had been — `planting : felling :: budding : withering`, four words a
child knows — and Max's note on it names the mechanism: *"the opposite arrangement makes
this analogy stand out from the rest."*

**So the gap was a missing capability, not a misplaced set.** Difficulty and vocabulary had
become the same lever. I caused part of it: the specificity instruction from D-7 said a
hard set *"may ask for the word an enthusiast knows"* — one route up, and the pipeline took
it every time. His tell, written twice: *"someone with cycling knowledge would probably be
stoked."* He handed the delight to a hypothetical expert.

#### The change: every agent that held a lever

Max asked which agents could proliferate the fix rather than loading it all onto 01. Two
were working against it:

- **03, the difficulty rater** — told to judge *"clarity, abstraction, **familiarity** and
  misdirection"*. To this agent a rare word simply **was** difficulty; the conflation was
  in the measurement, not only in the authoring. Familiarity still moves a grade, but every
  graded set now reports `difficultySource: arrangement | vocabulary | both`, enforced by a
  semantic check.
- **04, the board builder** — *"the hardest set you have becomes the Black"*, ranking by a
  number that already had rarity folded into it. It now receives the source, is told a
  board reads best when its difficulty does not all come from one place, and records
  `blackSetReasoning`. **Guidance, not a rule** — decision 3 below.
- **07, the test player** — a model, so it knows what `speleothem` is and plays a
  knowledge-gated set as though it were open. The one agent whose job is *"how does this
  feel to play"* could not detect the defect Max found by playing. It now plays as a
  general-audience solver and reports `knowledgeGated` words. Blind by construction still:
  it names words, never sets, and the review page maps word → set as it already does for
  06's findings.
- **02, the theme grouper** — chooses which sets exist at all, so anything it sets aside is
  gone. Told that an arrangement-hard grouping is the scarcer resource when candidates
  compete.
- **01, the pair author** — both routes named as a palette, and one requirement about
  *range*: at least one matched group must be hard through arrangement alone. The
  recognition-scales-with-difficulty clause is gone.

#### Variety by steering, never by rule

Max's constraint, and the reason none of this is a gate: *"we need to create and arrange
our agents in ways that allow for flexibility… variety is an important part of puzzle
games. If it becomes too predictable, it's no longer fun."*

So `variety.js` gained a second dimension beside shape usage: **how each board's hardest
set earned its difficulty**. The brief leans against a rut — three boards in a row topped
the same way — and says nothing otherwise. A mixed history produces no steer at all, which
is pinned as a test, because a rule reserving Black for one kind is the failure this whole
decision exists to avoid. Themed runs now receive that steer too (they had never received
anything from the index but stance quotas), while `relationshipShapes` stays the
surprise-me marker.

**Honest limit of the fallback classifier.** For the thirty-odd boards graded before 03
reported its source, the index falls back to the shape — the three `inclusion` shapes whose
only lever for extra difficulty is a rarer name. Replayed against Max's verdicts it gets
all four boards he loved right and **only 2 of the 5 he found flat**: `coronagraph : glare`
is `prevention` and `perihelion : orbit` is `sequence`, so the shape cannot see that the
words are rare. That is precisely why 03's own judgement is the primary source and the
shape is only the fallback.

#### What was deliberately not done

- **The game rules are untouched.** Max: *"you don't have to solve every puzzle to have
  fun. The challenging nature is what pushes people to want to try again."* `so-close` still
  costs a mistake and the cap is still four. Recorded because the data tempted otherwise:
  **0 wins in 8 recorded playthroughs**, every one ending at four mistakes, and on `cars`
  all four mistakes were so-close. He loved boards he may also have lost, so losing is not
  what kills the joy.
- **No third style-guide verdict.** 08 returned `evocativeness: strong` on four of the five
  boards Max said did not thrill him. It is not wrong — they *are* on theme — it simply
  does not measure delight. A third score would be a third thing agreeing with itself,
  which unity demonstrated and evocativeness has now repeated.
- **Nothing in the `04a` gate.** A gate is a rule, and every rule here becomes the
  predictability being avoided.

**Reconsider-when:** if a fresh batch still arrives with every board topped the same way,
the steer is too weak and the lever moves upstream to the stance quota — `inclusion` is
quota'd on every run and is where all three nameable shapes live, which is why 8 of the 9
boards before this carried exactly one naming set.

### D-9 — Order is the game, so order has to be fair (2026-08-06)

D-8's steer worked. The first batch built under it varied its Black slot's difficulty
source for the first time — `both`×3, `vocabulary`×3, `arrangement`×1 across seven boards —
and `maps` became the first board ever to top out through arrangement alone
(`needle : compass :: satellite : GPS`, four ordinary words). Max: *"This was a great
puzzle! this one felt fun and challenging."* Four boards approved, four published,
`puzzles/` at 10. The rater also returned a 4 four times, which the backlog had predicted
would stop happening.

**And the same batch surfaced a defect that had been hiding inside the win.**

#### The finding

Across **13 recorded playthroughs there are 0 wins**. That alone is not news — D-8 recorded
it and Max's call, *"you don't have to solve every puzzle to have fun"*, still stands. What
is new is *how* the losses happen once you sort them:

| board | sets solved | mistakes | of which so-close |
|---|---|---|---|
| Yankees | 3/4 | 4 | **4** |
| cars (2026-08-05) | 3/4 | 4 | **4** |
| maps | 3/4 | 4 | 3 |
| Harry Potter | 3/4 | 4 | 2 |

On **Yankees Max never made a wrong grouping.** All four mistakes were the right four words
in the wrong order. He wrote of that board *"I'm not familiar with the yankees but was able
to get all except the most trivia heavy one, which is right where we expect to be"* — but
the trivia set is not what beat him. Ordering was.

#### The cause is structural, and the engine is not wrong

The four accepted orders are `[A,B,C,D] [C,D,A,B] [B,A,D,C] [D,C,B,A]` — so flipping **both**
pairs is accepted and flipping **one** is a mistake. That consistency requirement costs
nothing on `dawn : dusk :: birth : death`: time runs one way, and a player mirrors it
without thinking. On `Ruth : Gehrig :: Mantle : Maris` there is no arrow at all, so the
player must guess the author's orientation and then match it in the other pair. Half of
them guess wrong, and lose a mistake for having the answer.

That set's shape is `coordinates` — *"two counterparts of the same kind, side by side"*.
The taxonomy had already half-said this: `directional`'s failure mode reads *"fails when the
two orders read the same"* and `synonymity`'s reads *"near-synonyms make the order feel
arbitrary"*. The property was described before it was named.

#### Two framings, and Max's call

The question put to him was whether this is a **fourth `difficultySource`** — a third kind
of hard beside arrangement and vocabulary — or a **defect to catch**.

He chose **defect**. The reasoning: if the player had the insight and lost anyway to a coin
flip, that is not difficulty, it is unfairness — which is what his own (never-yet-used)
`order-ambiguous` tag has always meant. A difficulty source gets labelled and balanced; a
defect gets reported and, eventually, refused.

#### Built — three independent signals, none of them gating

- **The taxonomy names the property.** Four shapes carry `symmetric: true` —
  `coordinates`, `synonymity`, `directional`, `contiguity` — each with a one-line reason,
  pinned by a test because it is a judgement about meaning, not a derivation. `reverse` and
  `before-after` were considered and rejected: *undoes* and *before* both carry a direction.
- **04a computes the flags.** Arithmetic joining the board's sets to 02's declared shapes,
  exactly as the stance check already does. `enforced: false`, absent from `reasons`.
- **06 answers the one question structure cannot** — do the words themselves settle it?
  Enumerated as closed questions with every-line-answered validation, the same discipline
  the cross-reading checklist got a day earlier and for the same demonstrated reason: **06
  already had an `ambiguous-order` finding kind and returned nothing at all on Yankees or
  cars**, the two boards where ordering took every mistake. An open hunt cannot see a
  structural property.
- **07 reports `orderGuessed`**, mirroring `knowledgeGated` exactly — words, never sets. A
  model does not experience a coin flip; it picks an order and writes a fluent rationale for
  it, so the agent whose whole job is *how does this feel to play* scored a coin-flip set as
  a clean solve. Asking it out loud is the same move D-8 made one rung earlier.
- **The Studio shows all three on the set's card**, and the test player's *simulated*
  so-close count beside Max's real one — the gap between them is the signal.

**Why it reports rather than gates.** `maps` is the proof: its `north : south :: east :
west` set is `directional`, so it is flagged — and it is perfectly fair, because convention
settles the order. Max solved it and said *"green made me smile."* A check that could fail a
board would have failed a board he approved and published. Only 06 can tell a coin flip from
a convention, and until the flags have been read against real playthroughs a veto here would
reject good boards on a proxy.

#### What was deliberately not done

- **The so-close rule is untouched.** It still costs a mistake. The fix is boards that do
  not coin-flip, not rules that forgive one. This re-affirms D-8's call on the same evidence,
  one batch larger.
- **01 and 02 are not steered away from symmetric shapes.** That is the mistake Max already
  refused once — *"they can both be black... I don't want to fall into a repetitive hole"* —
  and it would ban `north : south :: east : west` to catch `Ruth : Gehrig`. Report first.
- **No fourth `difficultySource`.** His call, recorded above.
- **Misdirection still has no home.** `dock`'s noun/verb trap on the sea board was graded
  `vocabulary`; the rater is told to weigh misdirection and cannot report it. Max called it
  *"a great misdirect"* — a strength, so no urgency. Parked in the backlog with the evidence.

**Reconsider-when:** across roughly the next six boards, compare the flags against
so-close-concentrated losses and against Max's `order-ambiguous` tag. If they agree, promote
the check to blocking at 04a. If a flagged set repeatedly plays fine, the symmetric list is
too wide — shrink it. Either way the answer comes from played boards, not from more argument.

### D-10 — The puzzle list is generated data, and its order is Max's (2026-08-07)

**Why now:** Phase 5's content bar was met at 10 boards, so the phase's remaining work was
the part players actually touch — a way to choose a board and a memory of how it went.

**The manifest is a file, not a directory listing.** GitHub Pages serves static files with
no index, so the game cannot discover `puzzles/*.json` at runtime; `puzzles/index.json` is
what makes the list possible at all. Shape: `{schemaVersion: 1, puzzles: [{slug, id,
title}]}` — deliberately minimal, because results live in `localStorage` and everything
else about a board lives in the board.

**Generated, but order-preserving — the one rule that matters here.** The array order is
the play order *and* the Next-puzzle order, which is an editorial judgement, not something
a directory listing should decide. So regeneration keeps the position of every slug that
still has a file, drops slugs whose files are gone, and appends genuinely new boards
alphabetically at the end. Max can reorder `index.json` by hand and a republish will not
fight him — pinned by a test, and used immediately: the default alphabetical build put a
hard medical board above `first-light`, which the tutorial hands off to, so First Light was
moved to the top by hand.

**Written only through `puzzle-store.js`,** which becomes the owner of a *second* artifact
under the same law that governed the first (D-6): the sole module allowed into `puzzles/`,
gate in the store rather than in callers, and a refused publish leaves the manifest exactly
as it was. `tools/build-manifest.js` (`npm run manifest`) is a CLI over that function, not
a second implementation — it exists for hand-authored boards and files removed by hand.

**The guard that earns its keep:** `test/content/manifest.test.js`, sibling of
`board-integrity.test.js`. It re-gates the committed manifest against the files on disk on
every `npm test`, so a board published into `puzzles/` and never listed — a failure that
looks exactly like success — is impossible from here on.

**Results are keyed by slug, and record the player's best day.** One `asto.results` blob:
one read paints the whole screen, one thing to forget on `clear()`. A win is never
overwritten by a later loss, and a cleaner win replaces a scrappier one. A corrupt blob
degrades to "no results" — the same law the tutorial flag already followed, extended to the
failure a boolean cannot have (JSON that parses into the wrong shape).

**Two boundary notes.** `ResultsRecorder` rides the controller's `views` array beside
`ScreenRouter`: `update(state)` is the hook the controller offers, and something that only
*reads* state cannot break the law. And `nextUnfinished()` is a pure function of the
manifest and the results, so the question "which board is next" is tested without a DOM
even though it is asked by a view.

**A deep link does not buy a way past the first-run tutorial.** GDD §5.2 forces the guided
board on first launch, so `?puzzle=<slug>` on a fresh profile decides what the tutorial
*hands off to* rather than replacing it. The slug is captured before the tutorial clears
the query string. On a returning profile it still goes straight in.

**One id was renamed, deliberately, while renaming was still free.** `slug.js` warns that a
puzzle id "can never be renamed without orphaning saved progress" — which is exactly why
`Bedside Manor: Four Medical Analogies` was shortened to **`Bedside Manor`** (slug
`bedside-manor`, id `asto-bedside-manor`) the same day the results store landed and before
anything shipped. The cost was zero then and rises permanently from here. Done *through*
`publish()`, so the rename re-ran the game's validator and the 43,680-tuple sweep instead of
hand-editing JSON. The old slug survives in that run's `decisions.jsonl` as `publishedAs`,
untouched: history records what happened, not what we later wished had happened.

**Two things done differently from the plan, both because the GDD said so.** Screen 6's
wireframe carries four tier dots per row, not a prose line — so a loss shows how far the
player got at no cost in words. And the GDD's own Screen 4 markup ink-fills **Next
puzzle**, so it took the primary slot from Share; when every board is finished it hides and
no pill is filled.

**The row ends in a coffee cup, not words (Max, same day).** A steaming cup on a solve, a
spilled cup on a loss, replacing the caps `CLEAN SOLVE` / `OUT OF BEANS` labels the
wireframe used. Coffee is already this game's entire vocabulary for how a board went —
mistakes are beans, a loss is *"Out of beans"* — so the cup finishes a metaphor the game
was telling in words, and it shortens a row where the two longest titles already wrap.
Steam is **static**: the no-list bans particles and pins motion at 120–180ms, and a looping
drift across nine rows is ambient motion nothing else in the game does.

- **Accepted cost:** a cup cannot say *how many* mistakes, so the list no longer
  distinguishes a clean solve from a scrappy one. Max chose this knowingly. It is not lost
  to assistive tech — the row's `aria-label` still says *"Solved with 2 mistakes."*
- **A PAPER cup, not a mug, and the handle is the reason.** The mug was drawn first and a
  mug on its side is unreadable at 24px: the handle swings over a rounded body and it
  renders as a **handbag**, then as a **heart** once the base was rounded to fix it. Three
  rounds of geometry only got it to "almost". Max's call was to switch to a takeaway cup,
  which has no handle to misread — it is an overhanging rim on a tapered cone, and the rim
  is what says which end is open whichever way up the cup is. That also let both states
  become literally the **same two paths**, the fallen one simply rotated 105° over a
  puddle: same size, same colour, one object in two poses.
- **What survived from the mug attempts:** the body must start *under* the rim, not below
  it — a hairline gap is invisible upright and reads as a detached stick once tipped. And
  the **puddle is the same brown as the cup**, dropped in opacity; a puddle lighter than
  the cup reads as a shadow rather than a spill.
- Recorded at this length because the elegant version was wrong three times in ways only a
  render showed. Nothing here was visible in the code.

**Reconsider-when:** if boards start being pulled often, the append-at-the-end rule stops
being enough and the manifest wants a real editing surface in the Studio (the un-publishing
gap already in the backlog). If the tier dots read as scoring rather than progress in the
playtest, they come off. And if losing the visible mistake count turns out to matter once
Max has lived with it, the fix is bean pips beside the cup — the header already draws them.

### D-11 — A revision has to be told what to revise (2026-08-08)

**The defect, and how long it was there.** `requestRevision` has written the editor's notes
to `revision.json` since revisions existed. **Nothing ever read them back.** Stage inputs are
assembled by `STAGE_INPUTS`, which saw only prior stage outputs and the manifest — so a
revision re-entering at `01-pair-author` was a **blind re-roll of the theme**: fresh pool,
fresh grouping, fresh board, with no idea it was revising anything.

**How it surfaced.** Max ran a six-theme batch on 2026-08-08 and said the same thing twice,
on bbq and on nintendo: *"i only asked for one small change in the previous puzzle and this
is an entirely new puzzle set. So thats something we should figure out."* Ground truth was in
the run directory — the bbq revision's `01-pair-author/prompt.txt` contained no mention of
`wrap:unwrap`, "too easy", or "Do not change". Both revisions were rejected, and nintendo's
re-roll reproduced the exact flaw the brief was fixing (off-theme filler), because nothing
told it there was a flaw.

**It also re-explains 2026-08-05.** The paris revision "churned the three good sets and came
back with the identical broken one", and that was blamed on the raw notes lacking a
protection list. The protection list was never the problem: **no notes were traveling at
all.** The entire brief apparatus D-5 built was writing to a channel with no receiver.

**The fix.** `revisionOf()` reads the attempt's `revision.json` and the parent's `board.json`
and puts them on the pipeline context beside `manifest` and `config` — the sibling of
`replayOutputs`, which carries forward what the parent *made* where this carries forward what
the editor *said*. One shared `renderRevision()` block in `agent-kit.js` leads the prompt of
the three generative stages: the parent board, the notes verbatim, and the rule that any set
the notes approve must survive unchanged and the board must not be re-themed or re-titled.

**Not on the blackboard, deliberately.** The obvious home was `blackboard.put('revision', …)`,
and the blackboard **rejects any key that is not a stage id**. That guard is right — the
blackboard is stage outputs and nothing else, which is what makes an attempt reconstructable
from its stage folders — so the revision travels as orchestration context instead.

**The evaluators (05–08) stay blind, by design.** An evaluator that had read the editor's
instructions would be marking its own homework: agreeing the asked-for change was made is not
the same as finding the board good. Pinned by a test.

**The test gap that hid it for that long.** `revision.test.js` asserted the notes were
*recorded*, never that they *arrived*. Recording passed the whole time. The suite now reads
the prompt the stage actually sent — the assertion that would have caught this on day one.

**Deliberately not built yet:** structural carry-forward of protected sets. The prompt-level
instruction plus the parent board is the smallest honest step. **Reconsider-when:** if a
revision with the notes and the board in hand still churns a set the notes named as approved,
the instruction is not enough and the protected sets need to be carried structurally rather
than asked for.

### D-12 — Four defects the 2026-08-08 batches exposed (2026-08-08)

Fifteen themes across two nights. Nothing here was designed; all four were found by running
the pipeline hard enough that its failure modes became visible.

**1. The truncation rescue: a bigger ceiling was never the fix.** Five themes died
identically — painting, shadows, bald eagle, sculpture, a rose — truncating at 16k, retrying
at 24k, truncating again. **~$0.62 each, $3.10 for nothing.** All five were narrow
single-subject themes; ensemble themes sailed through. The retry only ever raised the
ceiling, and what overran the ceiling was **thinking**: at `high` effort a narrow theme
reasons until the budget is gone and never gets to speak. `pipeline-config.js` already
documented this exact disease on 06 — *"At high… it spent all 16,000 output tokens on
thinking and returned NO TEXT"* — and the lesson had not been generalised.

The escalation retry now **steps effort down one rung as well** (`xhigh→high→medium→low`;
absent stays absent). First attempts are untouched, so nothing on the happy path gets
cheaper — this fires only where the alternative is a dead run. Proved against the real API
the same night: **`a rose` truncated at high/16k, then completed at medium/24k** using 6,229
output tokens, and produced a board the gate passed. Terminal failures also now keep the
model's partial reply as `response.truncated.txt`; all five dead runs threw theirs away, so
what they were doing with those tokens is unknowable.

**Reconsider-when:** if a board rescued at the lower effort reads flat to Max, the step-down
is too cheap and the answer is cutting 01's input (it is shown all 36 vocabulary entries)
rather than buying more thinking. If a stage ever legitimately needs more than 300s of
reasoning, the answer is streaming, not a bigger ceiling.

**2. The stale server is now visible.** A node process holds the modules it booted with. On
2026-08-07 the revision fix merged at 20:48, a server booted at 19:16 ran a revision at
20:00, the revision churned exactly as before, and the only reasonable reading was that D-11
had failed. It had not — it was not running. **A whole conclusion was wrong for want of one
line on a page.** `GET /api/config` now reports `startedAt` / `staleCode` / `codeChangedAt`
(newest `.js` mtime under `studio/` and `src/`, recomputed per call), and the review page
carries a banner above every view. Computed in `server.js`, not `api.js` — api.js does not
touch the filesystem.

**3. Self-matching pairs: reported, never gated.** Max, on a music board: *"i keep seeing
puzzles that include something really easy like 'fade in : fade out'. It seems too easy but
maybe that needs testing from other audiences."* The mechanism is not that the relationship
is easy — it is that **the tiles pair themselves before any relationship is read**. His own
verdicts imply a three-tier rule about PLACEMENT, not banishment:

- **One** self-matching pair is an on-ramp. He called cinema's `opening credits : closing
  credits :: greenlight : wrap` a set that *"should be studied"* — the second pair reaches
  from watching a film to making one, so the relationship still has to be seen.
- **Both** pairs self-matching makes the set free (music's Yellow: `load-in : load-out ::
  fade-in : fade-out`).
- A self-matching **Black** is miscalibrated by construction — bbq's `wrap : unwrap`, which
  he called *"way too easy for a black"*.

`studio/corpus/lexical.js` (pure) detects it: a shared whole token of ≥4 characters, or
containment with the shorter ≥4. Deliberately conservative — `sunrise`/`sunset` shares only
a three-letter stem (a shared *subject*, not a shared word) and does not flag, and
`ignite`/`extinguish` is semantic symmetry, which is **D-9's separate axis**. It reaches 03's
input, 01's prompt, and the review card via the 04a artifact.

**It gates nothing, and that is load-bearing rather than cautious.** Max has explicitly not
decided these sets are bad, and a set he admired carries one — a check that could reject a
board would be deciding a question he left open. It found something immediately: music's
Black `stage name : birth name` also self-matches on "name", which nobody had noticed.
**Reconsider-when:** if audience testing says these sets play as free, the flag graduates to
a difficulty cap; if he decides they are fine, it stays a note forever.

**4. Publishing warns when recorded edits would evaporate.** Publishing ships `board.json`
exactly as generated — hand-editing is B2, still deferred (HR-2). Fine limitation, terrible
silence: Behind the Scenes was published carrying a recorded difficulty change from 3 to 1
that vanished, the **fourth** occurrence (Ascent, bbq ×2, cinema) and the first anyone
noticed. `publishRun` now 409s with `reason: 'unapplied-edits'` unless the body carries
`acknowledgeUnapplied`, and the page confirms with every change named. Only the **current**
attempt counts — a request answered by a revision is not outstanding. It refuses publishing
*without knowing*, never publishing itself; Max is the editor. **Reconsider-when:** if he
starts acknowledging routinely, B2 has become due and should leave HR-2.

**Found while verifying, and fixed: a crash that had never once been seen.** Stage 06 answers
the cross-reading checklist **by id** — `{ id: "set-seasons#1", valid, note }` — and the
review page read `reading.setId` and destructured `reading.reading`. Neither field has ever
existed. Entries answered `valid: false` skipped before the destructure, so every board
rendered perfectly while the check found nothing, and **the first board where a check came
back true blanked the entire review page** — on the note the code itself calls the defect
that makes a board actively unfair. It stayed hidden because the check tuned itself into
near-silence (backlog) and because `machineNotesBySet` lived in `review.js`, which touches
`document` at module scope and therefore could not be tested in node. It is now
`studio/review/ui/machine-notes.js`, pure and covered — the same split, for the same reason,
as `board-html.js`.

### D-12 addendum — a teaching example must not be shaped like the deliverable (2026-08-08)

**What happened.** D-8 put a full set in 01's prompt to teach arrangement-hard difficulty:
`"planting : felling :: budding : withering"`. **`trees-tools-and-time`'s published Black is
that line verbatim**, and the rose board returned `planting : uprooting :: budding : wilting`
— a paraphrase, so no ban on the literal words would have caught it.

**The measurement that generalises it,** taken across all 15 published boards: the **36
pair-level examples** in the vocabulary block (`flower : tulip`, `moon : crater`) leaked
**zero** times; the **one full-set example** leaked immediately and then again. The variable
is not how vivid an example is — it is whether the example is shaped like the **deliverable**.
A pair illustrates a property and still leaves the model everything to do; a finished
four-word set is an answer, and an answer in the prompt comes back as output.

**The fix, and why it is not a prompt edit.** The example is *content*, so it became content:
`studio/corpus/examples.js` holds it once, pair-level, and 01 and 03 render from it — the
same discipline `vocabulary.js` already enforces for shapes, and the end of two hand-written
copies of one lesson drifting apart. The rendered line names the pair, the property, and
tells the author the pair is an illustration whose **near-synonyms** are also off limits;
that last clause exists because what actually happened was paraphrase, not copying.

**The rule is pinned as a class, over every generative stage** — 01, 02, 03, 04 — not as the
one instance that was caught (`no-full-set-examples.test.js`). Fixing two files would have
left the same mistake available in the other two.

**Generative only, and the narrowing is the interesting part.** Run over all eight agents,
the guard immediately flagged 06 and 07 — and both are *right* to carry full sets. 06 shows
`"guitarist : drummer :: guitar : drum kit"` and says of it *"symmetry, not analogy… the
answer is false"*; 07 shows `"dawn : dusk :: birth : death"` against `"Ruth : Gehrig :: Mantle
: Maris"`. Neither can leak, because neither agent's **output** is a set. The hazard was never
"a full set appears in a prompt" — it is "a full set appears in the prompt of a stage whose
job is to produce one". A stage that judges sets needs to be shown sets, and a second test
pins that their counter-examples are never deleted in the name of this rule.

**A published board is the other half,** because prompts can be edited back and a shipped
board stays shipped: `test/content/example-leak.test.js` re-gates `puzzles/` on every run,
beside `manifest.test.js`, for the same reason.

**`trees-tools-and-time` stays published — Max's call.** It is a good set, no player can
perceive its provenance, and republishing would cost a board for a reason invisible from the
outside. It is grandfathered per-slug (a *new* board with the same defect still fails), and
the provenance is recorded **here** so that a rubric compiled from the corpus later does not
credit the pipeline with authoring that Black.

**Reconsider-when:** if the next batches' arrangement-hard sets stop orbiting
planting/budding, this worked. If they **vanish** instead — the pipeline drifting back to
vocabulary-hard Blacks — the pair-level anchor is too weak and D-8's rut has reopened; the
answer then is a rotating pool of pair-level examples, which `examples.js` makes a data
change rather than a prompt edit.

**02 and 04 checked, and the rule sharpened (2026-08-08).** Both are clean: neither quotes an
example at all, and 04 is protected by its own design — *"choose and relabel; do not author"*
leaves it nothing deliverable-shaped to show.

The check found something else. Every generative prompt renders a `context` block, and in
production that block is the **rules corpus** (`server.js` builds `{ rules: loadRules()… }`)
— so the one channel that really does carry full sets into the author's prompt was the one
channel the guard could not see, because it rendered with empty context. It was also passing
by accident: its regex required a lowercase first letter, and rule-008's
`"Sonar : mapping :: …"` is capitalised. Both fixed; the guard now renders production context
and matches case-insensitively.

**Five full sets live in the rules, and all five stay** — with a sharper reason than the one
first written down. The first cut was "counter-examples are safe, exemplars leak", and the
corpus refutes it: rule-009 carries two **prescribed** sets (*"use `Second : Minute :: Hour :
Day` instead"*), and a sweep of **82 boards** — every `board.json` across all 59 run
directories plus the 15 published — found **zero** occurrences of any of the five, prescribed
or forbidden. What the evidence actually supports is narrower: **what leaks is a full set held
up as a model of QUALITY in the stage's own creative dimension.**
`planting : felling :: budding : withering` arrived as *"one of the hardest sets ever written
for this game"* to a stage being asked to write a hard set — an aspiration, in the register of
the work. The rule examples are **mechanical demonstrations** — a grain mismatch, a repeated
word — and `Second : Minute :: Hour : Day` is dull by design, which is exactly what makes it
safe. They are allowlisted with that rationale, and a *new* rule quoting an admired set fails
the suite so a human decides.

The content sweep bans only rule-008's pairs, deliberately: `second : minute` and
`president : air force one` are sets a themed board could honestly author — the backlog's own
Obama-run analysis says the latter is fine *"once it has a partner from elsewhere"* — so
banning them would fail real work to prevent a copy 82 boards say has never happened. The
line recorded in the test: **ban a taught pair only when nothing but the lesson would produce
it**; everything else is watched at the prompt.

### D-13 — Order is the game, so the Black slot cannot be a clock (2026-08-08)

**Max's finding, from one evening's reviews.** He flagged "beginning and end" sets on flowers
(twice), cowboys and music, refused to publish an otherwise-approved cowboys board over it,
and wrote *"we keep encountering way too many puzzles that move through time"* and **"We def
need to fix this."**

**Measured across all real boards:** time-stance sets are **19% of all sets** — unremarkable,
fourth of eight — but **19 of 54 hardest sets, 35% of the Black slot**, against 17% for the
next stance. The monoculture is not in the corpus; it is in the top tier.

**Why it grew.** D-8 taught the builder to prefer *arrangement-hard* sets for Black. A time
span is the easiest arrangement-hard set to author — ordinary words whose placement is the
puzzle is nearly the definition of a span. Fixing the vocabulary-hard rut opened a slot, and
clocks filled it. **Every rut fix should be assumed to create the next one**, which is why
this decision adds a measurement, not just a nudge.

**The structural half, which is worse than the repetition.** When a span set's four words lie
on ONE timeline — `seed → bud → bloom → wilt` — regrouping them *still* reads "earlier :
later". The cross-reading is a valid analogy, the engine refuses cross-pair orderings, and the
player who finds it is **marked wrong for being right**. That is D-7's `second-valid-reading`,
manufactured by the stance rather than stumbled into. Max found it by hand on flowers 0002 and
reached for `order-ambiguous`, a tag he had never used before.

**Three levers, none of which gate.**

1. **Steer the slot (`variety.js` → 01 and 04).** The index now records
   `hardestStances` beside `hardestSources`, and a stance holding **half of the last eight**
   Blacks puts `varyHardestStance` on the brief. Two calibrations came from the data, not from
   taste: **a window, not a run** — D-8's "last three identical" rule works on a two-valued
   axis and fires on only 5 of 52 windows of an eight-valued one, and *would not have fired on
   the evening Max complained* (his last three were time, dimension, possession); and
   **window 8 at half share**, which across 47 historical windows fires on `time` and on
   nothing else, ever. The steer reaches **both** 01 and 04, because 01 only decides what is
   available and 04 is what actually assigns difficulty 4.
   **An `avoidStances` sibling was designed and then dropped** — overall stance usage is
   balanced, so a lever keyed to total counts would have fired on `cause` and left the rut
   untouched.
2. **See it deterministically (`04a` → review card).** `spanFairness` lists every time-stance
   set with its two refused readings spelled out. Report, never gate — Max has approved span
   boards and `sunrise : sunset` is a good set; what is a defect is one reaching review
   **unexamined**. Deterministic on purpose: the semantic check went quiet, and a structural
   risk must not depend on a model noticing it.
3. **Ask the question properly (06, attempt four).** Two diagnosed causes, both fixed. The
   verdict was a **bare boolean** — when 06 answered `valid: false` on the set Max caught,
   there was nothing to read to find out why; every line now names `leftRelation` and
   `rightRelation` before the verdict, which also makes the answer scoreable against his calls.
   And the checklist printed **one orientation** of each half while instructing *"judge only
   the reading in front of you"* — so Max's `seed : bud :: bloom : wilt` was formally outside
   the question. Halves may now be read either way round, and the shared-timeline case is named
   with the board that exposed it.

**Reconsider-when.** If the next ~6 boards still top out on spans, the steer is too soft —
tighten the share before touching the window. If v4 starts calling tidy 2×2 grids valid again,
the orientation freedom over-reached and the anti-grid trap needs restating (that was round
2's failure). D-7's graduation trigger keeps running with v4 as its subject: agreement with
Max's `order-ambiguous` calls over ~6 boards promotes the check to blocking at `04a`.
**Max's D-8 instruction still governs everything above** — *"they can both be black, depending
on the puzzle"* — so all three levers report or nudge, and none reserves a tier.

### D-13 amendment — the steer reached half the runs, and the half that did not matter (2026-08-08)

**The defect.** Lever 1 above says the steer reaches *both* 01 and 04. True of the stages, and
it left out the question nobody asked: which **runs**. `varyHardestStance` was added to
`buildVarietyBrief` — the surprise-me brief — and a themed run's brief was assembled separately
by each caller. `api.js` re-listed what a themed brief carries (`steerOnly()`, which forwarded
D-8's field and knew nothing about D-13's); `run.js` re-listed a thinner version still and
forwarded neither. **Every board that motivated D-13 was themed** — flowers, cowboys, bbq, snow.
The lever built to answer the complaint was off for exactly the runs that produced it.

Measured before the fix: the rut was live (`time` 5 of the last 8), a surprise-me brief carried
`varyHardestStance: "time"`, a themed brief carried nothing.

**Fixed as a class, not as the field.** `variety.js` owns both shapes; `buildThemedBrief` is
`buildVarietyBrief` minus a named `SURPRISE_ME_ONLY` list (`relationshipShapes`, `avoidShapes` —
the surprise-me markers `api.js` reads to classify a run). A steer added later therefore reaches
themed runs **by construction**, and the guard is a test asserting every non-marker key travels,
run over both a fully-steered fixture and the real library. This is the repo's recurring scar —
a rule at one door — and the third time it has been paid for (the 04a count floor, D-11's
revision channel, this).

**First evidence, the same day.** Six themed runs under the repaired steer: **1 of 6 Blacks was a
time span (17%), against the 35% that motivated D-13**. Max approved and published all six — the
first batch with zero rejections. Stage 04 named the steer in its reasoning on one board and
deferred to D-8's rule on another (*"the only genuinely hard set in the pool"*), which is the
intended behaviour, not a miss.

**The window has already moved to `dimension` (4 of 8)**, so the next themed brief steers away
from it. That is the mechanism catching its own rut on the first pass, exactly as D-13 predicted
every rut fix would need to. **Reconsider-when for the amendment:** the steer has only ever been
tested against `time`; if `dimension` boards come back feeling samey in a way the steer does not
move, the window/share calibration was fitted to one stance and needs re-deriving on the second.

**A caveat on the batch's evidence, recorded rather than smoothed over.** Max's summary was *"by
far the best round yet"* and the publish rate supports it, but five of his six per-board notes
say *publishable, not exciting*. That is D-8's craft-vs-delight gap one batch larger, and it is
**not** what this amendment fixed. It is also unmeasurable here: he judged at board level, so the
batch carries no praise tags and D-8's per-set density comparison cannot be run on it.

### D-13 second amendment — the ask is positive, and it is always on (2026-08-08)

**What the second batch proved.** Six themes ran the same evening under the repaired steer,
now aimed at `dimension` (4 of the last 8 Blacks). **Five of six Blacks came back
`before-after` time spans** — against 1 of 6 the batch before, and against the 35% baseline
that created D-13 — and the causation is in the builders' own words. school: *"over the
dimensional-similarity set (also arrangement, but tagged with the 'dimension' stance this
board deliberately avoided at the top)"*. The steer was **obeyed**, and the obedience produced
clocks, because among arrangement-hard sets a span is always the easiest thing to author next.
The lone escape (gardening, `rootstock : scion`) got out by going vocabulary-hard — D-8's
original rut. An exclusion cannot diversify the slot; it can only relocate it, and the window
mechanism would have oscillated between `time` and `dimension` indefinitely.

**Max's verdicts, which sharpen the target.** Six approved, five published (architecture held
back — *"not very juicy"*). He confirmed the diagnosis unprompted — *"clearly something in the
agent pipeline is stuck or fixated… **All puzzles should pull from all taxonomies**"* — and
drew the line the fix must respect: theatre's span earned **all four praise tags** (*"does it
in an acceptable way… not overtly obvious"*). Anti-monoculture, never anti-time. He also named
the real prize twice: houses' sign-significant set — *"two seemingly unrelated topics in the
theme sharing similarity in their relationship. **This is truly what we are after**"* — and
gardening's pattern-breaking Black: *"we need to support more of this action."*

**The change: polarity and cadence.** `varyHardestStance` (name one stance to avoid, fire on a
rut) is replaced by **`hardestStanceAsk`** — the 2–3 stances *least used in the hardest slot*
(window of 8, ties by all-time count then name; all eight stances candidates) — **on every
brief**, with **`hardestStanceLean`** naming the rut when one exists (old window and share,
kept) so the renderers can say why. Rendered with each stance's description and a pair-level
paradigm via `renderStanceAsk` in `corpus/vocabulary.js`, shared by 01 and 04 so the two
stages describe the territory in the same words. This restores `variety.js`'s founding rule to
the one lever that broke it: *the brief is positive — it asks for what is underused rather
than saying "be different."* D-8's law is untouched: still a nudge, the genuinely hardest set
still wins the slot, no stance is banned or reserved.

**Two ride-alongs from the same review, both Max's calls:**

- **The hardest material must stay in the theme's world** (01, same sentence as the ask).
  festivals' Black was `spark : ember :: hype : exhaustion` — *"spark and ember have nothing
  to do with festivals"* — and his own fix kept the relationship and re-themed the words.
- **A content line the pipeline had never been told** (01 rule + 08 report-only
  `contentConcerns`): *"at least it didn't generate anything about mass shootings, that would
  be an automatic throw out."* Real-world violence, tragedy and disaster are never material
  for a pair; 08 names anything that comes close, shown on the card, never gating. The
  throw-out stays his.

**Also recorded here: D-5's first success.** festivals' revision ran through the proposer's
brief and came back exactly as asked — *"my initial feedback was implemented exactly as
intended"* — the **6th** `proposal-verdict` and the **first executed-and-published brief**.
Usable evidence stands at 1 published of 3 usable (the evaluator report segments the three
pre-D-11 confounded chains out).

**Reconsider-when (this amendment).** If the next batches' Blacks stop being spans
*entirely*, the always-on ask is over-steering — theatre proved a span done well is wanted —
and the ask should revert to firing only on a lean. If the ask is ignored and clocks persist,
the lever has failed twice and the next conversation is about the pool itself (01's
arrangement-hard instruction names spans' natural shape too readily). And D-7's graduation
trigger keeps running regardless: `spanFairness` flagged all six boards correctly this batch
and remains the deterministic half of the answer.

**Gate: PASSED (2026-08-09).** The first batch under the ask spread its Blacks across the
asked-for stances — `reference` ×2, `absence` ×2, `inclusion`, and one span kept through
D-8's escape hatch with the reasoning stated (mirrors: *"the genuinely hardest graded set"*).
Max approved four and published four (two via revisions that *"targeted the fix exactly"*),
rejected two for reasons unrelated to the slot, and wrote the verdict himself on fairy
tales' `fairy dust : weight :: magic mirror : falsehood`: **"FINALLY! a black puzzle with a
new relationship that is not about time. hopefully this trend continues."** The
reconsider-when's healthy middle held: spans neither monoculture (1 of 6) nor extinct.

### D-14 — The pre-review fix loop: designed, agreed, and deliberately not built (2026-08-09)

**Max's question, unprompted, mid-review:** *"Are we at the point where we should have an
agent review the machine's notes and make changes before the puzzle is presented for
review?"* — D-5's graduation aspiration arriving from his side, at **9 proposal verdicts,
all accepted**.

**The evidence that makes it answerable now.** On the 2026-08-09 batch the machine caught
**every structural defect Max caught, before he saw the boards**:

| Max's catch | the machine's, already on disk |
|---|---|
| bicycles: green/red confusable (`outbound:inbound` ↔ `departure:arrival`) | 06 `cross-set-association` [high], same four words |
| bicycles: yellow order-ambiguous | v4 cross-reading: HOLDS on that set |
| mirrors: green unsolvable (`left:right::top:bottom`) | 04a symmetric flag **and** 07 `orderGuessed`, his exact reasoning |
| night sky: Milky Way/Sirius/Orion all instances | 06 `cross-set-association` [high], near-verbatim |

And the boundary, measured the same day: 08 rated the board Max rejected as *"boring"* at
`evocativeness: strong`. **Structural findings agree with him; taste findings do not.**
That is the validity-vs-taste line the Brain's pattern pages draw, and it is where the
loop's authority stops.

**The design (build next session — Max's decision, 2026-08-09):**

- **Trigger:** after the evaluators complete and before `awaiting-review`, if an
  **allowlisted** finding fires. The allowlist is Max's, chosen explicitly: 06
  `cross-set-association` at `high` severity, and the order-ambiguity cluster (04a's
  symmetric flag, 07's `orderGuessed`, v4's cross-reading-holds). `knowledgeGated` is
  **off** the list — a flag that names a wall without condemning a set (medicine was his
  best board) must not trigger surgery. **Taste never triggers revision.**
- **Mechanism:** the existing Revision Proposer runs with the machine's findings as its
  brief input. This is a stated exception to D-5's authority ordering (his judgement
  first) for the one case where his judgement does not exist yet — pre-review, there is no
  feedback to outrank. The brief feeds the existing `requestRevision` machinery unchanged.
- **Bound:** **one auto-revision per run**, inside the existing 3-revision cap, never in
  addition to it. If the revision still trips the allowlist, the board goes to Max as-is
  with the findings AND the failed-fix diagnosis on the card — never a second loop
  (circuit-breaker: a failure exit, not just a success exit).
- **Audit:** the review card says "auto-revised before review" with the finding, the brief,
  and what changed. Risk-tiered autonomy's caution is the reason: the trust ratchet must
  stay inspectable so Max can revoke it per finding kind, and his verdicts on auto-revised
  boards keep being recorded as the evidence that sustains (or ends) the graduation.
- **Upstream feedback:** a finding kind auto-fixed on ~3 runs becomes a proposed line in
  the generator's prompt — "refine the generator, not the artifact" (Brain, Class 8). The
  loop must shrink its own workload or it is masking a generator defect.

**Also decided (Max, same review):** *"lets start adding more options in the reviewer
regarding taste so we can capture more data on this over time to train the agents."* Built
this session as formVersion 4: a board-level `taste` verdict (flat / solid / delightful —
his own delight vocabulary) and two taste tags (`sharp-words`, `surprising-turn`, both
from his notes). Capture only — **no agent reads the taste data yet**; its use is a later
decision once a corpus exists, the same discipline as the rubric's ~30-board threshold.

**Reconsider-when (once built):** an auto-revision changes a set Max then rejects where
the original was fine → the allowlist shrinks by that finding kind. The taste corpus
starts agreeing with 08's verdicts → a *taste* graduation gets its own decision, never
folded silently into this one. The loop fires on most runs → the generator prompt is the
problem, not the reviser's throughput.

### D-14 amendment — built, and the four calls made while building it (2026-08-09)

**Status: BUILT.** `studio/auto-revise.js` owns the whole loop: `detectFindings` (the
allowlist, pure), `shouldAutoRevise` (the guards, pure), `autoReviseIfNeeded` +
`recordAutoRevisionOutcome` (the orchestration, through the existing seams —
`proposeRevision` for the brief, `requestRevision` for the child attempt, `run-store`
for every byte). The proposer's machine-findings variant is the one new seam D-14
predicted: `buildPrompt` gains a pre-review mode whose mandate is the allowlisted
findings alone, and whose validator enforces what the post-review prompt only asks —
**every board set is either fixed or protected** ("unmentioned" pre-review would mean
"free to churn", which is what the bound forbids). The post-review prompt is untouched,
and a test pins that.

**Three calls made with Max at the session's start:**

1. **Kill switch, default ON.** `autoRevise: true` in `pipeline-config.js`, a checkbox on
   the Studio's start-run form, `--no-auto-revise` at the CLI — recorded on the run's
   `brief` at creation, so a resume obeys the choice made when the run was started.
   Either switch being off keeps the loop off. The trust is revocable without a code
   edit, which is what risk-tiered autonomy asks of a ratchet.
2. **Both doors, one module.** `runner.js` (Studio) and `run.js` (CLI) call the same
   three functions. The recurring one-door scar, paid for three times before this
   module existed (the 04a count floor, D-11, D-13's themed-brief steer), pre-paid here.
3. **A failed auto-revision is accepted and named loudly** — `auto-revision-failed` in
   `decisions.jsonl` naming the parent attempt, which still holds a complete board
   (`failed → running` is already a legal resume). No fragility guards whose conditions
   would be guesswork until one has actually failed.

**And one refinement made while wiring, recorded because it sharpens the design's own
reasoning:** the loop fires **only on attempts that are not themselves revisions**
(`parentAttemptId === null`). D-14's mechanism is a stated exception to D-5's authority
ordering *for the one case where Max's judgement does not exist yet* — but after a
Max-requested revision his judgement exists, so the exception's justification is gone
and the loop stays out. Strictly pre-review, by construction.

**How the intervention reads on disk and on the card.** One `auto-revision` decision
before the child attempt opens (a crash between the two leaves intent, not an orphan);
`auto-revision-<childId>.json` beside `feedback.jsonl` carrying findings, brief and
notes; one `auto-revision-outcome` decision when the child settles, carrying
`changedSetIds` and `persisted` — the failed-fix diagnosis when non-empty. The proposer's
artifacts land under `auto-revision-proposal-*` names, distinct from the review-time
`revision-proposal-*` files, so an auto brief is never mistaken for one Max asked for.
The review card's "Auto-revised before review" panel renders all of it un-collapsed —
a ratchet Max cannot inspect is one he cannot revoke — and the brief's protection line
says *"no allowlisted finding touches them"* rather than the review path's *"these were
approved"*, because pre-review nothing has been.

**Verified 2026-08-09:** 1199 tests green (19 new — the allowlist's negative space is
the load-bearing test: 05, 08, `knowledgeGated`, taste, span and lexical reports all
constructed juicy and asserted silent). Both bite-checks bit: silencing the severity
filter fails the detection test; dropping the once-per-run guard fails the guard test.
End to end in the live Studio on a mock run — the committed fixtures trip the allowlist
by construction — attempt 0002 arrived as a revision of 0001 with the full audit panel,
including the diagnosis path, since replayed fixtures cannot clear their own finding.

### D-14 second amendment — the bound's unit is the board, not the run (2026-08-09)

**What exposed it.** The credits outage killed two auto-revisions before they ran a
single stage. Their runs were resumed as fresh attempts — genuinely new boards — and
under "one auto-revision per run" the dead revisions' ghosts barred both from
examination. Ink & Anatomy's fresh board then reached Max carrying a black set that
**three detectors had flagged on that very attempt** (v4 cross-reading HOLDS naming his
exact alternate solve, 04a's symmetric flag, 07's `orderGuessed`); he caught it by
hand, and the proposer's fix — *"a great fix on my previous note"* — proved the loop
would have done its job had it been allowed to look.

**Max's call, after asking why the bound was one at all:** the unit moves to the
**board**. Every fresh attempt is entitled to one auto-revision; a revision descendant
never is (the strictly-pre-review guard, unchanged). No lineage is ever machine-revised
twice, so "never a second loop" holds **by construction rather than by counter** — the
guard now asks "has THIS attempt been examined?" instead of "has this run ever fired?".

**Explicitly rejected, recorded so it stays rejected: "revise until the findings
clear."** The persist signal is the pipeline's least reliable instrument — Kitchen
Relations carried five persisted findings and was approved with full praise, so a
persist-driven loop would churn boards Max loves on false flags, at a revision's price
per churn.

**Also recorded from the same batch, the loop's first real evidence:** where it ran, it
earned its keep — travel's auto-revision produced the batch's *"mmm, this one was
tasty"* board, theatre's cleared two sets. The trust ratchet's next click (any
loosening of the allowlist itself, or of the one-shot rule) waits for more verdicts on
auto-revised boards, per the original reconsider-when.

### D-15 — Fresh surprise-me subjects, and the world/lens experiment (2026-08-09)

**What prompted it.** Max caught the surprise generator repeating themes within a day —
photography (twice in one day), theatre, the kitchen. Structural, not unlucky:
`pickSubject` drew blind from a static pool of 50 while the run history held 105
themes. The pool had been lapped twice; a repeat was the *likely* outcome of every draw.

**His requirement, verbatim in spirit:** no theme reuse — *"I'd prefer fresh themes
every time if the generator and pipeline are capable of that"* — a ~50-board cooldown
as the acceptable floor, and **no loop**.

**The chain, loop-free by construction** (`studio/subject.js`, shared by both doors —
the one-door scar, pre-paid a fourth time):

1. **The Subject Scout** (`agents/subject-scout.js`, registered beside the proposer as
   the second not-a-pipeline-stage agent) invents one fresh subject — two rounds max,
   handed the full used list as a hard avoid-list *including close overlaps*, and the
   pool's own curation guidance (everyday lean, science minority, whimsy prized). On
   the default Sonnet at `low` effort: the subject is the creative seed for everything
   downstream, and the spend is ~a cent, paid as ~2–4s on the surprise-me button press.
2. **The mechanical guard:** an answer whose **slug** matches any used theme's slug is
   rejected ("Photography" is not fresh next to "photography"). One retry; no third round.
3. **Fallback A:** the static pool filtered to never-used entries — a single filter
   pass, never rejection sampling. The pool widened 50 → 91 the same day so this tier
   has room to work.
4. **Fallback B:** every pool subject used → the **least-recently-used** one, which is
   the cooldown floor by construction. Reachable only with the model unavailable AND
   the pool exhausted.

No path throws; a transport that cannot be built (missing key) or fails mid-call lands
in Fallback A — a missing key must stop a pipeline run, never the creation of one.
"Used" = every non-mock run's theme, themed and surprise alike; the rule governs only
the generator's picks — Max typing a theme is never blocked.

**The world/lens experiment (Max's call, after weighing the assessment).** He noticed
the best-loved early board title, *First Light*, is not a category but a **lens** — an
evocative angle that admits bread, clay and animals while painting one picture — and
asked whether the picker should push that way. The mechanical case: category subjects
put every word in one taxonomy, which is exactly what killed furniture (five storage
words cross-associating) and photography (generic category nouns); a lens spreads the
gravity across domains, and cross-domain pairs inside one theme — his *"this is truly
what we are after"* — need a theme that spans domains. The unknown is delight, which
has resisted every direct push (D-8). **His decision: a deliberate ~half-and-half mix**,
so each batch carries its own comparison. The CALLER assigns style (a model asked to
alternate drifts) — whichever of world/lens is underrepresented among past scout picks
— and the brief records `subjectSource` (scout / pool / pool-lru) and `subjectStyle`
(world / lens; null on fallbacks, which must not dilute the A/B). The verdict comes
from segmenting his taste verdicts (formVersion 4), 08's unity and evocativeness, and
06's cross-set findings by style. **On record, falsifiably: lens subjects should draw
fewer cross-set-association findings.**

**Accepted limitation, recorded:** two runs created in the same instant race the
history read and could draw similar subjects. Runs are started one at a time in
practice — each creation records its theme before the next POST reads the manifests —
so this stays a comment, not machinery.

**Reconsider-when:** scout subjects drift off-taste (too obscure, or samey in their own
poetic register — every subject a time of day is D-13's law wearing new clothes) → the
banding prompt gets recalibrated against the pool's curation, or generation demotes to
fallback-only. The A/B reads clearly in either direction after ~2 batches → the style
mix becomes a deliberate decision rather than a coin-weighted default. `subjectSource`
shows the fallbacks carrying real load → the scout's ask or ceiling is wrong, and the
fix is measurement first, per the repo's own effort-tuning scars.

**Verified 2026-08-09:** 1212 tests green (13 new: the chain, the style balance, the
guard, both fallbacks, and the API recording provenance). Both bite-checks bit —
dropping the slug guard fails the case-variant test; flattening the LRU ordering fails
the exhaustion test. Live: a mock surprise-me run draws the fixture subject through
the same path, and a real surprise-me run drew a scout subject absent from all 105
used themes, with `subjectSource: 'scout'` and its style on the manifest.

**Gate evidence, same day — the first scout batch, judged.** Seven boards, **taste
`delightful` on all seven** (against `solid`×5 / `delightful`×1 on the pool-subject
batch the same morning — the subject source was the only variable between them), six
approved, six published. Max: *"the change we made def made a huge difference in the
delight factor."* The world/lens A/B's early read: **both arms delighted** (lens 3/3
approved, world 3/4), so the active ingredient looks like specificity-and-freshness
rather than the poetic register per se — the mix continues, n too small to call.

**The ride-along, measured before any lever moved.** Every board also got harder, and
the instruments agree on where: knowledge-gated words **1.17 → 2.71 per board**,
difficulty-source `vocabulary` 56% → 63%, Max's sets-solved **1.83 → 1.12 of 4** with
zero wins, `too-difficult` ×4 — and the sharpest number, **grade-1 candidate sets
12 → 4** across comparable pools. The pools stopped *containing* easy sets, so the
green slot was being filled by promotion from harder material. **Max's call: ship the
mirror of D-8's range rule** — 01 now requires at least one matched group *open to a
general player on sight*, with the subject's specialist vocabulary confined to the
harder groups ("the easiest set is the door into the board, and a board with no door
is a wall"). One line, at the door where the shortage measurably is, leaving the upper
tiers as sharp as the batch that earned the delight. **Reconsider-when:** the next
scout batches' grade-1 counts and his win rate recover without the taste verdicts
falling — or greens come back generic ("slapped on the page") and the line overshot,
in which case the fix is scaling specificity to tier, not abandoning either rule.

### D-16 — The hint button: one free reveal, worn in tier colour (2026-08-11)

Max's idea, brainstormed and built the same day. One **Hint** pill per game: it marks
a **random unsolved set** by tinting its four tiles in the set's **tier colour** —
the same three tokens the solved reveal cards use, applied early. Membership and tier
are revealed; **order is not** — the hint deliberately funnels the player into the
assembly challenge, the game's differentiator. It answers GDD §8.3's open question
("Should the game eventually include a non-penalty hint system?") with a playtest
bet, the same way "So close!" was decided.

**The decisions, made with Max in brainstorming:**

1. **Free, one per game.** Non-penalty (the GDD's own leaning); beans untouched.
   `rules.hintsAllowed` (default 1, tutorial 0) is the dial; the engine also refuses
   to re-hint an already-hinted set, so raising the dial always adds information.
2. **Pure random** among unsolved sets, via the injected RNG at the controller seam
   (same contract as shuffle: `hint(state, rand)` throws without a rand). Chosen over
   "hardest remaining" and weighted draws: simplest to explain, leaks nothing.
   **Accepted risk:** the hint can land on a set the player already knew.
   **Reconsider-when:** playtests show hints feeling wasted on easy sets — the
   selection is one engine function; swap to a weighted draw then.
3. **Persistent tier-colour tint**, not a transient flash. Max's own upgrade
   mid-brainstorm: a flash makes the hint a memory test, which punishes exactly the
   player who needed help. The tint holds until the set is solved, survives shuffles
   (it is engine state, `hintedSetIds`, rendered fresh each pass), and needs no
   motion to carry its meaning — reduced-motion players lose only the entrance
   pulse, never the information.

**Two sanctioned exceptions, recorded rather than slipped in:**

- ***"Tiers are revealed on solve, never shown on the board"*** (GDD §9, CLAUDE.md
  §7) — the hinted set's tier now shows early. Reasoning: that rule keeps the
  *untouched* board neutral; a hint is the game deliberately stepping in, and "these
  four are the tricky ones" is part of the help — a bait warning with some drama in
  it. The rule stands for every other tile and every hintless game.
  **Reconsider-when:** playtests read the early tier as spoiler rather than drama —
  fall back to a neutral hint tint, which keeps the feature and restores the rule.
- ***Outcomes never name set contents*** (engine.js) — barely bent, in the end: the
  hint's reveal lives in **state**, and the `hint` outcome carries only its type,
  like so-close and already-tried. `submit`'s outcomes are exactly as empty as
  before; the no-leak test stands unchanged.

**Deferred, on the record:** whether a hinted win is marked on the results card.
No stakes until sharing/streaks exist; decide when they do.

**Ride-along fix:** four pills overflowed a 375px viewport, so the controls compress
below 430px (smaller gap and padding) instead of wrapping — found and fixed during
browser verification, before any device saw it.

**Status:** built TDD-first (10-test engine suite + a headless hint playthrough in
game-flow; suite 1238 green), verified in the preview browser on desktop and mobile
and in the Review Studio's play surface (which needed only an `onHint` callback —
the boundary law's dividend). **Playtest gate passed the same day** — Max: "the
hint works perfectly. i love it. its a stand out addition that connections could
never have." The tier reveal read as drama, not spoiler; its reconsider-when stays
dormant.

### D-16 addendum — the cup remembers the coffee (2026-08-11)

The deferred results-card question came due the same day: Max asked for a mark on
the select list's result cup, brainstormed over inline mockups in the game's own
palette, and made the call — **with the poles swapped from the first sketch**:

- **White cup** (`--cup-clean`, hairline `--faint-ink` outline — it sits on a
  milk-coloured row) — played **clean**, no hint. The new everyday cup; results
  saved before hints existed have no `hintsUsed` field and truthfully read clean.
- **Brown cup** (`--bean-filled`, the old only colour) — **a hint was used**:
  the player "needed a coffee." Applies in both poses — steaming (hinted win) and
  spilled (hinted loss).

**Pose owns won-or-lost; colour owns how it was played.** The cup geometry did not
change — colour moved entirely into CSS behind an `is-hinted` class on the cup
slot, driven by `hintsUsed` in the stored result (`results-recorder.js`, additive
field, `?? 0` for legacy states). The D-10 accessibility move repeats: the visual
drops the words, the aria sentence gains "A hint was used."

The white puddle keeps near-full opacity plus the outline (at half opacity it
vanished into the row); the brown puddle keeps its original halved opacity (a
lighter-than-cup brown puddle read as a shadow). Both recorded in the CSS comments.

**Reconsider-when:** the mostly-white list reads washed-out, or players misread
brown as the badge of honour rather than the marked case — revisit which pole is
marked (the class flip is one line).

### D-17 — Batch two's readout, and the three levers for batch three (2026-08-11)

Max judged the first fresh-scout batch (D-15's arms, D-14's per-board bound, the
green door — all live): **4 published, 2 rejected; lens 3/3 delightful, world
1/3** (cumulative: lens 6/6, world 4/7). The full comparison lives in the
2026-08-11 batch log entry; what it licensed:

- **Obscurity is a world-arm property, measured:** knowledge-gated words per
  board — lens 0.33, world 3.0. A world subject is a place full of objects and
  invites the trade's nouns; a lens builds from common words in fresh relations.
- **Raw structural counts anti-correlate with taste** (lens drew 8 cross-set
  findings to world's 4 and swept on delight); **persistence-after-a-fix-attempt
  plus "not always true" is the blocker signature** (umbrella: predicted 2-for-2).
- **07's order-guess is two signals:** the attic's guessed set was the batch's
  best reveal; the umbrella's was a blocker. The separator is whether the
  explanation locks the order at reveal.

**The three levers, one per axis, Max-approved 2026-08-11 — all built the same
day; batch three is their gate:**

1. **Scout naming variety** (D-15 amendment): 6/6 batch-two subjects were titled
   "the …" — the tone-rut reconsider-when, fired twice. The scout's banding now
   requires varied grammatical shapes, keyed off the used list's recent tail.
2. **Reveal readings** (D-14 amendment — the allowlist narrowed): 06 now answers,
   per set, whether the reveal locks the written order (`revealReadings`,
   checklist-complete by validator, like its other two). `detectFindings` emits
   `order-guessed` only when the reveal does NOT lock it — earned mystery stays
   out of the revision loop; an absent reading (every pre-amendment report)
   fires exactly as before. The review card shows all guesses with the lock
   verdict, so the split stays auditable. Implementation note: the plan named
   07 as the judge, but 07 is blind by construction (test-enforced); the reveal
   question moved to 06, which already holds the explanations — same intent,
   lawful seam.
3. **World-arm vocabulary cap** (chosen by Max over shifting the lens/world mix,
   because it tests whether world subjects can delight WITHOUT the trade nouns):
   world-style briefs instruct 01 — at most ONE knowledge-gated word per board,
   spent only in the hardest group ("'Cordwainer' is a wall; 'bootlace' is a
   door"). Honest about D-7 (an instruction is a request): 07's `knowledgeGated`
   count is the measurement and the review card shows count-vs-cap on world
   runs, bolded when over. Lens and themed briefs untouched — one variable.

**Reconsider-when:** world boards still land >1 gated word after a batch —
escalate the cap to a check; world delight collapses under the cap — reopen the
arm-mix question; the scout still leans one title shape — the variety ask needs
examples of its own, not more adjectives. And if batch three's locked-order sets
draw Max blockers anyway, the revealLocks split is wrong and the allowlist
re-widens.

### D-18 — The Vocabulary button: one authored definition, shipped as data (2026-08-11)

Max's idea, brainstormed and built the same day: a **Vocabulary** pill that
reveals the definition of **the hardest word on the board**. Rationale on
record: obscure vocabulary is the corpus's #1 rejection reason (four of five
taste rejections across batches two and three), and the game's own creed is
"the challenge must be the relationship, never the vocabulary." The hint frees
*grouping*; this frees *meaning*; order and grouping stay the game. It may also
dissolve the board-wide-cap question — a gated word with a gloss available is
no longer a wall (the backlog entry cross-references this).

**Decisions made with Max:**

1. **One word,** the hardest, chosen editorially — not a glossary of every
   gated word. Scarce like the hint; one clean moment.
2. **Free.** It removes an unfair wall; it does not help solve.
3. **Persistent once revealed** — the definition sits under the board until
   its word's set is solved (the hint lesson: transient help is a memory test).
4. **An authored gloss, never a dictionary.** Zero-dep and offline forbid an
   API; more importantly a dictionary definition of a trade noun usually
   states its *function*, which is usually the set's relationship. The gloss
   is written by the pipeline under leak rules and reviewed by Max.

**Schema v1.0 change (locked decision, Max-initiated 2026-08-11):** optional
`glossary: [ { word, definition } ]` on the puzzle. Additive and
backward-compatible — absent on every existing board, and a board without one
simply shows no button (data-driven, like the tutorial's missing hint).
Validated in `validate-puzzle.js`: word must be a board word, definition
non-empty. The array shape future-proofs "all gated words" without another
schema change; the one-entry limit is editorial, enforced at the authoring
stage.

**The leak rules (instruction AND check, per D-7):** the gloss says what the
thing IS, never what it is FOR relative to the board; mechanically, a
definition may not contain any other board word (whole-word,
case-insensitive), may only define a word 07 flagged as knowledge-gated, and
must be empty when nothing was flagged — an open board gets no footnote.

**Where it lives:** engine mutator `revealVocab(state)` (no RNG — the data
names the word; outcome type-only, reveal is state `vocabRevealed`); the
`VocabView` footnote under the board; the pill hidden on gloss-less boards;
controls wrap on narrow screens now that five pills exist (Confirm takes its
own row at 375px — the primary action alone under the thumb). Studio: new
stage **09-glossary-author** (tenth stage, effort `low`, profile bumped to
`2026-08-11-glossary`), gloss shown on the review card AND riding the play
surface, merged into the published JSON at the publish door.

**Deferred, on the record:** results-card marking for vocab use (the hint's
deferral, same reasoning); "all gated words" scope; whether the pill's label
should be shorter ("Define") if five pills feel crowded in playtests.

**Reconsider-when:** glosses keep leaking despite the rules — tighten the
mechanical check (e.g. ban the set's relationship verbs too); the button goes
unused across playtests — drop it to backlog; boards start being AUTHORED
toward gated words because the gloss absolves them — the cap conversation
reopens, this time board-wide.

**Status:** built TDD-first (validator, engine, agent, publish-merge suites all
watched red; full suite 1295 green). Claude-verified in the browser on both
hosts: press → persistent footnote, survives shuffle, retires on solve, spends
the pill; gloss-less boards show four pills; five-pill wrap clean at 375px; a
mock run produced a leak-clean gloss on its card and its play surface.
**Gate PASSED 2026-08-11, batch four:** Max, on closing the carnival — "the
hints and the vocab are fun beyond just making the puzzle easier, it adds some
very light complexity to the game so its not quite so featureless."

**D-18 addendum — every board gets a vocab word (Max, 2026-08-11, same day).**
The original decline path (no flags → no gloss) lasted one batch: candlelight
on old letters stumped Max on "taper", a word no agent had flagged, and half
the batch had no button at all. His direction: *"There should be a vocab button
on each puzzle. Even if the agents don't flag a specific word, they need to
pick a word for each puzzle that can be used."* The glossary author now returns
EXACTLY one entry always — 07's flags are its candidates when present; its own
judgment of the hardest word otherwise (any board word, leak rules unchanged).
Suite 1301 green. Also noted from the same playtest: 07's flags under-detect
(taper), so the always-on author is also a second detector reading.
**Reconsider-when unchanged**, plus: glosses on genuinely open boards read as
noise ("why is this defined?") → revisit the decline path with a threshold
rather than removing the button.

**D-18 backfill — the addendum reaches the back catalog (Max, 2026-08-13).**
Only 2 of 48 published boards carried a glossary, stage 09 postdating the rest.
`studio/glossary-backfill.js` + `tools/backfill-glossary.js` retrofit them
through existing seams only: the D-6 publish events join each board to its run,
07's `knowledgeGated` flags feed the same glossary-author agent (its leak
validators binding), and every write goes through `puzzle-store.publish`. The
review split was Max's: 24 boards with flagged words auto-applied (the flag is
evidence); 22 author's-own-pick boards queued to a review file he edits, with
`--apply` re-validating every edited entry. He approved the file unchanged.
Scope his call too: **every board, tutorial included** — 48/48 now carry
exactly one entry. Known limit, recorded in the backlog: the mechanical leak
check cannot see a definition that PARAPHRASES the set's relationship
(buttonhook), so the semantic half still rests with Max.

### D-17 second amendment — territory variety, and the revision guardrails (2026-08-11)

The batch-five tuning pass, from Max's batch-3/4 readouts:

1. **Territory variety** (the scout's second rut): grammar variety worked and
   the subjects stayed cozy-commonplace. The banding now names the wider map —
   far places, history/myth, fiction/fandom, sports/pop-culture, proper nouns
   (his exemplars: a tropical island, mars, egypt, harry potter, the yankees)
   — with cozy-everyday kept as the HOME register, keyed off the used list's
   recent register like the shape rule. **Reconsider-when:** the register
   distribution stays cozy after a batch (the ask needs exemplar rotation), or
   the far territories read off-brand to Max (narrow the map, keep the ask).
2. **Proposer scope check** (the smell-of-rain hole): pre-review, a proposal
   may fix ONLY the sets its allowlisted findings name — enforced by
   validator, with the findings now traveling into validation. Legacy boolean
   callers keep completeness-only. **Reconsider-when:** a legitimate fix
   genuinely requires touching an unnamed set (e.g. a cross-set bait fix) —
   the proposer should say so loudly in `doNotChange` notes and the guard
   grows an explicit escape, never a silent widening.
3. **Unity gate on revisions** (the kickoff hole): a word a revision
   INTRODUCES that lands in 08's unity outliers fails the attempt through the
   terminal-failure path the integrity gate already uses — loud on the card,
   Max can re-request. Fresh boards stay advisory-only. Noted honestly: the
   board-builder's revision prompt still carries no theme-evocation text; the
   gate is the check that covers that gap (D-7: a check outranks an
   instruction). **Reconsider-when:** 08 flags a legitimately theme-widening
   word and kills a good revision — the gate should then require TWO signals
   (outlier + Max's blocker overlap) before failing.

Also from Max the same day, in the game: the title screen leads with "How to
play" before the ink-filled Play, and the Vocabulary pill reads **"Vocab"**.

### D-19 — Recently published words are an avoid-list (2026-08-11)

Max's three-time repetition signal ("kindling:ember, mallet was just in the
last puzzle… theres a lot of words out there. we don't want to be retreading
territory too soon"; the loupe déjà vu; smell-of-rain's "seen this before").
`buildRelationshipIndex` now gathers the words of the **five most recently
PUBLISHED boards** (publish events joined to their attempt boards; rejected
boards' words stay free, mock runs already excluded) and every brief — themed
and surprise-me — carries them as `avoidWords`, rendered to 01 as a soft
steer: do not reuse them or close pairings built on them unless the subject
truly demands it.

**A steer, not a check, on purpose (D-7 acknowledged):** the review card is
where a slipped repeat gets caught, and Max is the measure. **Reconsider-when:**
batch five still repeats recent words — escalate to a deterministic check at
04a (introduced words ∩ avoid list); or the 80-word block measurably degrades
01's pools (shortfall reports rise) — trim to distinctive words only (drop the
most common English words from the list) rather than dropping the lever.

### D-20 — The front door: the forced first-run tutorial retired (2026-08-13)

**Max's direction, on the eve of sharing the URL:** *"when I open it, it goes straight
to the tutorial. It would be better if it directed the user to the homepage first."*
And on the follow-up — a brand-new visitor's first "Play" goes **straight to the puzzle
list**; the tutorial is fully opt-in via "How to play".

**What changed:** one boot rule in `app.js` (the `hasSeenTutorial` check is gone from
routing; everyone lands on the title screen, and a `?puzzle=` deep link goes straight to
its board even on a first visit). Everything else stands: "How to play" runs the
tutorial any time, its completion still marks `tutorialSeen` (bookkeeping, no longer
routing), and its handoff still honours a deep link.

**This retires GDD §5.2's forced first run** — the GDD is Max's spec and this is his
amendment; the committed GDD (v0.13) now diverges on that point and is flagged rather
than rewritten. The accepted risk, stated when he chose: a first-timer who skips
"How to play" meets ordered answers and so-close cold. **Reconsider-when:** shared-link
visitors visibly bounce off their first board (or feedback says the rules were opaque)
— the softer fix is a first-visit nudge on the title screen, not a return to forcing.

## House-rule exceptions

*Added 2026-08-02 during the project-template migration. These are places where ASTO
deliberately departs from a `CLAUDE.md` house default. Each records the rule, the
reason, and a concrete **reconsider-when** trigger — the exception holds until its
trigger fires, and is never silently widened.*

### HR-1 — Strict zero dependencies (stricter than the house default)

**House default:** "Platform first; dependencies when earned" — add a dependency when
the alternative would be unsafe, fragile, or disproportionately expensive, and never
rebuild solved security, auth, parsing, storage, or accessibility problems just to stay
dependency-free.

**ASTO's rule:** zero dependencies, full stop. Vanilla HTML/CSS/JS ES modules, no build
step, tests on node's built-in `node:test`. Locked with Max 2026-08-01 (Decision 1).

**Why:** the game must run from any static server with no build and no supply chain, the
whole surface is small and self-contained, and `node:test` already covers the testing
need. The Studio's zero-dep constraint is what produced `schema-check.js` and the
injected-transport design in `llm.js` — both of which turned out to make the pipeline
more testable, not less.

**Reconsider-when:** ASTO needs to solve a security, auth, parsing, storage, or
accessibility problem where hand-rolling would be *less* safe than a well-maintained
library. That is a conversation with Max, not a unilateral `npm install`.

### HR-2 — Studio web surface deferred

**House default:** every substantial project gives Max a local, web-based surface where
he can see what's going on and functionally change things through the project's real
public seams.

**ASTO's current state (updated 2026-08-02):** `studio/` is the Core pipeline (A1+A2+A3)
**plus Review Studio R1** — a local web surface at `npm run studio:review` where Max
starts runs, sees a candidate board rendered in ASTO's own design system beside every
agent's report, and records structured editorial feedback.

**R1 is a deliberate reorder of the approved spec, agreed with Max on 2026-08-02.** A
B1/B2 subset of the Review Studio moved **ahead of A4 and A5**, because Max chose to
build the editorial rubric from ~30 recorded judgements rather than write it cold —
judging concrete boards beats articulating taste in the abstract, and it produces a
rubric with evidence attached to every line. **Deferred, not built:** approval landing
into `puzzles/` (until just before Phase 5b), hand-editing (B2), learning proposals (A6b).

**Why:** the approved Studio design builds the Core first and the human surface second.
The **Review Studio** in Part B of
`docs/superpowers/specs/2026-08-02-asto-studio-design.md` is the planned surface, and
the Core's seams (`run-store.js` as the only writer of run artifacts, pure agents,
injected transport) were designed for it from the first file — which is what the house
rule actually asks for.

**Interim verification surface:** `npm test` (771 tests as of 2026-08-04, including the
storage, agent, pipeline and review suites) · `node tools/check-board.js` for content · the
game itself in the preview browser · and, since A3, **`node studio/run.js --mock`** — a thin
CLI adapter over the exported `runPipeline`, which starts, resumes and revises a run and
prints where its artifacts landed.

**Status update (2026-08-04):** the pipeline produces boards end to end against the real API,
and the rubric loop is running hard — **14 boards judged, 78 recorded feedback events**, with
Max starting and reviewing runs unprompted between sessions. The tag vocabulary has been
extended from use rather than guessed at (spec amendment, 2026-08-04), and the candidate board
is now **playable** in the review page from the game's own controller and views. What HR-2
still defers is unchanged: approval landing into `puzzles/` (nothing in the Studio writes
there yet) and hand-editing (B2).

**Why the CLI exists (A3, 2026-08-02):** A3 is exactly the growth the reconsider-when
trigger names — the Core stopped being readable-only. `run.js` was added a phase earlier
than the spec's implementation order lists it so the trigger does not fire. It holds no
pipeline logic and shells out to nothing. R1 has since superseded it as the primary
surface; the CLI remains for scripted and headless runs.

**Status: discharged, except hand-editing.** R1 delivers what this rule actually asks for
— Max can see what the pipeline is doing and change things through the project's real
public seams (`runPipeline`, `requestRevision`, `run-store`), which is also what proves
those seams are clean.

*Updated 2026-08-05:* **approval-into-`puzzles/` is no longer deferred** — see D-6. An
approved board is published from the review page through a new seam
(`storage/puzzle-store.js`), validated by the game's own validator and integrity sweep on
the way, and is playable immediately at `?puzzle=<slug>`. Four boards have gone through
it. **Hand-editing (B2) is the only part of this rule still outstanding.**

*Sharpened 2026-08-04:* the playable board is the strongest evidence yet that the seams
are real. `studio/review/ui/play.js` builds a live game from `GameController` and the
game's views with the app shell absent — the "game runs with the view off" invariant read
from the other direction. Had the game not been genuinely composable from a validated
puzzle, that page could not have been written without dragging `app.js`, storage and
routing into the Studio.

**Reconsider-when:** approval-into-`puzzles/` or hand-editing is still missing when Phase
5b needs the Studio to author content, or the Core grows a capability neither the CLI nor
R1 can exercise.
