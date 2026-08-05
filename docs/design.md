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
│   │   └── local-json-source.js  # fetch + validate at boundary (ApiSource later, same interface)
│   ├── view/             # READ-ONLY renderers, emit intents via callbacks
│   │   ├── header-view.js · board-view.js · frame-view.js · solved-sets-view.js
│   │   ├── controls-view.js · end-view.js · tutorial-overlay.js · select-view.js
│   ├── controller/
│   │   ├── game-controller.js    # the ONLY writer: intents → engine → re-render
│   │   └── tutorial-script.js    # coach-mark steps keyed to controller events (no DOM)
│   ├── storage.js        # localStorage: per-puzzle results, tutorialSeen
│   ├── share.js          # navigator.share → clipboard fallback
│   └── app.js            # bootstrap, screen routing, first-run check
├── puzzles/              # index.json manifest + first-light.json + tutorial.json + 10+
├── tools/check-board.js  # CLI: validate + integrity-check a board file
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
   pair author validates its own pool spans ≥4 stances → grouper floor (≥4 stances or the
   retry is told to re-read setAside) → 04a gate rejects a board whose four sets repeat a
   stance, naming them. **Family is never enforced at board level** — it would reject Night B,
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
7. **Shakedown profile `2026-08-04-taxonomy-shakedown`:** lean-2 was measured against the old
   asks. 01/02 → high; 03/08 → Sonnet at medium (the rater has never returned a 4 and now
   weighs stance; 08 carries a taste call). Ceilings raised, not removed (Max: never shut a
   run down mid-test): stage 15 min / 600k tokens, attempt $20, run $60 — ~40× expected
   spend, still catching a wedged loop. **Slim-down trigger: ~10 judged boards under this
   profile**, then the lean-2 measurement pass again, caps and effort reverting together.

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

**Status: largely discharged.** R1 delivers what this rule actually asks for — Max can
see what the pipeline is doing and change things through the project's real public seams
(`runPipeline`, `requestRevision`, `run-store`), which is also what proves those seams
are clean. What remains deferred is bounded and named above.

*Sharpened 2026-08-04:* the playable board is the strongest evidence yet that the seams
are real. `studio/review/ui/play.js` builds a live game from `GameController` and the
game's views with the app shell absent — the "game runs with the view off" invariant read
from the other direction. Had the game not been genuinely composable from a validated
puzzle, that page could not have been written without dragging `app.js`, storage and
routing into the Studio.

**Reconsider-when:** approval-into-`puzzles/` or hand-editing is still missing when Phase
5b needs the Studio to author content, or the Core grows a capability neither the CLI nor
R1 can exercise.
