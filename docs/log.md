# ASTO — Dev Log

Append-only build history. Newest first. Written by `/wrapup`, read by `/warmup`.

## 2026-08-06 — Order is the game, so order has to be fair

D-8's first real batch answered its question. Max ran eight themes, judged six, approved
four, published four. **`puzzles/` is at 10 boards — Phase 5's content bar is met**, and
the remaining Phase 5 work is the manifest and select screen, not more boards.

### D-8 works, and two backlog predictions were wrong

The Black slot's difficulty source varied for the first time — **`both`×3, `vocabulary`×3,
`arrangement`×1** across seven boards. **`maps` is the first board ever to top out through
arrangement alone**: `needle : compass :: satellite : GPS`, four ordinary words, a
deliberate grain-shift from single device to whole system. Max: *"This was a great puzzle!
this one felt fun and challenging."*

| | praise-tags/set | sets scoring all four | approvals |
|---|---|---|---|
| Aug 5 23:xx (pre-D-8) | 3.15 | 15/20 (75%) | 5/5 |
| **Aug 6 (D-8)** | **3.25** | **19/24 (79%)** | **4/6 judged** |

- **The rater returned a 4, four times** (Knights ×3, Harry Potter ×1), and two of seven
  boards shipped a genuinely rated-4 Black rather than a promotion. The backlog predicted
  the opposite — that D-8 would make D-1's promotion universal. Closed as wrong.
- **`knowledgeGated` fired for the first time**, on 5 of 7 boards, with two hits Max's own
  notes confirm: `boss` on Knights (*"the machine caught exactly what i got hung up on"*)
  and the Ruth/Gehrig/Mantle/Maris set on Yankees (*"all except the most trivia heavy
  one"*). Correctly silent on the two all-ordinary-word boards, and its flag on `medicine`
  did not stop that being his best board — it names a wall without condemning a board.

### The defect hiding inside the win — D-9

**13 recorded playthroughs, 0 wins.** Not news on its own; what is new is how the losses
happen. On Yankees **all four mistakes were so-close** and he never grouped the wrong four
words once. Same on `cars`. On `maps`, 3 of 4.

The cause is structural. The engine accepts `[A,B,C,D] [C,D,A,B] [B,A,D,C] [D,C,B,A]`, so
flipping **both** pairs is fine and flipping **one** is a mistake. `dawn : dusk :: birth :
death` costs nothing — time runs one way. `Ruth : Gehrig :: Mantle : Maris` has no arrow at
all, so the player guesses an orientation and mirrors it, and half of them lose a mistake
for having the answer. Its shape is `coordinates`, *"two counterparts side by side"*.

**Max's call: a defect to catch, not a fourth `difficultySource`.** If the player had the
insight and lost to a coin flip, that is unfairness, not difficulty.

### Built — three independent signals, none of them gating

- **`studio/corpus/relationship-index.json`** — four shapes carry `symmetric: true`:
  `coordinates`, `synonymity`, `directional`, `contiguity`. Two of them already said so in
  their own `failureMode` before the field existed. `reverse` and `before-after` considered
  and rejected — *undoes* and *before* both carry a direction. Pinned by a test.
- **`studio/corpus/vocabulary.js`** — `SYMMETRIC_SHAPES`, `isSymmetric`, `symmetricNote`.
- **`studio/pipeline.js`** — `orderIndistinguishability()` at 04a, joining the board to 02's
  declared shapes exactly as the stance check does. `enforced: false`, absent from `reasons`.
- **`studio/agents/adversarial-solver.js`** — the flags become an every-line-answered
  checklist (`orderReadings`). Same move the cross-reading search got, for the same
  demonstrated reason: **06 already had an `ambiguous-order` finding kind and returned
  nothing on Yankees or cars**, the two boards where ordering took every mistake.
- **`studio/agents/test-player.js`** — `orderGuessed`, mirroring `knowledgeGated`. Words,
  never sets. A model does not experience a coin flip; it picks an order and rationalizes
  it, so the agent whose job is *how does this feel to play* scored a coin-flip set as a
  clean solve.
- **`studio/review/ui/so-close.js`** (new) + `review.js` — all three signals on the set's
  card, plus a *simulated* so-close count beside Max's real one. Its own module because
  `review.js` reaches for `document` at module scope.

**It reports rather than gates, and `maps` is why.** Its `north : south :: east : west` set
is `directional` and therefore flagged — and is perfectly fair, because convention settles
the order. Max solved it and said *"green made me smile."* A blocking check would have
failed a board he approved and published.

### Also this session

- **The Obama terminal failure diagnosed.** 01 authored `President`, `Obama` and `Cabinet
  secretary` as the left term of two pairs each; 02 grouped each with its twin and three of
  seven sets used one word twice. Round 2 fixed the duplicates and then failed the stance
  floor — it oscillated between two constraints that pool could not satisfy. `rule-009`
  already forbade it but illustrated only the *chain* shape, so it gained the
  **shared-subject** example, with provenance recorded. The upstream half — 01 is under no
  obligation to author pairs that can be legally grouped — is backlogged deliberately at n=1.
- **The Revision Proposer exercised for the first time.** It had zero `proposal-verdict`
  events ever. Knights already had a brief; Harry Potter did not, and re-running produced a
  good one first try — which surfaced that a brief failing validation twice returns `null`
  with **no artifact at all**, so "not attempted" and "attempted and failed" are
  indistinguishable. Backlogged. The HP brief restates Max's own note: he wrote *"this could
  be stronger the two things were more alike"*, it wrote *"mix an object lifecycle (wand)
  with a creature lifecycle (phoenix)"*, sourced `both`, with his three praised sets marked
  `doNotChange`.

### Session gate

- **Automated: PASSED.** `npm test` → **940 pass, 0 fail** (was 895; +45).
  `node tools/check-board.js` → **10 boards, all clean.**
- **Claude-verifiable: PASSED, and it reproduced the defect end to end.** A real pipeline
  run carrying a symmetric set flagged `set-coordinates`, did **not** fail the board, and
  rendered all three notes plus the simulated count in the Studio with no console errors.
  Then, in the served game at `?puzzle=yankees-baseball`:
  - `Bullpen : warm-up :: Batting cage : practice swings` → **"Correct!"**, 16→12 tiles,
    tier and label revealed, no bean spent.
  - `Gehrig : Ruth :: Mantle : Maris` — one pair flipped, the submission a real player
    makes — → **"So close! Right four words — check the order."** and *"1 of 4 mistakes
    used"*. **The exact defect D-9 names, in the shipped game, on a published board.**
  - `Ruth : Gehrig :: Mantle : Maris` → **"Correct!"** So it really was only the order.
  - All four new boards serve 200 with 4 sets and 16 words.
  - *Recorded honestly:* the browser pane's synthetic clicks do not reach `data-action`
    control buttons (tile taps work fine), so the controls were driven with dispatched
    bubbling clicks. Screenshots returned blank all session; evidence above is DOM reads.
    Neither is a game defect — no `src/` file changed this session.
- **Max acceptance: OPEN.** Two things: the Harry Potter and Knights revision briefs are
  written and waiting for his verdict, and D-9's flags need reading against played boards.

- **Next:**
  1. **Judge the two revision briefs** (Harry Potter, Knights). Each verdict starts D-5's
     counter toward the bounded auto-revise loop — currently at zero of ~10.
  2. **D-9's graduation trigger:** across roughly the next six boards, compare the flags
     against so-close-concentrated losses and the (still never-used) `order-ambiguous` tag.
     Agreement → promote to blocking at 04a. A flagged set that repeatedly plays fine →
     the symmetric list is too wide.
  3. **Phase 5's remaining work is now the select screen and `puzzles/index.json`**, not
     content — the 10+ bar is met.
  4. `sleep and dreams` is unjudged; three older approved boards (`music`, `weather`,
     `history`) still unpublished, now a quality question rather than a quantity one.
  5. Carried: the cross-reading check's third attempt · rater abstention floor · rubric
     compilation must read version-1 sets by TAGS not action · nine `valid-but-unfair`
     events need reading by hand · `README.md` never mentions `npm run studio:review` ·
     05–08 concurrency · the proposer's silent-null path · 01's illegal-pool gap.

## 2026-08-05 — Five approvals, no rush, and the lever that had become one

Max ran seven boards and judged five. **Five approved, zero rejected** — the first batch
with no rejections at all, against the previous batch's zero approvals. And then:
*"while these are publishable, i didn't get the same rush or joyous reaction as a few of
the earlier puzzles."* He asked to be told if he was going numb. Recorded as **D-8**.

### He was not, and his own scoring proves it

| batch | praise-tags per set | sets scoring all four |
|---|---|---|
| rounds 1–2 (Aug 2–4) | 1.33 | 6% |
| Aug 5 early | 2.29 | 21% |
| Aug 5 20:xx (zero approvals) | 1.43 | 25% |
| **this batch** | **3.15** | **75%** |

`feedback.js` records all-four-on-all-four as his *"this is ASTO"* signal, earned by only
two boards ever; this batch put it on 15 of 20 sets. `not-evocative` **15 → 0**,
`too-obscure` **6 → 0**, `valid-but-unfair` **9 → 0**. Numbness reads as lower scores.
Craft went up while delight went down — two axes, and the gap between them was the work.

### The diagnosis, after Max corrected it twice

I first read it as the naming set moving into the Black slot, and proposed forbidding
that. He refused: *"they can both be black, depending on the puzzle. I don't want to fall
into a repetitive hole where only one type of puzzle is one difficulty."* The data agreed —
this batch's Blacks were the **more** varied five shapes, against a-tree and birds both
running `before-after`.

Sorting every set by where its difficulty came from found the real gap. *Ordinary words,
surprising arrangement* was present and **always easy**; *rare words, ordinary
arrangement* was present and **always the hard end**. Nothing was a plain-word set that
was genuinely difficult — which is exactly what a-tree's Black had been.

**A missing capability, not a misplaced set.** Difficulty and vocabulary had become the
same lever. I caused part of it: D-7's specificity instruction said a hard set *"may ask
for the word an enthusiast knows"*, one route up, and the pipeline took it every time.

### Built — the levers, agent by agent

Max asked which agents could proliferate the fix rather than loading it onto 01. Two were
working against it.

- **03** was told to judge *"clarity, abstraction, **familiarity** and misdirection"* — so
  a rare word literally **was** difficulty. The conflation was in the measurement. Every
  graded set now reports `difficultySource`, enforced by a semantic check.
- **04** ranked by that number and promoted the top of it. It now receives the source, is
  told a board reads best when its difficulty is not all from one place, and records
  `blackSetReasoning`.
- **07** is a model — it knows what `speleothem` is, so it plays a knowledge-gated set as
  though it were open. The one agent whose job is "how does this feel to play" could not
  see the defect Max found by playing. It now plays as a general-audience solver and
  reports `knowledgeGated`, still blind: words, never sets.
- **02** decides which sets exist at all; told that arrangement-hard groupings are the
  scarcer resource.
- **01** gets both routes as a palette, plus one requirement about range — at least one
  group hard through arrangement alone.

**Variety by steering, never by rule.** `variety.js` gained a second dimension beside shape
usage: how each board's hardest set earned its difficulty. The brief leans against a rut of
three and says nothing otherwise; a mixed history produces no steer, pinned as a test,
because a rule reserving Black for one kind is the failure this exists to avoid. Themed
runs now get that steer too — they had never received anything from the index but stance
quotas.

### What verification caught

- **The fallback classifier is weak, and the replay says so.** For boards graded before
  `difficultySource` existed the index falls back to the shape. Against Max's verdicts it
  gets all four boards he loved right and **only 2 of the 5 he found flat** — `coronagraph
  : glare` is `prevention`, `perihelion : orbit` is `sequence`, and a shape id cannot see
  that the words are rare. Which is why 03's judgement is primary and the shape is only a
  fallback.
- **A correction to my own finding.** I inferred from the telemetry that Max had judged the
  boards he loved by reading rather than playing. He played them; a-tree predates the
  recorder, which stores only completed playthroughs. What stands: **0 wins in 8 recorded
  playthroughs**, all at four mistakes. Since he loved boards he may also have lost, losing
  is not what kills the joy — which is why his "leave the rules alone" call is right.

### Session gate

- **Automated: PASSED.** 887 → **895 tests, 0 fail.**
- **Claude-verifiable: PASSED, and beyond the mocks.** A themed mock run round-trips all
  three new fields, and the steer is correctly **silent** on the live corpus (its last three
  boards are mixed). But mock fixtures replay canned answers and prove nothing about whether
  the real model can satisfy a new instruction — the lesson 06 taught earlier the same day —
  so both risky agents were also called for real, against the `caves` board:
  - **03 validates, and the reframing works on the board that caused the complaint.**
    `speleothem : stalactite` now grades **difficulty 1** — *"category-and-kind structure is
    immediately obvious once the specialized terms are recognized"* — with its difficulty
    attributed to `vocabulary`. The old rater made that set the Black. It labelled all four
    caves sets `vocabulary`, which is itself the finding: that board had no arrangement-hard
    set anywhere. 348 output tokens, `end_turn`.
  - **07's detector names the walls.** `speleothem`, `karst landform`, `guideline`,
    `collar`, `swarming` — five of the sixteen words on a board Max approved. It solved the
    board with **0 mistakes**, which is the point: the model cannot feel a vocabulary wall,
    but asked directly it can name one.
- **Max acceptance: OPEN.** A fresh batch answers it: does a set hard through arrangement
  alone produce the reaction, and does the hardest set vary in kind across boards.

- **Next:**
  1. **A fresh batch is the test.** Watch whether any board tops out through arrangement
     with ordinary words, and whether `knowledgeGated` starts naming the walls.
  2. If every board still tops the same way, the lever moves upstream to the stance quota —
     `inclusion` is quota'd every run and is where all three nameable shapes live.
  3. **Judge a Revision Proposer brief** — still zero `proposal-verdict` events.
  4. Carried: the cross-reading check's third attempt · rater abstention floor · rubric
     compilation must read version-1 sets by TAGS not action · nine `valid-but-unfair`
     events need reading by hand · `README.md` never mentions `npm run studio:review` ·
     05–08 concurrency · Phase 5's select screen.

## 2026-08-05 — The deploy failure gets a name in the recovery playbook

Short follow-on to the entry below, which shipped the deck and found — while shipping it —
that GitHub Pages had been failing its build since 03:34Z. `.nojekyll` fixed the *cause*
in that entry. This one closes the *detection* gap, because the fix does not stop it
happening again for some other reason.

**Why this is worth a playbook section rather than a note.** The failure is silent by
construction: a failed Pages build leaves the previous version serving, so the site keeps
returning 200, the game keeps loading, and `git status -sb` correctly reports in sync. Every
signal Max already checks says everything is fine. `docs/recovery.md` had **"Did everything
make it to GitHub?"** — pushing — and nothing at all about deploying. Pushed and deployed
are different things and the playbook treated them as one.

- **`docs/recovery.md`** — new section, *"It's pushed, but the live site is still the old
  version"*: what the failure looks like (it hides), the one command that answers it
  (`gh api .../pages/builds/latest`), where the same thing lives in the GitHub UI, and a
  standing warning not to delete `.nojekyll`.
- **`docs/backlog.md`** — the detection gap recorded as its own item. `.nojekyll` removed
  today's cause; nothing yet checks that a push actually deployed. A post-push build-status
  check would close it, and that is a real change rather than a doc line.

**Not made a house rule.** `.nojekyll` is deployment configuration, not a departure from a
house default — no HR entry is owed, and `docs/design.md` is untouched. No locked decision
moved: schema v1.0, zero dependencies and engine-first are all where they were.

### Session gate

- **Automated: PASSED.** `npm test` → **841 pass, 0 fail**. No board or code changed this
  unit — docs only — so `check-board` had nothing new to gate.
- **Claude-verifiable: PASSED, against the live site rather than localhost.** After the
  fix, the Pages API reported **`status: built`, commit `4631f7b`, no error** — the first
  successful build since 03:34Z. Live checks: `/ASTO/` 200, `/ASTO/docs/presentation/` 200,
  all four deck assets 200, and the newly published boards (`trees-tools-and-time`,
  `gotham-connections`) 200. The deployed page was loaded and inspected: 15 sections, zero
  broken images, no horizontal overflow, and **no un-rendered `{{` left in the output** —
  which is the direct proof that Jekyll is no longer touching the files.
- **Max acceptance: OPEN, unchanged.** The deck's story and tone remain his call, and
  slides 10 and 11 are still the two verified by computed style rather than pixels.
- **The other session was never disturbed.** Its six in-flight run directories and its
  uncommitted `decisions.jsonl` are untouched; `main` was advanced by ref rather than by
  checkout precisely to avoid stashing another session's work.

### Phase status

**Still not a phase gate.** Phase 5 remains in flight — five playable boards against a bar
of ten. What changed today is that the boards and the deck are now genuinely *live*, which
had been quietly untrue all day.

- **Next:**
  1. **Max reads the deck** at `https://maxrowe1031-rotn.github.io/ASTO/docs/presentation/`
     and rules on story and tone. Slides 10 and 11 want a human eye.
  2. **Nothing links to the deck.** It is reachable only by pasting the URL. A link from
     the title screen is one line, if he wants the game to point at it.
  3. **Close the detection gap** (backlog) so a failed deploy cannot hide for a day again.
  4. Carried: the Class 13 peer cut is a different deck from this one · the game's missing
     favicon · rater abstention floor · rubric compilation must read version-1 sets by TAGS
     not action · `README.md` never mentions `npm run studio:review` · 05–08 concurrency ·
     First Light `explanation` pass · GDD drift.

## 2026-08-05 — The process, made legible: a shareable deck built from the record

Max asked whether the way this project is documented would let someone go back, review
everything, and build a deck out of it. The answer was yes without qualification, and the
check itself is the finding: **the narrative did not have to be reconstructed, only
assembled.** Two audits (this repo and `../maigd-course-handbook`) found the arc, the
reversals, the dollar figures and the failures already written down in prose, with dates.
The one real gap was visual — neither repo contained a single screenshot.

Scope: a **LinkedIn portfolio piece**, to be shared alongside the finished game. Not the
Class 13 peer deck, which is a different audience and a different cut.

### Built

- **`docs/presentation/index.html`** — a self-contained 15-slide HTML deck, ASTO's own
  tokens copied inline (cream/ink/honey, the four tier triples, Bree Serif + Nunito with
  the game's own system fallback, the `feTurbulence` grain). Full-viewport scroll-snap
  sections on desktop, plain scrolling on phones (snap is disabled under 900px — every
  slide is taller than a phone screen, so snapping only fights the reader), arrow-key
  navigation, and a slide counter.
- **`docs/presentation/assets/`** — four screenshots captured from the running game and
  Review Studio: the board, the filled frame before Confirm, the win screen with all four
  tiers, and the rebuilt feedback instrument. 416K total including the HTML.
- **A hand-authored inline SVG** of the pipeline — the eight stages, the deterministic
  gate sitting between 04 and 05, the bounded rebuild loop, the human editorial gate, and
  the corpus feeding back into 01. The one thing no screenshot could show.
- **One backlog line:** the game 404s `/favicon.ico` on every load. The deck carries an
  inline data-URI icon; the game could take the same one-liner.

### The argument the deck makes

One thesis: *the game is the deliverable; the machine that authors it — and the governance
around that machine — is the work.* The differentiator for this audience is not "I used
AI" but **AI that was governed**: six decision records in the shape
*recommendation → override → accepted risk → reconsider-when*, a rule retired rather than
deleted, a finding deliberately held at n=2, and a graduation trigger written before the
feature that would earn it. Slide 14 is a list of things that were wrong, including
Claude's own method error and the synthetic-feedback near-miss.

### What verification caught

- **The suite was red when I started and I did not paper over it.** The first `npm test`
  gave 783 pass / 3 fail — one a test-isolation clash, one a genuine mid-implementation
  `409 vs 200` in the in-flight publish work. That killed the planned "811 tests green"
  stat outright. By wrapup the other session's work had landed and the suite reads
  **841 pass, 0 fail**, which is the number now on the slide.
- **A Studio screenshot that was illegible at column width.** A 1280px capture rendered
  into a ~370px column is decoration, not evidence. Slide 10's run list was replaced with
  the A/B result rendered as real HTML; slide 11's form was moved full-width and cropped
  to the block that carries the point.
- **Numbers moved under me mid-build.** `puzzles/` went 3 → 6 boards, runs 38 → 40, D-6
  landed and HR-2's deferral was discharged while the deck was being written. The planned
  slide line "approved boards still have nowhere to land" was **false by the time it would
  have shipped** and was rewritten. Every figure was re-sourced at wrapup.
- **`git add -A` swept my work in, again.** Commit `de1de60` — a docs commit about the
  publish seam — pulled five of my in-progress screenshots into itself, three of which I
  had already discarded. This is the same scar the 2026-08-05 feedback-instrument entry
  records, hit while writing the slide that describes it. History left alone; flagged for
  Max rather than rewritten on a branch another session is working in.

### Session gate

- **Automated: PASSED.** `npm test` → **841 pass, 0 fail**. No board was added or edited,
  so `check-board` had nothing new to gate; `test/content/board-integrity.test.js` re-gated
  all shipped boards as part of that run.
- **Claude-verifiable: PASSED WITH ONE NAMED GAP.** Verified in the browser at 390×844 and
  1440×900: 15 sections, **no horizontal body overflow at either width**, all four images
  load and render at 66–75% of natural size (crisp, not upscaled), the diagram and the
  cost table scroll inside their own containers, console clean, and the page requests
  **nothing but its own HTML, its four local PNGs and an inline SVG**. Slides 1, 5, 7 and
  12 were confirmed visually, including a real bug the pixels caught: SVG `fill=`
  presentation attributes lose to CSS classes, so "editorial gate" was rendering dark-on-dark
  and invisible until the fills were moved into their own selectors. **The gap:** slides 10
  and 11 were rebuilt late and screenshot capture then failed repeatedly in this environment
  (the Browser pane reported a 0×0 viewport; Playwright timed out on every capture). Those
  two are verified by computed style, box geometry and DOM placement — visible, correct
  colors, correct contrast, crop applied, figure correctly in `.wrap` — but **not confirmed
  pixel-by-pixel**. Worth Max's eye.
- **Max acceptance: OPEN.** The story, the tone, and what slide 15 admits to are his call,
  and this is a gate of the third kind. He has not seen it yet.
- **Nothing in the game, the Studio or the tests was touched.** My changes are
  `docs/presentation/**` plus one `docs/backlog.md` line and this entry.
- **Locked decisions intact:** no code changed. The deck loads Google Fonts exactly as the
  game's own `index.html` does, with the same designed system fallback — matching existing
  project practice rather than departing from it, so no HR entry is owed. HR-1 is about
  dependencies, and `package.json` still has none.

### Published — and a broken deploy found on the way

Max's call: merge the whole branch rather than cherry-pick the deck, so the D-6 publish
seam and the five new boards ship with it. Gate re-run on exactly what was about to land —
**841 pass, 0 fail**, and `check-board` clean on **all six** shipped boards. Merged
fast-forward and pushed `dce10aa..bb3b611`.

`git checkout main` refused, because the other session holds an uncommitted
`decisions.jsonl`. Rather than stash another session's work, `main`'s ref was advanced
in place with `git fetch . work/publish-approved-boards:main` — a fast-forward that never
touches the working tree. Their four in-flight runs stayed exactly where they were.

**Then the deploy did not appear, and the reason was already there.** `/ASTO/` returned 200
but `/ASTO/docs/presentation/` 404'd. The Pages API tells the real story: **five
consecutive `Page build failed` errors going back to 2026-08-05T03:34Z.** The live site has
been serving a stale build for most of today, and nothing surfaced it — the game still
loads, so a broken deploy is invisible from the outside.

**Cause:** Pages runs a legacy Jekyll build, and Jekyll parses Liquid in committed HTML and
Markdown. `docs/asto-gdd.html` contains `{{ toc }}` and `{{ t.num }}`; `docs/governance.md`
contains `{{PLACEHOLDER}}`. Eleven tracked files carry `{{` or `{%`.

**Fix: a root `.nojekyll`.** ASTO uses no Jekyll — it is hand-written HTML/CSS/ESM served
verbatim. Disabling the processor removes this entire class of failure permanently rather
than escaping braces file by file, and it matches HR-1's zero-machinery stance.

### Phase status

**This is not a phase gate.** Phase 5 is untouched and still in flight — five playable
boards against a bar of ten, with the publish seam (D-6) only landed today. The deck is a
portfolio artifact, deliberately outside the phase plan.

- **Next:**
  1. **Max reads the deck** at `http://localhost:8080/docs/presentation/index.html` and
     rules on story, tone, and how much of slide 15's "not finished" to keep. Give slides
     10 and 11 a look specifically — they are the two not visually confirmed.
  2. **Decide where it lives.** It is committed but **not pushed and not merged** — the
     branch it sits on carries another session's in-flight work, so publishing it is Max's
     call, not a wrapup's. GitHub Pages next to the game is the obvious home.
  3. **The deck's numbers are a snapshot** and will go stale as Phase 5 fills. Re-source
     slide 15 before sharing if more than a few days pass.
  4. Carried: the Class 13 peer cut is a *different* deck from this one, if he wants it ·
     the game's missing favicon · rater abstention floor · rubric compilation must read
     version-1 sets by TAGS not action · `README.md` never mentions `npm run studio:review`
     · 05–08 concurrency · First Light `explanation` pass · GDD drift.

## 2026-08-05 — Six boards, no approvals, and the two axes that were missing

Max ran six boards in parallel — `cars`, `grateful-dead`, `shadows`, `construction` and two on
`childhood` — and approved **none**. Three rejected, one failed, two left in revise. The worst
batch since the taxonomy work landed, and the most useful: 36 feedback events consistent
enough to name causes rather than symptoms. Recorded as **D-7** in `docs/design.md`.

### What the corpus said

- **`not-evocative` was the top tag at 15 uses, across four boards.** The recurring shape of
  his complaint is *"technically works, but…"* — *"boring as a blank wall"*, *"the MOST BASIC
  terms relating to childhood, slapped on the page"*, *"is this what anyone thinks when they
  imagine their childhood?"*
- **Every single before-after / sequence set was rejected — six of six.**
- **Stage 08 rated the "absolute snooze" board `unity: strong`** — *"every word sits comfortably
  inside one coherent world"*. Both were right. Unity and evocativeness are orthogonal, a board
  of a subject's most obvious nouns is unified *by construction*, and only unity was measured.
  The word "evocative" appeared in the feedback form's tags, in the docs, and in **no agent
  prompt anywhere**.

### The finding that decided the method

I read the actual `prompt.txt` that produced the cars defect. **All twelve editorial rules were
present verbatim** — including *"check whether any four of its words form another valid
analogy"* and *"B must follow from A necessarily, not occasionally"* — and three of them were
broken. That was the **revision** attempt, whose notes also named the specific defect, and it
returned `ignition : shutdown :: departure : arrival`: the identical four words.

So validity defects got a **mechanical check, not a thirteenth rule**. An instruction is a
request; a validation failure sends the stage back.

### Built

**The cross-reading check.** `ignition : shutdown :: departure : arrival` also reads
`ignition : departure :: shutdown : arrival` — and because the engine refuses that reading, a
player who sees it is **marked wrong for being right**. `board-integrity.js` says in its own
header it cannot catch this: the sixteen words *are* distinct, so the sweep sees a clean board.
`crossPairings` now enumerates the two refused groupings of every set — pure, in the engine,
beside the accepted-order algebra it is the complement of — and 06 answers them as a checklist
of closed questions. Its validator refuses an answer that skipped one, invented one, or
answered one twice, which meant teaching the pipeline to hand a stage's **input** to
`validateOutput`: a validator that cannot see the question can only check that the answer is
well-formed.

**Specificity, and Max's correction.** I framed it as one axis — generic ←→ obscure, aim for
the middle. He corrected it: *obscurity comes from overgeneralisation too*. His own notes prove
it — *"so boring and **unspecific** the puzzles barely make sense"*. One root cause, three
tags: a too-general word is boring (`not-evocative`), stops being true (`valid-but-unfair`,
*"to state that every crew contains a mason?"*), and reads as vague (`too-obscure` — of six
uses only "squit" was genuinely an esoteric word). So the instruction is not "be evocative" but
**"prefer the most specific word your reader will still recognise"**, with all three failure
modes named. 01's theme line stopped being `Theme to work within: X`, and its *"prefer familiar
words"* line stopped saying *familiar* when it meant *recognisable*.

**The evocativeness verdict** now sits beside unity in 08, naming the flat words and the
sharper ones where it can — the form Max's own best note took (*"replacing 'Steal Your Face
logo' with 'Stealie'"*). Shown, never enforced.

**The Revision Proposer's brief now wins.** `cars` produced the first brief ever and it was
right — correct root cause, correct stage, three candidate fixes, the three praised sets under
`doNotChange`. It was never sent: the plain Request-revision button answered first, carrying
raw notes and no protection list, so the revision churned the good sets and reproduced the
defect. The button now defers to the brief rather than racing it — but does not send it
silently, because an inferred `proposal-verdict` is not evidence.

**05 and 06 moved to the sets they are about**, folded shut on the card. They had been
describing these defects for weeks, filed by stage at the foot of the page, so Max rediscovered
them by playing the boards.

### The check did not work the first time, and the replay is why we know

Replaying it over the six judged boards — the step that exists *because* Max's verdicts are an
answer key — **three of six came back unparseable**, two failed validation, and the one that
validated missed the defect he had found. Diagnosed on a single board:
**`stop_reason max_tokens`, 16,000 output tokens, zero characters of text.**

I had made 06 combinatorial and left it at `high`. **Third time this repo has met that
failure** — 02 died on the `beach` run at high, 04 came down from xhigh with *"94% of its
billed output was thinking behind an 876-token answer"* — and `pipeline-config.js` was carrying
both notes when I walked into it.

Fixed by shrinking the ask rather than raising the ceiling: checklist lines carry short ids
(`set-b#1`) that the answer echoes instead of retyping four words — the old shape invited the
model to send back the formatted *string* it had been shown, which is exactly what childhood-1
did for all eight — and a `note` is required only on a reading that HOLDS. Then 06 came down to
`medium`, over a pinned test whose reason was good (*"the last thing between a flawed board and
Max's time"*) and which a stage returning nothing outranks. Same board after: **`end_turn`,
6,234 output tokens, all eight readings answered.**

**And then it still did not work.** Three rounds against the same six boards:

| round | caught | spurious | behaviour |
|---|---|---|---|
| 1 — high effort, verbose shape | — | — | 3 of 6 unparseable, 16k thinking, no text |
| 2 — compact shape, medium | 1 of 3 | 13 | flags any tidy 2×2 grid as an analogy |
| 3 — plus an anti-grid instruction | 0 of 3 | 2 | quiet, misses what it was built for |

Every round-2 false flag had one signature — *"guitarist and drummer are parallel musician
roles"*, *"song and album are parallel categories"* — the model calling **symmetry** an analogy,
which round 2's prompt already told it not to do. Round 3's sharper wording fixed that and
over-corrected into silence.

**The mechanism works and the judgement does not.** The enumerator is exact and pins both real
defects as tests; the plumbing forces a complete answer and no longer truncates. What is
unreliable, after two honest attempts at the wording, is the model's answer. It ships **quiet**
— advisory, folded shut, ~2 false flags across six boards — and it is **nowhere near a gate**.
I stopped there rather than spend more of Max's credit guessing at prompt wording.

**A finding from building the answer key, and Max split the tag the same day.**
`valid-but-unfair` was three meanings wearing one name — and its own chip described a *fourth*
(*"technically correct, but the player could not have known"*) that he had never used it for.
Four of nine uses meant "the same four words regroup into a second analogy that also works",
which had no chip at all; the other five were already covered by `not-always-true` and
`not-evocative`.

So the fix was **one precise tag and one retirement**, not three new chips: `second-valid-reading`
now sits in the fairness group where the vague one was. `valid-but-unfair` stays in the
vocabulary and validates forever — `schemas.js` already carried the rule, *"APPEND ONLY. A
removed tag would orphan the events that already carry it"* — and a new `RETIRED_TAGS` set is
what keeps it off the form. `FEEDBACK_FORM_VERSION` moved to 3, because the **absence** of that
tag now means something different before and after today.

Also collapsed a copy while there: `formVersion` was a literal `2` in `review.js` beside the
real constant in `feedback.js`, one bump away from splitting a population by accident.

### What the measurement decided

The obvious move — promote 05's `boardPasses` to a gate — is **wrong, and the numbers say so**:

| | |
|---|---|
| `boardPasses: false` | **31 of 36 attempts ever (86%)**; 7 of 7 this batch |
| set-level agreement with Max | **13 of 24 (54%)** |
| precision when it flags | 8 of 12 — 4 sets he called publishable, 7 rejections missed |

So the cross-reading check **reports and does not gate**, and earns its gate the way D-5's
auto-revise does. Its reconsider-when is recorded in D-7: agreement with Max's
`valid-but-unfair` / `order-ambiguous` calls across roughly the next six boards.

### Session gate

- **Automated: PASSED.** 841 → **882 tests, 0 fail.** Every one of the corpus's recorded
  feedback events still validates, including the nine that carry the retired tag. The enumerator is pinned against both
  real defects as fixtures — cars' `ignition/shutdown` and the Grateful Dead's
  `formation/disbandment` — plus `planting : felling :: budding : withering`, the same stance
  Max loved, as the case that must still enumerate without being condemned.
- **Claude-verifiable: PASSED.** In the browser, the `ignition : shutdown :: departure :
  arrival` card now carries 05's grain-mismatch note under a folded "1 machine note"
  disclosure, and the two clean sets carry none. The enumerator produces **48 closed questions
  across the six boards**, including Max's two verbatim.
- **Max acceptance: OPEN.** The question the next batch answers is whether `not-evocative`
  drops.
- **Corpus insured first**, before any analysis was acted on: the whole batch was uncommitted
  at session start — the same exposure as the 2026-08-05 scar.

- **Next:**
  1. **A fresh batch is the test.** Watch `not-evocative`, and watch whether the cross-reading
     check agrees with his `valid-but-unfair` calls — that agreement is what promotes it to a
     gate at `04a`.
  2. **Judge a Revision Proposer brief.** Still zero `proposal-verdict` events; the path is
     now clear, so the next revise-board should record one.
  3. **Phase 5's select screen.** Six boards in `puzzles/`, ten needed — and the three older
     approvals (`music`, `weather`, `history`) are still held back for a re-read.
  4. Carried: rater abstention floor · slim-down lap at ~10 judged boards · rubric compilation
     must read version-1 sets by TAGS not action · `README.md` never mentions
     `npm run studio:review` · 05–08 concurrency · First Light `explanation` pass · GDD drift.

## 2026-08-05 — Approved boards reach the game

Max ran and judged two more boards between sessions — **`birds` and `batman`, both approved**
— using the new form. That took the count of approved pipeline boards to seven with nowhere
to land, while `puzzles/` still held only the two hand-authored boards against Phase 5's 10+.
The bottleneck had moved: the rubric loop was producing faster than the project could absorb.
Recorded as **D-6** in `docs/design.md`.

### What the two new boards proved

- **D-4 works in his hands.** Both were approved *as wholes* while individual sets drew
  `revise-set`, `set-needs-edit` and `change-difficulty`. That independence is exactly what
  the old form could not express and what the 141-event corpus exposed. Max acceptance on the
  rebuilt instrument: **passed in use**, not just in the browser.
- **The `fix:` field went unused on all 13 events** — but the fix prose is there, inside the
  notes: *"It would have been better and more challenging if it had been…"*. The field is not
  wrong; it is not where his hands go. Two boards is not yet evidence.
- **D-5 still has zero evidence.** Both boards were approved, so no Revision Proposer brief
  was ever spent. The graduation trigger has not started counting.

### Built — the loop closes

There was no translator to write. A run's `board.json` is **already schema v1.0**;
`check-board` passes a candidate board unmodified. What was missing was a seam.

**`studio/storage/puzzle-store.js`** is the only module that writes into `puzzles/` — a second
write seam beside `run-store`, separate on purpose because a run directory is the Studio's own
record while `puzzles/` is what the shipped game loads. The gate lives in the store: the board
is checked with the **game's own** validator and integrity sweep before a byte is written, a
refusal writes nothing, and the slug is pattern-matched before it is joined onto a path.

**`POST /api/runs/:id/publish`** is legal only from `approved`, and **records** publication
rather than transitioning it — the run stays approved, and the record in `decisions.jsonl` is
also what tells a second publish that it is a republish rather than a collision.

**`?puzzle=<slug>`** in `app.js`, so a published board can actually be played. Phase 5's
routing seed, pulled early on purpose: *the file validated* is not the same claim as *it
reaches the player*, and without this the gate could only have been the weaker one.

### The correction Max made mid-session, and why it mattered

I proposed publishing under the **run** slug. Publishing the first board showed the flaw:
`beach-retry` is a lifecycle name recording that the first beach run truncated, and the
published id is the key Phase 5 will persist per-puzzle results under — renaming it later
orphans saved progress. The repo's own precedent settled it: **`asto-first-light` is derived
from the title "First Light"**. Max chose title-derivation; `batman.json` was republished as
`gotham-connections.json` before anything depended on it.

The derivation now lives in `studio/slug.js` and is **served to the review page**, so the
destination shown before the click is the destination — the same reasoning that put the stage
list in `stage-registry.js`. It replaced **three** drifting copies of the same function.

### What verification caught

- **`variety.js` would have poisoned its own brief.** Any board in `puzzles/` without a
  `SHIPPED_LABELS` entry was counted as `unknown`. Publishing four boards would have added
  **sixteen** to the tally the variety brief reads — while their shapes were already counted
  through their runs, by the reliable path. Found before publishing, fixed with a failing test
  first, then **measured against the real corpus afterwards: published boards contribute 0.**
- **My integrity test asserted something impossible.** I wrote a "board fails the sweep" case;
  the schema catches duplicate words first, and with four sets of sixteen distinct words 16/16
  is arithmetic. The sweep is kept for what it actually guards — it samples the real
  `engine.submit()`, so a future widening of acceptance stops publication instead of shipping
  boards whose answers changed underneath them. The test now says that.

### Session gate

- **Automated: PASSED.** 811 → **841 tests, 0 fail.** `node tools/check-board.js`: **6 boards,
  all clean, 16/16 accepted of 43,680 tuples each.** Published boards are globbed by
  `test/content/board-integrity.test.js`, so they are re-gated by every future `npm test`.
- **Claude-verifiable: PASSED.** End to end in the browser: the Publish panel showed the
  destination *before* the click, publishing wrote the file and the decision record, the panel
  then read "Published as …" and offered Republish. In the game at
  `?puzzle=trees-tools-and-time` and `?puzzle=gotham-connections`: the board loads, plays, and
  a set solves — **"Correct!"**, green tier revealed with its relationship label.
- **Max acceptance: OPEN.** He chose the four boards and the id convention; he has not yet
  played a published board as a player rather than as an editor.
- **Corpus insured first.** The birds and batman judgement was uncommitted at session start —
  13 events on one disk, the same exposure as 2026-08-05's scar. Committed by explicit path
  before any other work; `.gitignore` admitted exactly the four exception kinds.

**Now in `puzzles/`:** Trees, Tools, and Time · For the Birds · Gotham Connections · By the
Shore · First Light · Warm Up (tutorial). **Six boards, four of them the pipeline's.**

- **Next:**
  1. **Phase 5's select screen.** There is now content to select, and `?puzzle=` is a query
     param rather than a route. The manifest, `select-view.js` and per-puzzle persisted
     results are the remaining Phase 5 work — and the persistence keys off the published ids
     this session locked.
  2. **Six boards, ten needed.** Three older approvals (`music`, `weather`, `history`) predate
     the taxonomy work and form v1 and are held back for a re-read before they ship.
  3. **Judge a Revision Proposer brief** — still zero. Mark one board publishable-after-a-fix
     and see whether the brief is worth sending.
  4. Carried: rater abstention floor · slim-down lap at ~10 judged boards · rubric compilation
     must read version-1 sets by TAGS not action · `README.md` never mentions
     `npm run studio:review` · 05–08 concurrency · First Light `explanation` pass · GDD drift.

## 2026-08-05 — The instrument that measures Max's taste, rebuilt

Two more real boards, both **rejected as wholes with three of four sets praised** — and the
form could not say that. Diagnosing it turned into a rebuild of the feedback instrument, plus
the fixer agent Max asked for. Recorded as **D-4** and **D-5** in `docs/design.md`.

### What the 141-event corpus said

- **21 of 79 tagged set-events say `reject-set` while carrying only praise** — the board button
  stamped its action onto every set block. Sets he called *"a great green"* are logged as
  rejected, in the corpus `rubric.md` will be compiled from.
- His richest signal is prose: 103 notes, 112 chars average, carrying **fix proposals 6×**,
  emotion 10×, solve order 5×, cross-set comparison 14×.
- Three tags never used; seventeen chips in one undifferentiated wall.
- **Stages 05 and 06 had already found both defects he found.** 06 flagged
  `[medium] cross-set-association: Museum, Louvre…` — *"Louvre and Musée d'Orsay are themselves
  extremely famous museums"* — and `[high] unfair: spy, alias, operative, cyanide pill` —
  *"near-synonyms… stock spy-gear items"*. Both are his complaints, almost verbatim. Nothing
  routed them anywhere.

### Built

**The corpus is insured.** `studio/runs/.gitignore` was `*`; all 141 events lived on one disk.
Judgement files are now versioned, machine output still ignored, and a test replays every
historical event against the current schema.

**The form** now follows his rule — *board rejection = the whole is unpublishable; sets still
get honest independent reads*: tri-state board verdict (with blockers), per-set verdicts that
are never inherited, a first-class "how would you fix it?" field, tags grouped by kind, and
`formVersion` on everything so two instruments are not read as one population.

**Play telemetry** rides the existing view contract — a recorder is a view that renders to a
data structure — so solve order, mistakes and so-close events are captured with no change to
the game. First completed playthrough only.

**The Revision Proposer**: a pure agent, deliberately not a pipeline stage, reading his
judgement first and the evaluators' second, proposing never authoring, editable before sending.
Every brief records accepted / **edited with the text** / discarded — the evidence its
auto-revise graduation trigger needs.

### What verification caught (all of it, before Max saw any of it)

- **A terminal-status flaw of my own design:** `rejected` leads only to `archived`, so a
  proposal offered after a rejection had a "Request revision" button that could never work.
  Corrected: *publishable after a fix* now **saves** rather than decides, keeping the run in
  `awaiting-review` — the only status a revision can be requested from.
- **Three architectural corrections from run-store**, each of them right: it refuses an
  unregistered stage id, and refuses any write into a completed attempt. An attempt directory
  records what the *pipeline* did; a review-time brief is not that. Proposals became run
  artifacts via a new `writeRunArtifact`.
- **A fixture bug the agent's own validator caught** — my proposal fixture named the spy
  board's sets while mock runs replay First Light, and `setsExistOnTheBoard` rejected it.
- **A latent state bug:** the playthrough record was module-level and never reset, so one
  board's play could have attached to another — the exact contamination the first-play-only
  rule exists to prevent, arriving by a different door.

### Session gate

- **Automated: PASSED.** 779 → **811 tests, 0 fail.** Every one of the 141 historical feedback
  events still validates.
- **Claude-verifiable: PASSED.** In the browser: all new controls render; a mixed review
  recorded `revise-board` + blockers alongside `set-publishable` on a praised set **while the
  Reject button was pressed** (the regression is dead); an approved board spent no proposal;
  the proposal panel rendered with its fixes, protected sets and pre-filled brief; editing the
  brief recorded `edited` with the diff. End-to-end through the API: save → run stays
  reviewable → proposal → revision accepted (`202 → revising`).
- **Max acceptance: OPEN.** He has not used the new form yet. That is the next thing.
- **Caught at wrapup, in the corpus that had just been insured:** four runs created minutes
  earlier to exercise the review UI had been swept into version control by `git add -A`,
  carrying feedback *Claude* had typed to drive the form. Synthetic judgement is
  indistinguishable from Max's once it is in `feedback.jsonl`, and that file is what
  `rubric.md` compiles from — it would have taught the pipeline from nobody's taste. All four
  removed from git and disk; **25 committed feedback files remain, all Max's**. `brief.mock`
  cannot be the guard, since the design experiments and the harbor fixture are mock runs
  carrying his real judgement — so the separator is intent: verification runs are slugged
  `verify-…` and gitignored whole.

- **Next:**
  1. **Review the next board with the new form** — the verdicts, the fix field, and whether the
     grouped tags make `not-always-true` findable at last. If it still goes unused after a few
     boards with grouping, that is real evidence rather than the one-day silence.
  2. **Judge a Revision Proposer brief.** Mark one publishable-after-fix and see whether the
     brief is worth sending. Accept/edit/discard is the graduation evidence.
  3. **Approved boards still have nowhere to land** — HR-2's approval-into-`puzzles/` deferral,
     now with three approved boards behind it. Should headline a session soon.
  4. Carried: rater abstention floor · slim-down lap at ~10 judged boards · rubric compilation
     must read version-1 sets by TAGS not action · `README.md` never mentions
     `npm run studio:review` · 05–08 concurrency · First Light `explanation` pass · GDD drift.

## 2026-08-05 — The first great pipeline board, and the bug the other runs were hiding

Max ran three real boards. One was **the best result the pipeline has ever produced**; one
truncated. Diagnosing the failure found a design flaw in my own work from the day before.

### The win — "Trees, Tools, and Time"

> *"haha!! YES!! This one felt amazing. This was perfect, diverse in its puzzles, quizzical,
> totally thematic, gave a sense of joy at every turn while still presenting a challenge."*

Four sets, four stances, and **all four scored `good-unchanged + strong-reveal +
difficulty-accurate + feels-like-asto`** — the **first pipeline board** ever to do that (round
2's night board was the only other, and it was hand-made). D-3's Black-slot prediction landed
too: the inverting set (`planting : felling :: budding : withering`) drew *"the opposite
arrangement makes this analogy stand out from the rest… I felt especially good about this
one."* And the changed *activity* showed up unprompted: *"i hunted around a bit before i got
it."*

### The bug — a set is two pairs sharing ONE relationship; a stance is a CATEGORY of them

The `paris` run truncated stage 02 at 40,000 tokens and 300s. It had satisfied the stance
quota perfectly — all four stances — while using **eleven shapes exactly once each**. No two
pairs shared a relationship, so no set could form without the grouper searching for pairs to
force together. Across the three runs the correlation is monotonic and explosive:

| run | relationships carried by ≥2 pairs | orphans | stage 02 |
|---|---|---|---|
| a-tree | **7** | 0 | 1,893 tok · **18s** |
| beach | **3** | 8 | 13,645 tok · 129s |
| paris | **1** | 11 | 40,000 tok · **truncated** |

**My quota was specified at the wrong granularity** — it enforced stance coverage but not
*pairability*. Third instance of this repo's recurring scar: a rule enforced at one door and
not the one downstream.

**The fix:** `01` now requires four relationships each carried by two pairs, spanning four
stances, stated in the prompt and enforced in `validateOutput`; the rejection names the
orphaned shapes, since an orphan is one partner pair away from being a set. The real pools
from all three runs are pinned as tests, so the check must keep sorting them the way the
pipeline actually experienced them.

**Verified on the theme that failed.** `paris-retry`: 7 matched shapes, 0 orphans; stage 02
fell from 40,000 tokens/truncated to **1,392 tokens / 12s** — a 29× reduction — and the run
completed at **$0.37** (vs $0.79) with four distinct stances and strong unity. Board:
*"Paris, Piece by Piece"*. **779 tests green.**

### Also settled

`02-theme-grouper` went back to **medium** earlier in the session after it truncated the first
`beach` run at high ($0.71, no board) — see the entry below. Worth noting the two fixes
compound: the effort revert stopped 02 thinking unboundedly, and the matched-pairs floor
stopped it *needing* to.

- **Next:**
  1. **More real runs.** Two boards approved, one of them outstanding; the pipeline now has a
     groupable-pool floor, so watch whether stage 02 stays fast (a-tree 18s, paris-retry 12s)
     or drifts back up.
  2. **`paris-retry` and `beach-retry` await Max's judgement** in the review loop.
  3. Carried: the rater can abstain the pool below four and nothing checks it · slim-down lap
     at ~10 judged boards (02's numbers have changed enough that the lap should re-measure it)
     · the fixture board's feedback needs separating when `rubric.md` is compiled · `README.md`
     never mentions `npm run studio:review` · 05–08 concurrency · First Light `explanation`
     pass · GDD drift upstream.

## 2026-08-05 — The first real run died at stage 02, and what it taught

Max started the first real run under `2026-08-04-taxonomy-shakedown`. It failed: **`beach`,
stage 02 truncated at max_tokens 16000, then again at 24000** after `llm.js` raised it —
**$0.71 and ~7 minutes for no board.**

### The cause was mine, and the evidence was already on disk

- **02's own baseline refuted the bump.** Six real runs at `medium`: **3,756 / 3,814 / 4,123 /
  4,277 / 4,314 / 4,435** output tokens, 36–42s each. The answer 02 writes is ~4k of JSON. At
  `high` the *thinking* ran past 24,000 without converging — 163s, then 255s.
- **`high` was not the problem; 02 was.** Stage 06 runs at `high` across six runs
  (3,474–7,044) and never truncates; 01 at `high` produced a clean pool. What breaks is high
  on a **combinatorial** stage — the same reason `pipeline-config.js` records 04 coming down
  from xhigh ("94% of its billed output was thinking behind an 876-token answer"). I applied
  that lesson backwards.
- **My stated reason for the bump was checkably wrong.** I raised 02 because it "composes
  under a stance floor now" — but the stance work had deliberately been moved *upstream* into
  01's quotas. The failed run proves it: 01 delivered exactly the four quota'd stances
  (inclusion 4, time 3, event 4, possession 3). **02's job got easier, not harder.**
- **I also raised the wrong ceiling.** Max asked for no run-killing limits; I raised `limits`
  (the runaway-run caps) and left `maxTokens: 16_000`, the per-request ceiling that thinking
  and the answer *share*. That is the one that killed it — the failure `pipeline-config.js`
  warns about in its own comments.

### The fix, and a real board

`02-theme-grouper` → `medium`; profile → `2026-08-04-taxonomy-shakedown-2` (the map changed,
so the corpus must not merge two populations). **772 tests green.**

Then a real `beach` run at the new setting — **complete**: *"By the Shore"*, four sets in
**four distinct stances** (inclusion `seabird : seagull`, time `summer : swimming`, event
`lifeguard : swimmer`, possession `leash : surfboard`), unity **strong**, and the unity pass
caught a genuine trap unprompted — `shell` pulling toward the clam/mollusk set. The whole
pipeline downstream of 02 ran on real output for the first time.

### Two things the run refuted, recorded rather than smoothed over

1. **I predicted 02 at medium would return to ~4k / ~40s. It came in at 13,645 tokens /
   129s — 85% of the 16,000 ceiling.** The vocabulary block I called a "secondary,
   contributing" cause is doing more than I judged. Caveat in both directions: 01 also swung
   5,340 → 12,226 at *identical* settings, and the config already documents 4.5× run-to-run
   variance at this stage — so this is **n=1 and a signal to watch, not a measurement**. But
   the margin is thin enough that a harder theme could truncate at medium too.
2. **My argument against raising `maxTokens` was weaker than I stated it.** I argued a bigger
   ceiling only buys a slower failure, because the request sat at 255s of `llm.js`'s 300s
   non-streaming timeout. That was true *at high effort*. At medium the same stage took 129s,
   leaving real room — so Max's instinct for headroom has better support than my pushback did.
   Unresolved deliberately: at ~13.6k tokens per 129s, a 24k ceiling lands near the 300s
   timeout, so the honest answer is that **the transport, not the number, is the binding
   constraint**.

Cost of the successful run: **$0.79, 8.7 min, 9 requests** — above the ~$0.5 estimate, with
01 (12,226) and 07 (11,537) the other heavy stages.

- **Next:**
  1. **Max judges "By the Shore" in the review loop** — D-3 item 4, still the open acceptance
     gate. It is the first pipeline board built to the arrow finding.
  2. **Watch 02's headroom.** If a run truncates at medium, the fix is not a bigger ceiling
     (see above) but cutting 02's work: it is shown all 36 vocabulary entries when its
     candidate pairs already carry declared shapes. Trimming that is the cheapest lever.
  3. Carried: the rater can abstain the pool below four and nothing checks it · slim-down lap
     at ~10 judged boards · `README.md` never mentions `npm run studio:review` · 05–08
     concurrency · First Light `explanation` pass · GDD drift upstream.

## 2026-08-04 — The pipeline learns the arrow finding: vocabulary, stances, unity

D-3's authorised work, built — with the design sharpened twice by Max mid-planning and once
by a failing verification test. The goal, in his words, now leads the design record: *a
puzzle unified by theme and words, varied in execution by different kinds of relationships.*

### What was decided (all with Max, recorded in design.md's D-3 amendment)

- **rule-007 eliminated**, not reworded — it was inherited from the retired crew, and its
  word *transformative* forbade three of approved First Light's four sets. Retired with
  provenance; its real intent (B is a thing, never an adjective) now lives in what the
  vocabulary contains.
- **Two axes, not one:** research (Herrmann & Chaffin 1984, same authors as the taxonomy —
  element agreement predicts felt similarity r=.707; family alone leaves r=.355 unexplained)
  agreed with the playtests: family carries library **coverage**, **stance** — the kind of
  question a set asks — carries board **composition**. Family is never enforced per board;
  it would have rejected Night B.
- **Pipeline structure: quotas now, merge armed.** Stance quotas land at the creation door
  (01's brief, both drivers); the 01+02 set-first merge stays parked behind a named trigger.
- **Shakedown profile** `2026-08-04-taxonomy-shakedown`: 01/02 high, 03/08 Haiku→Sonnet,
  ceilings raised ~40× not removed (Max: never shut a run down mid-test). Slim-down lap at
  ~10 judged boards reverts caps and effort together, by measurement.

### What was built

- `studio/corpus/relationship-index.json` v2.0 + `vocabulary.js`: 36 Bejar relation types —
  family · stance · paradigm pair · failure mode · Chaffin elements; legacy aliases keep
  history countable (the free-text field had left 40% of pairs invisible to the brief).
- **Eight stances**, because the verification test refused seven: with absence folded into
  possession, Night B — the best board in the corpus — failed its own rule. `absence` is
  its own kind of question now.
- Enforcement at every door: brief quotas → pair-author span check → grouper floor → 04a
  gate (four distinct stances, named on rejection). The builder is told, and told that the
  set inverting the board's grain is a Black candidate.
- **Unity scored, never gating:** 08 judges "do the sixteen words read as one world",
  outliers named or the output is invalid; shown in the Review Studio header. The review
  card **teaches while it shows** — stance, paradigm, failure mode per set — so more kinds
  of output widen Max's checklist instead of outrunning it.

### Session gate

- **Automated: PASSED.** 741 → **771 tests, 0 fail**; `check-board` clean on both shipped
  boards. The retirement is proven on the wire (no agent prompt contains *transformative* —
  read from the prompt.txt a run wrote, all eight carried it before).
- **The machine reproduces Max's blind verdicts:** Night A refused at the grouper with the
  setAside hint; Night B completes. Pinned as tests, alongside the **KNOWN LIMIT** that
  round 1's kitchen board declares four stances yet played as one — stance is a proxy word
  choice can defeat; the card showing claimed stances is the second line.
- **Claude-verifiable: PASSED.** Mock harbor run through the Studio API: brief carries
  quotas, board renders with stance lines + unity header, and plays through the game's own
  controller (green set solved in-browser, console clean).
- **Max acceptance: NOT YET.** Nothing here has produced a real board. That is deliberately
  the next session, and the whole point.
- **Locked decisions intact:** schema v1.0 untouched — stance and family live in Studio run
  artifacts, never on a puzzle (verified: no `stance`/`family` key in `puzzles/`). Zero deps
  (`package.json` unchanged). `git diff main..HEAD -- src/ styles/ index.html puzzles/` is
  empty: the game itself was not touched this session.

**Phase status: Phase 5 (puzzle select + content) — gate NOT met, and not claimed.** This
session was Studio work that *unblocks* Phase 5's content, not Phase 5 itself: `puzzles/`
still holds only First Light and the tutorial, and the phase gate (all boards green, select
state survives reload, full §16 acceptance pass) is untouched. What this session closed is
D-3's authorised pipeline work; what it opened is D-3 item 4, the real runs.

*Left behind deliberately:* one mock run `2026-08-05T01-30-19.030Z-harbor` in the git-ignored
`studio/runs/`, created to verify the review surface. It is `brief.mock: true`, so the variety
index excludes it by construction — but it will appear in Max's run list. Delete it whenever;
it is evidence, not state.

- **Next:**
  1. **Real runs under the new pipeline — D-3 item 4, the Max-acceptance gate.** Start 2–3
     themed runs (~$0.5 each at shakedown settings), judge them in the review loop. The
     machine's arrowless sets have never been seen; only Max's judgement says whether they
     are any good. Watch for: the grouper stance floor firing repeatedly (→ the named 01+02
     merge trigger) and the opposite complaint (incoherent — unity's job to catch).
  2. **The rater can abstain the pool below four and nothing checks it** — carried; stage 02
     has a floor, stage 03 still does not.
  3. **Keep the loop toward ~30 boards → rubric.md**, and at **~10 boards under
     `2026-08-04-taxonomy-shakedown`**, run the slim-down measurement lap (effort, 03/08
     models, budget ceilings revert together).
  4. Carried: `README.md` never mentions `npm run studio:review` · 05–08 concurrency ·
     First Light `explanation` pass · GDD drift to propose upstream · the mock run marked
     `approved` in the corpus, flagged for Max.

## 2026-08-04 — Two blind playtests, and the thing that actually makes a board feel varied

Continuation of the session below, after its work was merged. Max raised a design question
rather than a task: the pipeline starts from a theme and discovers relationships from the
words — should it name the relationship first instead? *"Did that make sense?"*

It did, and the corpus agreed with the symptom he described.

### What the corpus said

- **~80% of all 284 pairs ever authored are "one thing becomes or produces another."** Max's
  own words for it: *"they often have to do with one thing following another thing."*
- **A method error of mine, caught by Max.** I first claimed four relationship types had
  *never* been produced. He disagreed — he'd seen animal/home and sand→glass boards — and he
  was right. I had counted the declared `shape` **string**, not the relationship built; with
  39 of 48 shape strings invented free text, a place-occupant set labelled "shelter" was
  invisible to the count. Reading all 67 sets instead: ~10 are genuinely non-causal. The
  direction held; the specific claim was false and the method invalid.
- **A likely mechanical cause:** `rule-007` tells every agent a pair must be *"directional
  **and transformative**"* with two transformation examples. Read literally it forbids three
  of the four sets on the approved First Light board.
- **A measurement bug:** the `shape` field is free text, so **40% of pairs are uncountable**
  by the variety brief — the diversity steering has been running on 60% of the data.

### Max's own correction, which changed the work

> *"I can't be fully relied on to create a foundation for analogies because I am not an
> expert. I'm merely interested in playing them."*

So instead of building a taxonomy from taste, we went and found one. **Bejar, Chaffin &
Embretson (1991)** — 10 families, 79 relation types, developed at ETS to classify GRE verbal
analogy items, reachable via SemEval-2012 Task 2 under CC-BY. Preserved with all paradigm
pairs in **`docs/research/semeval-2012-taxonomy.md`**, with provenance, licence and a note on
where ASTO sits on it. Two of ASTO's locked decisions turn out to be independently validated
there: pair **order** matters (reversed pairs are marked bad examples), and relation
membership is **graded**, which is exactly `rule-011`.

### Two blind A/B playtests — and the first one was wrong

Max declined to adopt the resulting design rule on argument alone: he wanted to feel it. So
both rounds were hand-made boards, installed as mock runs, played blind in the Review Studio.

- **Round 1 (`experiments/four-family-board/`) invalidated its own design.** A board with one
  set from each of four *formal* families read to Max as *"all the same — an object moving
  forward in time somehow"*, and he demoted yellow, red and black all to green. Formal
  taxonomy diversity produced **zero** felt diversity: every set still carried an **arrow**.
- **Round 2 (`experiments/arrow-round-2/`) replicated the corrected hypothesis** — blind,
  letters flipped, and with an equally evocative control so the effect couldn't be a theme
  artefact. The mixed arrowed/arrowless board was approved as *"the best puzzle yet… This is
  ASTO"* and is the **first board in the corpus to score `good-unchanged + strong-reveal +
  difficulty-accurate + feels-like-asto` on all four sets.** The all-arrowed control was
  rejected with Max naming the effect himself, blind: *"another 'arrow' puzzle."*

Recorded as **D-3** in `docs/design.md`, including its explicit **n=2, not-law** status at
Max's instruction, and the four pieces of pipeline work it authorises.

### Session gate

- **Automated: PASSED.** `npm test` → **741 pass, 0 fail**. `tools/check-board.js` clean on
  both shipped boards **and** all four experiment boards (16/16 of 43,680 tuples each).
- **Claude-verifiable: PASSED.** Both rounds installed through `run-store`'s public API as
  mock runs and confirmed rendering and playable in the Studio (a set solved in-browser on
  round 1's Board A).
- **Max acceptance: PASSED — this gate was the playtest, and it answered.** Four boards
  played, 24 new feedback events, a clear and replicated verdict.
- **Nothing in the game or the Studio changed.** `git diff main..HEAD -- src/ styles/
  index.html puzzles/ studio/` is empty; this branch is docs and `experiments/` only.
- **Locked decisions intact.** Schema v1.0 untouched — every experiment board is ordinary
  schema v1.0 and passes the same validator.

### The loop

**117 feedback events across 20 boards.** Note for whoever compiles `rubric.md`: **4 of those
boards are hand-made experiments**, so their judgements are evidence about *design*, not about
pipeline output — do not conflate them (also in `docs/backlog.md`).

- **Next:**
  1. **Teach the pipeline the arrow finding — design.md D-3, in its stated order:** reword
     `rule-007` (it currently forbids the sets Max rated best) · make `shape` a controlled
     vocabulary from the taxonomy, each entry tagged arrowed/arrowless (fixes the 40%
     uncountable bug at the same time) · a board-composition rule for the builder, not four
     sets of one texture · then real runs, judged in the existing review loop. **Max asked for
     this to be picked up at the start of the next session.**
  2. **The rater can abstain the pool below four and nothing checks it** — carried; killed
     Max's `cars` run. Stage 02 has a four-set floor, stage 03 does not.
  3. **Keep the loop toward ~30 boards, then compile `rubric.md`.** 16 pipeline boards judged.
  4. Carried: relationship-first generation stays parked (D-3's work may deliver most of its
     benefit without the reorder) · `README.md` never mentions `npm run studio:review` ·
     05–08 concurrency · First Light `explanation` pass · GDD drift to propose upstream · the
     mock run marked `approved` in the corpus (`2026-08-03T02-44-09.138Z-surprise-me`),
     flagged for Max, not deleted.

## 2026-08-04 — The feedback started feeding back

The session began as one more effort lever and turned into the first time Max's reviews
changed what the pipeline is told. Four units of work, each verified before the next started.

### 1. The last effort lever, and three doors left open

`01-pair-author` high → medium — named but deliberately unapplied last session, to keep the
02/04 measurement readable. Measured on one real run: **$0.2097 total, 128s**, against a
$0.542 pre-re-aim average. Stage 01 itself fell to **$0.0278**, below the cheapest of its four
`high` observations ($0.0449 / $0.1084 / $0.1134 / $0.1824); thinking share **95% → 73%**.
n=1 at a stage with 4.5× variance is not proof — *"below the minimum of four priors"* is the
honest claim. Profile bumped to `2026-08-03-lean-2`, with a test that fails if the effort map
changes without it.

Three bugs found while doing it, all the same shape — **a rule enforced at one door and not
the others**:

- **The stale server.** `runner.js` imports `DEFAULT_CONFIG` at module load, so a Studio left
  running spends at yesterday's settings (~$0.23 once). `GET /api/config` now reports the
  config **the runner holds** — never a re-read of the file, which would always agree with the
  repo and so report a stale server as current — shown in the run list beside the button that
  spends money under it.
- **`run.js` still defaulted to 8 pairs** — the exact count that killed the `music` run for
  $0.16. The floor went into the Studio API on 2026-08-03 and never into the CLI. Bounds now
  live in `pipeline-config.js`, where the constraint belongs, and both drivers import them.
- **The variety index counted mock runs**, so a fixture replay of First Light was steering real
  runs away from its shapes. `run-store` records `brief.mock` explicitly for this reason;
  `variety.js` was not honouring it.

### 2. Four tags, a tier picker, two rules, and a subject

Max asked whether his feedback had taught the pipeline anything. It had not: the ten rules
reaching every agent came from the GDD (six) and the retired crew (four), and the only reader
of `feedback.jsonl` anywhere was the page that displays it back. Reading all 55 events:

- **Two rules adopted** (`rule-011`, `rule-012`, source `feedback-batch-1`) — see **D-2** in
  `design.md`, including Max's amendment to the second and the "short labels" rule the corpus
  **refuted** (praised 8.8 words vs faulted 9.3; the longest he liked was longer than the
  longest he faulted).
- **Four tags**, append-only, 13 → 17: `not-always-true`, `no-unifying-theme` (board-scoped),
  `not-evocative`, `feels-like-asto`. Each was something he had written in prose repeatedly
  because no chip carried it — on the skiing board he wrote five notes and ticked nothing.
- **The "plays like" tier picker**, built on the schema's own `change-difficulty` action with
  `before`/`after` — anticipated when the corpus was designed, never given a control. "This
  should be a red" had been sayable only in prose, which nothing can count. Picking the current
  tier records nothing; `difficulty-accurate` already says that.
- **Surprise-me picks a subject.** It steered relationship *shapes* and never a subject, so it
  was structurally incapable of the themed boards Max consistently approves — both surprise-me
  boards he judged were rejected for exactly that. It now draws from `studio/corpus/subjects.js`
  and keeps its shape brief: subject **and** variety.

### 3. The candidate board is playable

`studio/review/ui/play.js` builds a live game from the game's **own** `GameController` and
views — the composition `app.js` uses, minus title, tutorial and routing. The deliberate
opposite of the duplicated board markup: nothing about how play *works* is copied, so the
Studio cannot drift from the game's rules. It is also the boundary law read from the other
direction, and is recorded as such under HR-2.

### 4. Two content bugs, one fixed and one recorded

The first real surprise-me run **failed** at the 04a gate ($0.2816): the grouper had returned
five sets, two carrying a byte-identical label. Four distinct labels existed — a valid board
was available — and the builder picked both duplicates on all three attempts while the gate
could only re-roll against an unchanged pool. The same blind re-roll as the 2026-08-03
pair-count failure, one field over. Fixed at both points: stage 02 now rejects duplicate
labels (naming the offender and pointing at the earlier set), and the builder is told the
gate's four-distinct-relationships rule, which it had never been told.

Then Max caught the last one himself: **a surprise-me run was still named `-surprise-me`** on
disk after drawing a subject. The slug now follows the subject in both drivers. My original
reasoning — "the slug records how the run was started" — was wrong; the run id is the folder
you open and the line you scan, and it should say what the board is about.

### Session gate

- **Automated: PASSED.** `npm test` → **741 pass, 0 fail** (697 at session start).
  `node tools/check-board.js puzzles/*.json` → both shipped boards clean. Boundary greps clean:
  `api.js` still free of fs/fetch/node:http, `run-store.js` + its own `atomic-write.js` the only
  artifact writers, engine still pure. **Game untouched** — `git diff main..HEAD -- src/ styles/
  index.html puzzles/` is empty.
- **Claude-verifiable: PASSED.** Verified in the browser on a real mock board, not asserted:
  played a full game in the review page — "So close!" charged a mistake and cleared the
  selection, a bean filled roast brown, a correct solve revealed its tier card, a full win
  reached the banner, Back to preview restored the static copy. Recorded a real judgement and
  confirmed the two events that landed in `feedback.jsonl`, including
  `change-difficulty {before:1, after:3}`, reading back as *"plays like red — was green"*. Board
  block offers 17 tags, set blocks 16. Both new rules confirmed **verbatim in a live prompt**.
  The duplicate-label fix verified by **replaying the failing run's own grouper output** through
  the new validator.
- **Max acceptance: OPEN, as always.** Board quality is his. The `forests` board
  (`Nature's Blueprints`, $0.2710, 16/16 integrity) is with him — and he has already requested a
  revision on it. **Flagged honestly:** three of its four sets are structure-related, which may
  read as `repetitive-shape`.
- **Locked decisions intact:** schema v1.0 untouched, zero dependencies held, engine-first
  intact. New decision **D-2** recorded; spec amendments 3 and 4 added.

### The loop, by the numbers

**78 feedback events across 14 boards**, up from 25/5 at the last wrapup — Max is starting and
judging runs unprompted between sessions, which is the behaviour the loop was built to earn.

- **Next:**
  1. **The rater can abstain the pool below four, and nothing checks it.** Max's `cars` run
     died this way: grouper returned enough, rater abstained on two, builder refused with
     three. Stage 02 has a four-set floor; stage 03 does not. Same family as the two failures
     already fixed — fix it at stage 03, where a retry can still act.
  2. **Keep the loop to ~30 boards, then compile `rubric.md`.** 14 judged. D-2 pulled two rules
     forward; the compilation milestone is unchanged, and those two get re-derived from the
     full corpus rather than grandfathered.
  3. **Watch whether the subject makes boards narrower.** A subject plus three required shapes
     is a tighter brief than either alone — the `forests` board's three structure-ish sets may
     be the first sign. One board is not evidence; the next few are.
  4. Carried: `README.md` never mentions `npm run studio:review` · the Studio server prints its
     URL but not the config it loaded (the browser now does) · 05–08 concurrency (~20s, free) ·
     First Light `explanation` pass · GDD drift to propose upstream · a mock run marked
     `approved` still sits in the corpus (`2026-08-03T02-44-09.138Z-surprise-me`) — flagged for
     Max, not deleted, since it is his review record.

## 2026-08-03 — Session wrapup: the loop is running, and it costs a third less

*Dates: entries below are UTC, matching the run directory ids. Locally this was the
evening of 2026-08-02 — one continuous session that crossed midnight UTC.*

Closing entry. It records two things that were **not knowable** when the four entries below
were written: measurements across several runs rather than one, and Max's own review
activity, which happened while the last unit of work was being built.

### The re-aim, measured across runs instead of one

The entry below compared a single run to a single baseline and was honest that n=1 could not
support much. With every real run of the day in hand:

| | completed real runs | average |
|---|---|---|
| before the re-aim | 3 | $0.542 · `[0.534, 0.523, 0.568]` |
| after the re-aim | 2 | **$0.355** · `[0.414, 0.296]` |

**A 34% reduction**, and the second lean run (`ocean`, $0.296) lands essentially on the
target Max asked for. The single-run figure I logged below (−20%) understated it, because
that run was the one where `01-pair-author` spent 4× its usual.

**And the first quality signal: `weather`, built on the lean profile, Max approved.** One
board is not proof, but it is the exact question the profile stamp was built to let him
answer, and it is now answerable from the corpus rather than from an argument.

### Failures were nearly a third of the day's spend

Four real runs failed, costing **$0.989 of $3.32 total**. Every one was a supply or
re-roll problem now fixed: the 8-pair brief that could never yield four sets, and the gate
re-asking the builder against an unchanged pool. Those fixes are worth more than the effort
re-aim on any day where a run would otherwise have died.

### The rubric loop is not hypothetical any more

**25 feedback events across five boards, 19 carrying a written note**, with verdicts spread
across approve, revise and reject — and Max has been recording them himself, unprompted.

**This answers the open question about the tag vocabulary**, which has been outstanding
since R1 shipped. **Eleven of the thirteen tags have been used organically.** Only
`repetitive-shape` and `valid-but-unfair` have never been reached for — and both are
plausibly just rarer cases rather than wrong ones. The vocabulary does not need changing
before the loop continues, which was the thing worth knowing early.

### Session gate

- **Automated: PASSED.** `npm test` → **697 pass, 0 fail** (623 at session start).
  `node tools/check-board.js puzzles/*.json` → both shipped boards clean.
- **Claude-verifiable: PASSED.** Every Studio change verified in the browser on real boards,
  not asserted: the promotion note, the analogy line in each feedback block, the effort
  profile in the header (`9 req · 41,421 tok · ~$0.4140 · effort 2026-08-03-lean`), and a
  three-word term rendering its `::` correctly.
- **Max acceptance: OPEN, and partly answered by his own activity.** Board quality remains
  his call. The tag-vocabulary item is effectively closed by use. The `ocean` board sits at
  `awaiting-review`.
- **Game untouched all session:** `git diff 0f888d7 -- src/ styles/ index.html puzzles/` is
  empty. Phase 5 and the game itself are exactly where they were.
- **Locked decisions intact:** schema v1.0 unchanged (D-1 explicitly did not move it), zero
  dependencies held, engine-first intact.

- **Next:**
  1. **`01-pair-author` high → medium.** It is now ~44% of a run and the most volatile line
     (2,681 / 2,825 / 12,008 output tokens across three runs at identical settings). Named
     but deliberately not applied — it was outside the approved plan's scope.
  2. **Review `ocean`**, which is waiting at `awaiting-review`.
  3. **Keep the loop going to ~30 boards**, then compile `rubric.md` from the approved rules.
     Five real boards judged so far; the corpus is at 25 events.
  4. Carried: the stale-server trap keeps recurring and deserves a real fix · 05–08 could run
     concurrently (~20s, free) · `07-test-player` is the next effort lever after 01 · First
     Light `explanation` pass · GDD drift to propose upstream.

## 2026-08-03 — The builder was proving something already proven

Max: a run costs ~$0.52 and takes ~6 minutes, roughly twice what he wanted. Measured from
the run records rather than guessed — three stages were **85% of cost and 84% of time**, and
on all three, **91–94% of billed output was thinking rather than answer**.

- **Max rejected the easy reading, and was right.** Told the board builder was the problem,
  he pushed back: it only picks one analogy per tier, it should be simple. It is — but its
  prompt gave it four jobs, and one was *"prove no two sets could regroup into another valid
  analogy."* That is combinatorial over sixteen words, **already done exhaustively by the 04a
  gate 200ms later** (43,680 ordered tuples), **done again by stage 06** — and per design.md
  risk 1, verified in code, *impossible to violate* with sixteen distinct words. The stage
  was deliberating at the pipeline's deepest setting about avoiding the impossible.
- **Changed:** the proof obligation removed from the builder's prompt, replaced with a line
  telling it the checker exists (the *design principle* — a false trail is a near-miss, not a
  genuine second answer — was kept; a pre-existing test caught that I had cut both) ·
  `04-board-builder` xhigh → medium · `02-theme-grouper` high → medium ·
  `06-adversarial-solver` **left at high**, being the last thing between a flawed board and
  Max's time · `01` and `07` deliberately untouched, to keep the measurement readable.
- **Also built:** an `effortProfile` version string stamped onto every attempt beside
  `pricingVersion`, and shown in the Studio next to the cost. Both answer the same question
  about a recorded number — *under what settings?* Max is judging ~30 boards anyway, so his
  existing judgements now also answer "did the cheaper profile make worse boards?" — the A5
  calibration, for free.

### The measurement, honestly

Baseline `01-04-43` (surprise-me, 14 pairs) vs new `04-11-05` (weather, 14 pairs):

| stage | baseline | now | |
|---|---|---|---|
| 01 pair author *(unchanged)* | 32s · $0.045 | **115s · $0.182** | ⚠️ 4× worse |
| 02 theme grouper high→medium | 65s · $0.104 | 16s · $0.032 | **4× faster, 3.3× cheaper** |
| 04 board builder xhigh→medium | 166s · $0.244 | 10s · $0.022 | **16× faster, 11× cheaper** |
| 06 adversarial solver *(unchanged)* | 59s · $0.091 | 47s · $0.079 | as expected |
| 07 test player *(unchanged)* | 13s · $0.024 | 26s · $0.048 | 2× worse |
| **total** | **347s · $0.517** | **248s · $0.414** | −29% time, −20% cost |

- **The two stages changed did exactly what was intended, and more.** Together they fell from
  $0.348 to $0.054. At 04 the thinking share collapsed from **94% to 40%** — the diagnosis
  confirming itself, not just a cheaper setting.
- **The target was missed anyway**, because `01-pair-author` — which was *not touched* — spent
  4× its usual on this run. Had it behaved as before, the run lands near $0.28 and ~165s.
- **A hypothesis of mine was wrong, and is corrected here.** Mid-run I attributed 01's cost to
  the themed brief. The `music` run was also themed and its 01 was cheap. Across three runs at
  **identical settings**, stage 01 produced **2,681 / 2,825 / 12,008** output tokens — 4.5×
  variance run to run. It is volatility, not the theme.
- **n=1 per configuration.** Single runs at a stage this volatile cannot support strong claims;
  what carries weight at 02 and 04 is the *size* of the change and the thinking-share collapse.
- **Verified:** `npm test` → **697 pass, 0 fail** · boundary greps clean · the board passes
  `tools/check-board.js` (16/16 of 43,680 tuples) · the Studio header reads
  `9 req · 41,421 tok · ~$0.4140 · effort 2026-08-03-lean` · and the board contains
  `Humidity : Fog :: Warm Ocean Water : Hurricane` — a three-word term rendering its `::`
  correctly, which is the exact case yesterday's shared-`analogyOf` fix repaired.
- **Not claimed:** whether the cheaper boards are *worse*. That is Max's judgement, and the
  profile stamp is what lets him answer it across a batch instead of from one board.
- **Next, reported not applied** (the plan said so explicitly): `01-pair-author` is now **44%
  of the run** and the most volatile line — high → medium is the obvious next lever, and would
  likely land the target on its own. Then `07-test-player`, then the deferred 05–08
  concurrency.

## 2026-08-03 — A run failed on arithmetic, and paid three times to find out

Max's `music` run failed: *"board failed integrity after 2 rebuild(s): board builder
returned no board: Only three graded candidate sets were provided."* Diagnosed from the
run's own artifacts, which is what yesterday's work was for.

- **The chain, and it is arithmetic.** The brief asked for **8 pairs** (the form's old
  default). A set is two pairs, so 8 is *exactly* four sets with zero slack. The grouper
  set aside 2 pairs as not belonging in any coherent set — leaving 6 pairs, so **3 sets**.
  The builder needs 4. It refused rather than inventing one, which is D-1's guard working.
  **8 pairs can only ever succeed if nothing is discarded, and grouping always discards.**
- **The expensive part was not the failure but the retrying.** The run paid for the rater
  and **three** board-builder attempts at `xhigh` — the highest effort in the pipeline —
  all against an unchanged pool of three sets. $0.163 to rediscover something knowable the
  moment stage 02 returned. This is the handbook's blind re-roll (§4.1): a retry that
  changes nothing is resampling.
- **Fixed, three ways, each at the earliest point it can be caught:**
  1. **Supply.** The brief floor is now **12 pairs** and the default **14** (the count that
     produced the first complete board), replacing a floor of 4 and a default of 8. A count
     of 4 could never have built anything. Enforced server-side, not only in the form.
  2. **Self-correction at stage 02.** The grouper must return at least four sets; fewer is
     a validation failure whose feedback points it back at its own `setAside` list — *"if
     two of them share a relationship, they are a set."* A retry here can genuinely fix the
     problem, because the model still has the discarded pairs in front of it.
  3. **No re-roll at the gate.** A pool smaller than four sets now fails the gate
     **immediately**, marked `fatal`, without entering the rebuild loop. The message names
     the pool rather than the builder — *"a rebuild cannot add candidates"* — so it points
     at the stage that actually went wrong.
- **Verified:** `npm test` → **690 pass, 0 fail** · the API rejects counts of 8 and 11 and
  accepts 12, checked over HTTP against a restarted server · the form reads
  `value=14 min=12` · a scripted three-set pool fails with the builder called **once**,
  where the real run called it three times. Two mock runs created as probes were removed.
- **Noticed again:** the running server held the old `api.js` until restarted — the same
  stale-module trap that cost $0.23 on 2026-08-02. It is on the backlog; it keeps recurring
  and is worth fixing properly.
- **Next:** unchanged — the board from the 01-04 run is still waiting for Max's review and
  his ruling on the tag vocabulary.

## 2026-08-03 — Promotion: the builder may label its hardest set Black

Follow-on from the entry below, after Max read the Board Builder finding. Recorded in full
as **design.md D-1** with its accepted risk and reconsider-when trigger.

- **Max's call:** ship a board even when the graded pool does not span all four tiers, and
  label the hardest set Black anyway. *"Upping the difficulty of level 4 maybe something we
  can train with the studio."* The rater's ceiling is to be taught through the review loop,
  not engineered around before the loop has run.
- **No locked decision moved.** Schema v1.0 still requires exactly four sets at difficulties
  1–4, and Black is still derived from difficulty 4 — there is no `tier` field. The builder
  now ranks its four chosen sets and assigns 1–4 in that order instead of matching grades
  exactly. That is Studio behaviour, not schema.
- **Built:** `promotions` on the builder's output, validated against the board it claims to
  promote (a promotion naming an absent set, or claiming no change, is rejected) · the 04a
  gate rejects any board set that was **not** in the graded pool, so the builder can choose
  and relabel but never author — enforced in code because a prompt can only ask · the Review
  Studio marks the card *"graded 3 — promoted to Black"*, since a promotion Max cannot see is
  a judgement he cannot give feedback on.
- **Verified:** `npm test` → **675 pass, 0 fail** · the promotion rendered in the browser
  through a real mock run: exactly one `.promotion`, on the black card, reading
  *"graded 3 — promoted to Black"*, italic in `--soft-ink` and **not red** — the no-list
  holds. The temporary fixture used for that check was restored (`git status` clean).
- **Next:** unchanged from below — Max reviews the waiting board and rules on the tag
  vocabulary. Note the board he is about to review was built *before* this change, so its
  Black set is the invented one, not a promoted one.

## 2026-08-03 — Aiming the model calls; the pipeline's first eight-stage run

Built on `work/studio-transport-aiming` (commits `0b1216b`, `8a4ba4f`). **No game code
touched** — `git diff main -- src/ styles/ index.html puzzles/` is empty.

- **Warmup found a fourth real run that was never logged.**
  `studio/runs/2026-08-02T23-08-42.315Z-surprise-me`, `brief.mock: false`, started ~90
  seconds *after* the R1 fixes merged, cost ~$0.23, died at `02-theme-grouper` with
  "response was truncated". It left **no stage folder at all**, so which stage failed had
  to be worked out by dividing token totals by request counts (3 requests / 15,213 tokens
  ≈ 5,071 each — impossible under a 16,000 ceiling, so it ran at the old 4,096).
- **The cause, and the proof.** The handbook's prototype-crew post-mortem records it
  exactly (`lessons-learned.md` §1.1): the Claude 5 family runs adaptive thinking by
  default, and `max_tokens` caps thinking and response text together. We send no
  `thinking` parameter, so stage 02 spent its ceiling on reasoning. **The stale server was
  still running when this session started** — PID 44977, started 22:45 UTC, seventeen
  minutes before the 23:02 commit whose fix it never loaded. Node caches modules; a
  running server never sees a code change.
- **The prototype's own fix was not adopted.** `thinking: {type: "disabled"}` predates
  adaptive thinking, and `budget_tokens` — what it was reaching for — is now a 400. Its
  agents only emitted JSON; ours rate difficulty and hunt alternate solutions, and that
  is reasoning we pay for on purpose. **Max chose per-stage `effort`** instead: `high` for
  the reasoning stages, `xhigh` for the board builder (§3: assembly, not generation, is
  the constraint-satisfaction problem that broke the prototype). Deliberately **no
  default** — effort is an error on Haiku 4.5, so the three checker stages must send no
  `output_config` at all, and a default would quietly put one on every request.
- **Also in `llm.js`:** `temperature` dropped (this model family rejects sampling
  parameters outright — nothing set it, so we were lucky rather than correct) · an
  `AbortSignal.timeout` so a wedged call becomes a bounded retryable failure · block types
  reported · the ceiling and effort **recorded**. Truncation now raises the ceiling once
  and retries; a second truncation is terminal naming both ceilings, instead of buying
  three copies of one failure. Empty text and `model_context_window_exceeded` are loud
  failures rather than a misleading JSON parse error and a silent success.
- **A dead stage now leaves evidence.** `prompt.txt` and `request.failed.json` are written
  on the failure path, the failure names its stage, and the attempt marks it failed.
  Tested by replaying this exact incident. **The real transport had no tests at all** —
  which is how a wrong request shape shipped; it has them now, with `fetch` injected.
- **Agreed with Max, from the same post-mortem:** the 04a gate now enforces **≥4 distinct
  relationship labels** — the first mechanical check here that can fail a schema-valid
  board, closing the backlog question and amending `design.md` risk 1 — and the crew's
  four hard-won content rules joined `corpus/rules.json` with provenance.
- **The real run: eight stages attempted, five complete, one board built.** Fresh server,
  `mock: false`, $0.37. 01 → 02 → 03 → 04 → 04a all passed. **Stage 03 cleared, which is
  the first live proof of last session's prompt fix**, and a real board passed the new
  integrity gate including the variety check. It failed at `05-analogy-validator`.
- **And the failure was readable off disk, which was the point.** Three more instances of
  one bug family, in three different agents. Last session's fix named each agent's
  *top-level* schema keys and the test enforced only those; **nested** required keys were
  still guesswork, and the model guesses from the shapes around it:
  - `02-theme-grouper` is handed pairs as `{a, b}` objects and its schema wants
    `["A","B"]` arrays. It returned objects. Rejected once, recovered on retry.
  - `05-analogy-validator` requires `pass` per verdict; the prompt named only `verdicts`
    and `boardPasses`, and the model wrote `passes` three rounds running. This killed it.
  - `04-board-builder` (falseTrails), `06-adversarial-solver` and `08-style-guide` had the
    same gap **latent** — the run never reached the last two.
  - The test now walks each schema to any depth and requires every `required` key to be
    named. **That generalization found the three latent cases; the run found one.**
- **A structural finding.** The run's brief asked for 8 pairs; the grouper made exactly 4
  sets from them, and the rater graded those 1, 2, 2, 3. With no difficulty-4 candidate the
  builder correctly **refused rather than compromise** (`insufficientSets`), and the gate
  sent it back. One-per-tier was arithmetically out of reach.

### The second run — eight stages, one board, `awaiting-review`

Max approved a second run with the brief raised to 14 pairs. **It completed: all eight
stages, `awaiting-review`, a board on disk, $0.53.** The first end-to-end proof of the
real transport, and the first board this pipeline has ever produced.

- **Every prompt fix verified live**, each at the stage that would have failed without it:
  02 returned `["Wallet","Cash"]` arrays first try, no rejection round · 05 returned
  `setId, pass, notes` exactly · 06 completed, and its keys were latent-broken this
  morning. The board **passed the new variety gate on real data**:
  `variety: {ok: true, distinct: 4}`.
- **`tools/check-board.js` on the generated board: clean.** Schema v1.0, 16/16 accepted of
  43,680 ordered tuples, 80 near-miss orderings. "Concealed Connections" —
  `Wallet : Cash :: Vault : Treasure` (green) · `Spider : Web :: Bakery : Bread` (yellow) ·
  `Ram : Sheep :: Mouse : Rodent` (red) · `Coal : Diamond :: Sand : Glass` (black).
- **The critic did not rubber-stamp:** the analogy validator returned `boardPasses: false`.
  Per the crew post-mortem §6, that is the correct posture, not a defect.
- **⚠️ The Board Builder authored a set instead of choosing one, and nobody rated it.**
  The rater graded five candidates 1, 2, 3, 1, 2 — **no difficulty 4 again, across both
  runs and ten graded sets**. On the rebuild the builder filled the gap by inventing
  `set-material-transformation` (`Coal : Diamond :: Sand : Glass`), which is **not in the
  graded pool**, and assigned it difficulty 4 itself. Its own prompt says "Choose exactly
  four sets from the graded candidates" and, failing that, refuse — it refused on round 1
  and invented on round 2. The board is good and passes every check, but its hardest set
  carries **no independent difficulty rating**, and GDD §16's difficulty loop compares
  *predicted* against *simulated*. **This is Max's call, not a bug to quietly fix:** either
  the builder may author to fill a tier (and the rater should then re-grade), or it may
  not (and the pool must be made to span four tiers upstream). Nothing has been changed.
- **Also observed:** a board-builder call at `xhigh` ran ~6 minutes. Well inside the new
  300s-per-request timeout only because the timeout is per request and it retried cleanly —
  but the Studio shows nothing but "running" throughout. Effort levels are a first guess
  and want calibrating against real latency and spend in A5.
- **Verified:** `npm test` → **664 pass, 0 fail** (623 at the entry below) · boundary greps
  clean: `llm.js` still owns the only server-side `fetch`, `run-store.js` is still the only
  writer of run artifacts, `pipeline.js` does no file I/O · a mock run through the restarted
  server reached `awaiting-review` with the board rendered · the live run's
  `request.json` states `maxTokens: 16000, effort: "high"` on its face, which is the fact
  that previously took arithmetic to recover · the generated board rendered in the Studio
  in ASTO's own design system, no console errors, and passed `tools/check-board.js`.
- **Total spend this session: ~$0.90** across two real runs.
- **Gate: the automated and Claude-verifiable parts are MET.** The suite is green, and a
  real run completed end to end with a board that passes the project's own content check.
  **Max acceptance is outstanding and is not claimed:** the board's editorial quality, and
  whether the thirteen quick-tags are the right vocabulary, are his judgement. The board is
  sitting in the Studio at `awaiting-review` waiting for it.
- **Next:**
  1. **Max reviews the board** — `npm run studio:review`, newest run. Record a real
     feedback event, and rule on the tag vocabulary. Changing it after thirty boards means
     re-reading old feedback through a new lens, so board one is where it is cheap.
  2. **Decide the Board Builder question above** — may it author a set to fill a missing
     tier, or must it refuse? Whichever way, the rater currently never returns a 4, and
     that wants addressing upstream rather than by the builder quietly compensating.
  3. Then the loop itself: batches of ~10 with a rules recompile between, so batch 3 vs
     batch 1 answers whether feedback actually changes the output.
  4. Carried: `effort` levels and the 300s timeout want calibrating in A5 against real
     latency and spend · First Light `explanation` editorial pass · GDD drift to propose
     upstream · the tutorial board's sets 2–4 wording is Max's to edit.

## 2026-08-02 — Review Studio R1, and the first real API run (which failed)

Third unit of work this session, on `work/review-studio-r1` (commits `8fe4b46`, `58c4d95`).
**No game code touched** — `git diff main -- src/ styles/ index.html puzzles/` is empty.

- **Max changed the plan, deliberately.** Rather than write `rubric.md` cold (A4's
  centrepiece), he wants it **compiled from ~30 recorded judgements**: generate a board,
  review it in a web UI, tag and annotate it, recompile rules between batches of ten. He
  proposed this himself — *"what if before we published a single puzzle, we went through
  20–30 iterations where I gave direct feedback on each one."* Judging concrete boards
  beats articulating taste in the abstract, and it yields a rubric with evidence attached
  to every line. **This reorders the approved Studio spec: a B1/B2 subset of the Review
  Studio moves ahead of A4 and A5.**
- **Scope agreed before building:** approve/reject/revise are **recorded only** — no
  landing into `puzzles/` (deferred to just before Phase 5b) · **no hand-editing**
  (deferred to B2) · real Anthropic transport, Max holds the key.
- **Built (`studio/review/`):** `api.js` — route handlers with no `node:http`, no `fs`,
  no `fetch`, so every rule is a function call in a test; IDs are pattern-checked before
  reaching the store, making traversal impossible by construction; the store's own guards
  stay the authority and map to 409 rather than being reimplemented. `runner.js` — the
  server's only door to the pipeline; 202-plus-polling because a real run takes minutes,
  with `manifest.status` (already a state machine) as the progress signal. `server.js` —
  binds `127.0.0.1` explicitly (`tools/serve.js` binds everything and is deliberately not
  reused); static serving is an **allowlist**, so `studio/runs/` and `.env` are not
  addressable rather than merely guarded. `ui/` — `board-html.js` is the spec's
  intentional duplication (amendment 2) as a pure string template, unit-testable with no
  DOM, using the game's classes and the game's derivations.
- **Also built:** `validateFeedbackEvent` + `validateRulesFile` (`schemas.js`) over the
  spec's ten actions and thirteen quick-tags — closed vocabularies, because the rubric is
  compiled from this corpus and a typo'd tag is signal that quietly disappears ·
  `corpus/rules.json` seeded **only** with GDD §10.2's six standards, with only
  `status: "approved"` rules ever reaching a prompt · `corpus/relationship-index.json` +
  `variety.js` for locked decision 6's surprise-me brief, counts recomputed on demand so
  there is no second source of truth · `env.js`, a `.env` loader that prints nothing on
  any path (naming a variable discloses which secrets exist; echoing a parse error echoes
  the line the secret is on) · run-store hardening: `appendFeedback` validates, and
  `appendEvent` moved under the run lock now that the decision log has two writers.
- **Three bugs found and fixed, each caught by a test written first:**
  1. **`runner.revise()` created the child attempt before building the transport**, so a
     missing key left the run wedged in `revision-requested` around an attempt that could
     never run. Reproduced live in the browser before fixing. A run now also records
     whether it came from fixtures, so a revision cannot silently switch to the real API —
     and a mock-derived board stays identifiable rather than counting as editorial signal.
  2. **The UI used `alert()`**, which blocks a page that polls itself; it wedged the
     browser pane mid-verification. Replaced with an inline notice.
  3. **Every agent's prompt could disagree with its own schema** — see below.
- **The first real API run failed, and the cause was ours (~$0.23).** Stage
  `03-difficulty-rater` was rejected three rounds running. Its prompt said *"Return one
  entry per set, keyed by its `setId`"*, so the model returned
  `{ "set-a": {...}, "set-b": {...} }` against a schema requiring `{ "grades": [...] }`.
  **The model obeyed the prompt; the prompt was wrong**, and the retry feedback lost to
  the instruction sitting in front of it.
  - **Fixtures could not have caught this.** A fixture is hand-written to match the
    schema, so A2's round-trip test proved *the schema accepts the fixture* — never that
    *the prompt produces it*. The two can disagree completely with every offline test
    green.
  - **New test `prompt-schema-agreement`** asserts every agent's prompt names the
    top-level keys its own schema requires. **It failed for five of eight agents.**
    `board-builder` is handled explicitly, its contract being "exactly one of `board` or
    `insufficientSets`", which a schema `required` array cannot express.
  - Fixed `difficulty-rater` (array, stated twice) and named the wrapper keys in
    `pair-author`, `theme-grouper`, `analogy-validator`. Stages 01 and 02 had only
    survived the failed run because the model guessed right.
- **Handbook consulted at Max's request** (he remembered debugging something similar in
  the prototype). **The failure is not recorded there** — and the search explained why:
  the prototype had **no difficulty-rater at all**; difficulty was deterministic
  (`crew.py:_normalize_board`, one set per tier). This Studio is the first to run that
  agent. **Max's decision: difficulty stays agent-rated**, since the GDD's difficulty loop
  needs it and he intends to give feedback on the ratings.
  - The search did surface a live prototype failure worth acting on:
    *"Sonnet-5 returned empty — thinking-by-default consumed the token budget."* Our
    transport sends no `thinking` parameter and Sonnet 5 thinks by default, with
    `max_tokens` capping thinking and output together. **`maxTokens` raised 4096 → 16000**
    (a ceiling, not a spend). This had not bitten us yet.
- **Verified:**
  - `npm test` → **623 pass, 0 fail** (500 at the entry below; +113 for R1, +10 for the
    prompt-schema suite). All 21 A1 run-store tests still green.
  - `node tools/check-board.js puzzles/*.json` → both clean. No board added.
  - **Boundary greps:** `api.js` and `runner.js` do no file I/O — everything through
    `run-store`; `llm.js` still owns the only server-side `fetch` (`review.js`'s is
    browser-side, calling its own API).
  - **Browser, with evidence:** run list and review page render; create → revise →
    approve all work over HTTP; double-approve correctly 409s; feedback lands as
    schema-valid `feedback.jsonl`; approved runs lock all four controls; no console or
    server errors. **Visual parity measured, not eyeballed** — tile background, border,
    radius, font, weight, size and body background are *identical values* to the game's at
    375×812 and 1280px, because the Studio links the game's real stylesheets. **No red
    anywhere** in the rendered page: the no-list holds.
  - The prompt fixes are verified **offline only** — see below.
- **Phase status: Review Studio R1 built; its automated and Claude-verifiable gates are
  MET. Two things remain open and neither is claimed as passed:**
  1. **The real-transport path is unproven.** It has been run once and it failed. The fix
     is verified against the schema and against offline tests; it has **not** been run
     against a live model. First action next session.
  2. **Max acceptance**, which is the entire point of R1: whether the thirteen quick-tags
     are the right vocabulary for what he actually wants to say about a board. Better
     found on board one than board thirty.
- **Drift check:** `docs/design.md` HR-2 updated — the Review Studio surface is arriving
  now, as an R1 subset ahead of A4/A5, with what was deferred and why recorded. No locked
  decision touched: schema v1.0 unchanged, zero dependencies held (`node:http`, `node:util`,
  `node:crypto`, `structuredClone` — all built-ins), engine-first intact, and the game's
  `board-view.js` untouched per amendment 2.
- **Next:**
  1. **Generate one real board and confirm it clears stage 03.** The prompt fix is
     unverified against a live model; treat it as unproven until a run completes.
  2. **Then the loop itself:** batches of ~10 with a rules recompile between, so batch 3
     vs batch 1 answers whether feedback actually changes the output. After ~30, compile
     `rubric.md` from the approved rules — A4's centrepiece, evidence-backed.
  3. **Tell Claude if the tag vocabulary is wrong.** Changing it later means re-reading
     old feedback through a new lens.
  4. Then A4's remainder, A5 (where budget rates get calibrated against real spend), A6a,
     then Review Studio B1–B3 proper, which is what fully closes HR-2.
  5. Carried: First Light `explanation` editorial pass (Red set weakest) · GDD drift to
     propose upstream (Appendix A pre-v1.0 schema, §8's missing `already-tried` row,
     motion 187–281ms vs Appendix E's 120–180ms) · the tutorial board's sets 2–4 wording
     is Max's to edit.

## 2026-08-02 — Studio Core A3: pipeline, blackboard, budget, mechanical gates

Built on `work/studio-core-a3` (commit `a075ea0`), red-first throughout. **No game code
touched** — `src/`, `styles/`, `index.html` and `puzzles/` are byte-identical to the entry
below; `git diff main -- src/ styles/ index.html puzzles/` is empty. A1 built the contracts
and storage, A2 the pure agents and injected transport; nothing connected them. A3 is what
makes the Core actually run.

- **New modules.** `blackboard.js` — in-memory artifact exchange for one attempt; a board
  rebuilt from stage outputs alone is indistinguishable from the original, which is what
  makes resume and revision deterministic rather than approximate, and `snapshot()` rolls
  every stage up beside its original output (provenance kept, not replaced).
  `budget.js` — request/token/cost/duration caps at stage, attempt and run scope; failed
  calls count. `pipeline-config.js` — models, prices, retry limits and caps as pure frozen
  data. `pipeline.js` — the orchestrator. `run.js` — the CLI adapter.
- **`pipeline.js` holds the boundary line.** It imports no `fs` and calls no `fetch`
  (verified by grep); every read and write goes through `run-store.js`, which is still the
  only writer of run artifacts, and `llm.js` still owns the Studio's only `fetch`. A failed
  stage is a recorded outcome — `failure.json`, a failed attempt, a returned result — never
  an exception reaching the caller. Only non-`StudioFailure` errors (i.e. bugs) escape.
- **Decisions made while building, all inside the approved spec:**
  - **Two retry classes with separate bounds** — `transport: 3` (llm.js's own loop, which
    already handles backoff and `retry-after`) and `validation: 2` (the pipeline's, the
    only place that can send the model concise feedback about *why* its output was
    rejected). Nesting one inside the other would have made the real bound 9.
  - **Stage input wiring lives in `pipeline.js`**, not in the agents. Which output feeds
    which input is orchestration knowledge; the agents' four-function contract is unchanged
    and they remain unaware of each other.
  - **`validation.json` is written last and only on success**, so a stage that has one is
    genuinely finished — which is exactly what `findFirstIncompleteStage` asks. Rejected
    rounds are kept as `response.rejected-N.txt` / `validation.rejected-N.json`; no failed
    response is ever erased.
  - **Model tiering is the spec's, not a fresh call** — Sonnet 5 for the five reasoning
    agents, Haiku 4.5 for the three narrow checkers (spec §"Budget and execution limits").
    Prices use Sonnet's **standard** $3/$15 rather than the introductory $2/$10, since a cap
    computed from the cheaper price stops enforcing when the intro period ends. Recorded as
    `pricingVersion: "2026-08-02"`.
- **`run.js` — one bullet beyond A3's literal spec list, approved in the plan.** The spec
  lists it in the repo layout but not in A3's implementation bullets. It went in now because
  HR-2's reconsider-when trigger is *"the Core grows a capability Max cannot see or exercise
  without reading code"* — and A3 is exactly that growth. HR-2 updated accordingly.
- **Additive to `run-store.js` only:** `writeStageText`, `writeAttemptArtifact`,
  `readAttemptArtifact`, `hasStageArtifact`, `listAttempts`, `recordStageStatus`,
  `recordUsage`; plus `writeTextAtomic` extracted from `writeJsonAtomic` (behaviour-
  preserving). **All 21 existing run-store tests and all 6 atomic-write tests unchanged and
  green** — no existing test was edited to accommodate new code.
- **Two things found while building, both fixed or recorded:**
  - **Bug:** usage was persisted only at the *end* of a run, so a process killed mid-run
    lost its spend record and every resume started the attempt's allowance over — the
    attempt cap could never bite. Now persisted after each stage. Caught by the resume
    suite, not by inspection.
  - **Architectural fact, verified in code:** `checkBoard` **cannot reject a schema-valid
    board**. With sixteen distinct words no two sets can share an ordered 4-tuple, so the
    accepted count is always exactly sixteen and `collisions` is always empty. It is a
    regression guard on the *engine*, not a per-board content check; `validate-puzzle.js` is
    what actually rejects boards at `04a` — in practice catching pre-v1.0 drift (`words[]`,
    a per-set `tier`) that the Board Builder's own semantic checks let past. **Nothing
    mechanical catches a board that is merely bad.** `docs/design.md` risk 1 sharpened to
    say so; a backlog line asks whether A5 should add a check that can.
- **Verified:**
  - `npm test` → **500 pass, 0 fail** (baseline 414 at the entry below; 86 new tests across
    `test/studio/pipeline/`: blackboard, budget, config, pipeline, integrity-gate, failures,
    revision, resume, run-cli).
  - `node tools/check-board.js puzzles/first-light.json puzzles/tutorial.json` → both clean,
    16/16 accepted tuples each. No board was added this session.
  - **Boundary-law greps:** no `fs` import and no `fetch` in `pipeline.js`; only
    `run-store.js` + `atomic-write.js` write run artifacts; only `llm.js` calls `fetch` in
    `studio/`; engine + `validate-puzzle.js` still import nothing outside themselves.
  - **Real CLI, not just tests.** `node studio/run.js --mock --theme "Lantern light"` →
    `attempt 0001: complete`, board "First Light", 8 requests / 7,128 tokens / ~$0.0421, and
    a 47-file run directory with per-stage `request.json` · `prompt.txt` · `response.txt` ·
    `output.json` · `validation.json`, the gate's `integrity.json`, plus `blackboard.json`,
    `board.json`, `manifest.json` (`awaiting-review`) and `decisions.jsonl`. Then
    `--revise-from 04-board-builder` → attempt `0002` reused stages 01–03 and re-ran 04
    onward in 5 requests, with `parent-attempt.json` naming the reused stages.
  - **Failure, gate, revision and resume paths are covered by tests, not assertions:** each
    of the three failure categories plus budget and integrity exhaustion recorded without
    throwing; the parent attempt proved byte-identical across a revision by hashing its tree
    before and after; the interrupted attempt produced by a real kill mid-write (a store
    that throws on one write), then resumed at exactly that stage with the half-written
    folder quarantined as `.partial-1` and cumulative spend carried forward.
  - **No browser verification** — nothing player-visible changed. The Studio is headless by
    HR-2; its surface is the CLI above.
- **Phase status: Studio Core A3 built, and its gate is MET.** A3's gate is automated +
  Claude-verifiable (tests, mock end-to-end run, artifact inspection) — there is no Max
  acceptance item in it, so nothing here is being marked passed on Max's behalf. Game phases
  are unchanged: **Phases 1–4 closed**, Phase 5a planned and not started.
- **Drift check:** two `docs/design.md` updates, both recorded above — risk 1 sharpened with
  the verified `checkBoard` fact, and **HR-2** updated (status now A1+A2+A3, interim
  verification surface now 500 tests plus the CLI, and the reconsider-when trigger tightened
  to "the Core grows a capability *the CLI* cannot exercise"). No locked decision touched:
  schema v1.0 unchanged, zero dependencies held (Node built-ins and `node:test` only, incl.
  `node:util`'s `parseArgs` and `structuredClone`), engine-first intact.
- **Next:**
  1. **Studio Phase A4 — initial corpus and variety.** **Blocked on Max:** he drafts
     `studio/corpus/rubric.md`, the one input only he can write. The rest of A4 —
     shipped-board examples, relationship taxonomy + index, machine-readable rubric, 5–8
     annotated near-misses, holdout cases stored for A6b — follows from it.
  2. Then A5 (evaluation — also where budget rates get calibrated against real spend and
     where the "can anything mechanical catch a bad board?" backlog item is answered),
     A6a (feedback capture, required for Core's Definition of Done), then Review Studio
     B1–B3, which is what actually closes HR-2.
  3. Independent and unblocked: **Phase 5a** — daily + archive + mid-puzzle persistence,
     plan at `~/.claude/plans/keen-percolating-boot.md`.
  4. Carried from before: First Light `explanation` editorial pass (Red set weakest) · GDD
     drift to propose upstream (Appendix A pre-v1.0 schema, §8's missing `already-tried`
     row, motion 187–281ms vs Appendix E's 120–180ms, §17.3 answered) · the tutorial board's
     sets 2–4 wording is Max's to edit.

## 2026-08-02 — Migrated onto project-template (governance, recovery, house rules)

Process-and-docs session on branch `work/template-migration`. **No product code touched**
— `src/`, `studio/`, `test/`, `puzzles/`, `styles/` and `index.html` are byte-identical to
the entry below. ASTO predates `project-template`, so this is the governance-doc migration
protocol run for the first time, not a birth.

- **Adopted from the template** (reviewed against its only commit, `da70440`, since the
  template repo has no tags or changelog):
  - `.claude/settings.json` — directory grants for `../maigd-course-handbook` (the Brain)
    and `../project-template` (added in a follow-up commit after the merge, so migration
    reviews read the template directly; noted in `CLAUDE.md` §11), plus the
    `Read(./.env)` / `Read(./.env.*)` denial. The untracked `settings.local.json` (the
    `npm test` allow) is unchanged. **Note:** Claude Code reads `settings.json` at
    startup, so the grants take effect from the next session, not the one that wrote them.
  - `.claude/commands/pause.md` — **new third command.** A truthful checkpoint for
    interrupted work: reports failures honestly, commits `wip(...)` on the work branch,
    leaves `main` alone, and states plainly that the gate did **not** pass.
  - `docs/governance.md` (verbatim — authority order, project health check, migration
    protocol, upstream proposals) · `docs/decisions/README.md` (verbatim ticket format,
    no tickets invented) · `docs/backlog.md` (empty parking lot).
  - `docs/recovery.md` — adopted and **ASTO-corrected**: no `npm install` step (zero
    deps, Node 22+ only), a "the game won't load" section for the `file://` trap, and a
    truthful "what recovery can't restore" naming browser `localStorage` (tutorialSeen,
    per-puzzle results) and git-ignored `studio/runs/`.
  - `docs/brief.md` — **written for ASTO**, derived from the GDD v0.13 and design.md's
    Context. It restates product intent and decides nothing new; the "locally shipped"
    definition it records is the GDD's own (10+ curated boards, tutorial → select → real
    win/loss, results surviving reload).
  - `.gitignore` merged (secrets, node_modules, build output, OS junk, `*.local` — the
    old lone `.DS_Store` line is subsumed) · `.gitattributes` · `.env.example` (names
    `ANTHROPIC_API_KEY` for the Studio's real transport, no value) · `template.json`.
- **`CLAUDE.md` folded, not replaced.** Every ASTO rule survives verbatim in meaning —
  locked decisions, the boundary law, the game rules that are easy to get wrong, the GDD
  no-list, taps-over-drag. New house sections: working with Max, the Brain knowledge loop,
  house architecture defaults, the Studio contract, gate kinds, git/recovery, safety
  rails, template provenance.
- **The real behavior change: git discipline.** `main` now holds **verified states only**;
  implementation runs on `work/<phase>` branches; `/wrapup` merges when the gate passes;
  `/pause` checkpoints WIP. The old `/wrapup` pushed straight to `main`. Commit trailer is
  now the model-agnostic `Co-Authored-By: Claude <noreply@anthropic.com>`.
- **`/warmup` and `/wrapup` extended, ASTO content kept.** warmup gained branch awareness,
  an open-decisions/backlog step, and a Brain check for new phases; wrapup gained the three
  gate kinds (with **Max acceptance never assumed** — ASTO's phase gates are playtest
  gates), blocking-vs-non-blocking routing with a switch-to-`/pause` escape hatch, ticket
  closing, the work-branch merge flow, and the `v0.1.0-local` tag trigger. Both keep
  `check-board`, the boundary-law refresher, and "a playtest is the gate".
- **Deliberately not adopted:** `/birth` (ASTO is already born and its plan approved), the
  template's `studio/index.html` proof-of-life page (ASTO's `studio/` is a real pipeline),
  and the template's skeleton `design.md` / `log.md` / `README.md`.
- **Design-doc drift — one deliberate change.** `docs/design.md` gained a **House-rule
  exceptions** section (+51 lines, 0 deletions — verified with `git diff --numstat`).
  Two exceptions recorded with reconsider-when triggers: **HR-1** strict zero dependencies
  (stricter than the house default; reconsider if hand-rolling a security/auth/parsing/
  storage/accessibility problem would be *less* safe than a library) and **HR-2** the
  Studio web surface deferred to Review Studio Part B (reconsider if Part B slips past the
  next phase gate, or the Core grows a capability Max can't exercise without reading code).
- **Verified:**
  - `npm test` → **414 pass, 0 fail** — identical to the pre-migration baseline taken at
    the start of the session.
  - `node tools/check-board.js puzzles/first-light.json` → clean, 16/16 accepted tuples.
  - `grep -rn "{{" --include="*.md" --include="*.json" .` → the only hit is
    `docs/governance.md`'s own description of the placeholder check. No unresolved
    placeholders survived from the template files.
  - `git diff main --stat` → 16 files, all docs/config; no `src/`, `studio/`, `test/`,
    `puzzles/`, `styles/` or `index.html` in the diff.
  - Governance health check run end-to-end: required docs present, current phase has a
    defined gate, `.gitignore` covers `.env`, settings deny-rule intact.
  - **Preview browser** (`npm run serve`, 375×812): the game loads, the first-run tutorial
    renders with its board and coach-mark, zero console errors. Repo reshuffle broke
    nothing.
- **Phase status:** unchanged by this session — **Phases 1–4 closed**, Phase 5a planned and
  not started, Studio Core at A2 with A3 next. This session had no phase gate of its own;
  its gate was the migration verification above (automated + Claude-verifiable), which
  passed, so the branch merged to `main`.
- **Session commits:** `94cf289` (migration, on `work/template-migration`) → `495d3b8`
  (merge to `main`, branch deleted) → `1d5ae9f` (the `../project-template` grant, a tiny
  verified fix taken directly on `main` per `CLAUDE.md` §9). `npm test` re-run green after
  the merge and again at wrapup — 414/414 each time.
- **Wrapup ran the new `/wrapup` for the first time**, which is the migration's own first
  proof: it correctly reported a clean tree already in sync and required no new commit
  beyond this log correction.
- **Next:**
  1. **Studio Phase A3 — pipeline and mechanical gates** (unchanged from below). Eight-stage
     orchestration · `blackboard.js` · integrity insertion at `04a` · `budget.js` ·
     failure recording · revision entry points · immutable child attempts · resume wired to
     `findFirstIncompleteStage`. Start it on `work/studio-core-a3` — the new git rule is
     live from now on.
  2. Then A4 (corpus + variety — **Max still drafts `studio/corpus/rubric.md`**), A5,
     A6a; Review Studio B1–B3 after Core, which is what closes HR-2.
  3. Independent and unblocked: **Phase 5a** — daily + archive + mid-puzzle persistence.

## 2026-08-02 — Studio Core A1 + A2 built (contracts, storage, agents, transport)

Second half of the same session as the entry below, which approved the design. **No game
code touched** — `src/`, `styles/` and `index.html` are byte-identical to Phase 4, and no
board was added. Everything here is new `studio/` and `test/studio/`.

- **A1 — contracts and storage (commit `15fe304`).** `stage-registry.js` (9 ordered
  stages = 8 agents + the `04a-integrity` gate, deeply frozen; `stagesFrom()` is the one
  primitive both revision and resume re-entry use) · `schemas.js` (manifest/attempt
  validators in the `validate-puzzle.js` style — pure, never throw, collect every error —
  plus the run-status transition map) · `storage/atomic-write.js` (temp → fsync → rename;
  a failed write neither clobbers the destination nor leaves litter) ·
  `storage/lock.js` (pid-aware: a dead holder's lock is stolen, a live one blocks with a
  typed `LockHeldError`) · `storage/run-store.js` — **the only module that touches run
  artifacts**, enforcing monotonic attempt ids, one running attempt per run, immutability
  of completed attempts, the transition map, and jsonl decisions/feedback.
- **A2 — agent boundaries and mock transport (commit `e825fec`).** `schema-check.js`
  (zero-dep declarative validator) · `failures.js` (the three retry categories as one
  pure decision) · `llm.js` (injected transport, retry loop with backoff + `retry-after`,
  the request record; **the only `fetch` in the Studio**) · `mock-transport.js` (fixture
  replay, scriptable failures) · the **eight pure agent modules** behind
  `agents/index.js`, sharing `agent-kit.js` · 8 committed fixtures in
  `studio/fixtures/responses/`.
- **Decisions made while building (all inside the approved spec, none overriding it):**
  - **Resume rule implemented as Max specified.** A partial stage folder is **quarantined
    to `<stage>.partial-<n>`, never deleted**, and its stage reruns fresh; the half-written
    work stays readable. Immutability is scoped to *completed* work, not whole attempts.
  - **`failures.js` split out of `llm.js`** (the spec listed no separate module). llm.js
    owns the I/O, failures.js owns the meaning — so the entire retry policy is testable
    with zero network, the same reason agents are pure. **Unrecognized failures default to
    terminal:** an unknown failure that retries is an unbounded loop.
  - **`schema-check.js` added** — zero deps means no JSON Schema library, and eight agents
    needed one dialect between them. Structured output from the API is a convenience;
    this is the authority.
  - **`storage/migration.js` deliberately not created.** With only schema v1.0 in
    existence it has no job; "old schema opened by new code fails loudly" already lives in
    the validators and is tested. It appears when a second version does.
  - Model IDs live in config, not agent files: `claude-sonnet-5` /
    `claude-haiku-4-5-20251001` (§12.1's tiers, current IDs).
- **The boundary law is enforced by test, not convention.** The agent contract suite reads
  each module's source and asserts no `fetch`, no `node:fs`, no transport import — plus no
  input mutation, and that **approved rules actually reach every prompt** (learning that
  silently failed to arrive would otherwise be invisible). The **Test-Player is blind by
  construction**: a test hands it the *entire* board — sets, explanations, integrity
  report — and asserts no label, explanation or set id reaches the prompt. **Board
  Builder's output is validated against the game's own `validatePuzzle()`**, so pipeline
  and game cannot drift.
- **One real bug, caught by its own test:** the Test-Player prompt rendered "you lose on
  your **3th** mistake" for any non-default allowance. Fixed with a proper ordinal.
- **Verified:** `npm test` → **414 pass, 0 fail** (was 154; +260, every one watched red
  first). `node tools/check-board.js` → 2 boards, all clean. A round-trip suite drives all
  eight agents through `llm.js` over the mock transport with `globalThis.fetch` replaced by
  a throwing stub — **zero network calls**, and the fixture board passes the game
  validator. **No browser verification was done or needed** — no UI file changed.
- **Phase status: Studio A1 and A2 complete and verified. A3 not started.** The Studio has
  no gate of its own until Core is runnable; the spec's Definition of Done is the target.
  Game phases are unchanged: **Phases 1–4 closed**, Phase 5a planned and not started.
- **Design-doc drift:** none new. `docs/design.md` is untouched and still describes the
  game only — correct, since the Studio has its own spec
  (`docs/superpowers/specs/2026-08-02-asto-studio-design.md`). The four deviations from
  that spec are listed above and are all additive.
- **Next:**
  1. **Studio Phase A3 — pipeline and mechanical gates.** Eight-stage orchestration ·
     `blackboard.js` · integrity insertion at `04a` (free sweep before evaluation tokens) ·
     `budget.js` enforcement · failure recording · revision entry points · immutable child
     attempts · **resume wired to `findFirstIncompleteStage`** (A1 built the storage half;
     A3 makes the pipeline use it). Fixtures and the run-store contract are ready for it.
  2. Then A4 (corpus + variety — **Max drafts `studio/corpus/rubric.md`**, the one input
     only he can write), A5 (evaluation), A6a (feedback capture).
  3. Independent and unblocked: **Phase 5a** — daily + archive + the newly added
     **mid-puzzle persistence** (see the entry below).
  4. Carried: First Light Red-set `explanation` pass · the GDD drift list (Appendix A
     schema, §8's missing `already-tried` row, motion 187–281ms vs Appendix E's 120–180ms,
     §17.3 answered, and §16's "empirical" wording now contradicted by the spec's
     predicted/simulated/human-observed split).

## 2026-08-02 — AI Puzzle Studio designed and approved; Phase 4 gate CLOSED

- **Phase 4 gate: MET.** Max playtested on the phone and called it good. Phases 1–4 are
  now all closed.
- **No game code this entry.** Design session: the AI Puzzle Studio brainstorm (paused
  2026-08-01 at the agent-roster question) resumed, completed, and was approved as
  **`docs/superpowers/specs/2026-08-02-asto-studio-design.md`** — the authority for all
  Studio work. `CLAUDE.md` updated: the Studio lives at `studio/` in THIS repo (it
  imports the game's validators directly); the handbook keeps the retired Python crew.
- **Decisions made with Max (see the spec for full detail):**
  - **All eight GDD §12.1 agents**, in order; the mechanical integrity sweep is a
    deterministic gate between Board Builder and Analogy Validator, not a ninth agent.
  - **Theme or surprise-me** (`--theme` or bare); surprise-me briefs are built from a
    relationship index so variety is pipeline logic, not memory.
  - **Two human gate types only** — editorial decision after a complete attempt, and
    (later, A6b) learning-policy approval. No gates between agents.
  - **Corpus** = extracted positives from shipped boards + Max's hand-authored
    `rubric.md` with 5–8 annotated near-misses.
  - **Feedback Learning Loop** (Max's major addition): every editorial action becomes a
    structured, routed feedback event; agents learn via versioned external memory
    (policies/examples/calibration) with per-attempt learning snapshots; permanent rules
    always require Max's approval. Split: **A6a capture is required for Done; A6b
    proposals/benchmarks build when feedback volume justifies.**
  - **Runs vs. immutable attempts**; interrupted attempts **resume** at the first
    incomplete stage (same re-entry machinery as revision) — Max's call, revised from
    the draft's mark-failed-and-restart.
  - **Blind Test-Player** — sees only what a player sees; simulated results are never
    labeled empirical. Predicted / simulated / human-observed difficulty are three
    distinct measurements (§16's Difficulty Loop, honestly framed).
  - **Review Studio matches the app literally** — links the game's stylesheets; board
    markup intentionally duplicated (~40 lines), `board-view.js` untouched (it owns
    FLIP-critical keyed DOM). GDD no-list applies to the Studio UI too.
  - **Core success bar:** an engine-valid, editorially reviewable board with a complete
    audit trail — not first-run approval-unchanged.
- **Game-side decision recorded for Phase 5a:** **mid-puzzle persistence** — leaving a
  puzzle (including reload/closed tab) restores board state. Amends the approved 5a
  plan (`~/.claude/plans/keen-percolating-boot.md`), which had scoped it out; fold in
  when 5a begins.
- **Next:**
  1. **Studio Phase A1 — contracts and storage, red-first** (stage registry, schemas,
     manifest, immutable attempts, atomic writes, locking, status transitions).
  2. Then A2–A6a per the spec's implementation order; Review Studio (B1–B3) after Core.
  3. Phase 5a (daily + archive + now mid-puzzle persistence) remains planned and
     independent — either track can proceed.
  4. Carried: First Light Red-set `explanation` pass · GDD drift list (Appendix A
     schema, §8 `already-tried` row, motion range, §17.3 answered, §16 "empirical"
     wording vs. the blind-Test-Player framing).

## 2026-08-02 — Phase 4 built: first-run tutorial, coach, title screen (gate NOT yet met)

- **Built (new):** `puzzles/tutorial.json` ("Warm Up", 4 relationship-not-category sets) ·
  `src/controller/tutorial-script.js` (PURE coach-mark machine) ·
  `src/view/tutorial-overlay.js` (the coach card) · `src/view/title-view.js` ·
  `src/storage.js` (`tutorialSeen` only; guarded — Safari private mode *throws* on
  localStorage) · `test/controller/tutorial-script.test.js` · `test/storage.test.js`.
  **Changed:** `index.html` (`#screen-title`, `#tutorial-coach`), `app.js` (routing +
  `ScreenRouter` gains a title state), `game-controller.js` (`loadPuzzle`),
  `header-view.js`, `end-view.js`, `controls-view.js`, `styles/components.css`.
  **No engine changes** — `maxMistakes: Infinity` has been built and tested since Phase 1.
- **Decisions made with Max:** hand off to the real game **after the first set** (not the
  whole board) · coach-marks are a **non-blocking bottom card**, never a scrim (Appendix D
  lists the Screen 0 wireframe as *pending*, so this was a Phase 4 design decision, not a
  spec being followed) · Claude drafts tutorial sets 2–4, Max edits · **title screen** with
  Play / How to play · the **ASTO wordmark is the way home** · Play **resumes** a live
  board · controls reordered to **Shuffle · Clear · Confirm**.
- **Two engine dials, no engine code.** The tutorial runs
  `{ maxMistakes: Infinity, clearSelectionOnFail: false }`, both existing `rules` knobs.
  The second is new this session (Max): a wrong answer now **stays in the frame** so the
  diagnosis can be checked against it — and "swap that one out" becomes one tap instead of
  rebuilding from nothing. `TUTORIAL_RULES` lives in `tutorial-script.js` so the tests
  exercise the shipped config, not a stand-in.
- **The coach diagnoses instead of shrugging.** "Not quite" teaches nothing, so every wrong
  submission is classified by *why*: cross-paired · one half backwards · three-plus-a-
  stranger · two-and-two · two-and-strays · four scattered · identical repeat. Each is a
  **ladder** of 2–3 escalating lines. Derived from `state.puzzle.sets` — the tutorial is
  explicitly allowed to hint (§5.2) and never runs on a real puzzle; the main game's
  empty `so-close` payload is untouched. No line names a set, tier, label or board word.
- **Four real bugs, all in this session's own code, all found by Max playtesting:**
  1. **Coach updated ~900ms after the status strip.** Measured with a MutationObserver:
     status 1ms, coach 894ms. It sat *after* `FrameView`/`BoardView` in the views array
     and the controller awaits each view, so it queued behind both ±4px shakes. Moved
     ahead of the animating views → **1ms**. Nothing in `node:test` can catch this class
     of bug; there is now a comment at the call site.
  2. **The coach went permanently deaf after the first solve.** `if (solvedSetIds.length >
     0) return STEPS.done` sat above every other branch, so a player who kept playing
     instead of pressing Continue got congratulated forever — a wrong answer changed
     nothing. Now the Continue **action** is sticky; the **words** are not. *A test named
     "done sticks" was asserting this exact bug and holding it in place.*
  3. **Identical copy read as frozen.** Three different scattered guesses produced one
     byte-identical sentence. Fixed by the ladders above; a submission also always
     re-animates the card even when the wording is unchanged.
  4. **Nothing changed between taps 1–3** while filling the frame. Now one line per tap
     (`relationship → pair-hunt → notation → one-more → order`), with the `::` lesson
     moved to two words — the first moment the frame shows a whole pair.
  Also fixed: leaving for the title screen **abandoned the board**. `Play` now resumes when
  that puzzle is still in play (`status === 'playing'` — a finished board correctly starts
  fresh). And a test leak-check was substring-based, flagging "sha**red**" as leaking the
  tier "red"; it is word-boundary aware now.
- **Verified:** `npm test` → **154 pass, 0 fail** (was 103; +51, red-first).
  `check-board.js puzzles/tutorial.json` → schema v1.0 ✓, **16/16 accepted of 43,680
  ordered tuples**, 0 collisions. Browser at 375×812, `localStorage` cleared: fresh profile
  lands in the tutorial (not the title), **no bean pips**, 5 wrong submissions never left
  the play screen, all 7 diagnoses fired on the real board, 9 moves → 9 distinct lines,
  6 consecutive Confirms → 6 distinct lines. Hand-off, Skip, replay, resume (solved card +
  spent bean + half-filled frame all survived), Back to title from win *and* loss, and the
  §16 First-Run Tutorial criterion all confirmed. Reduced motion exercised by overriding
  `matchMedia`: `settleIn`/`shake`/`fadeOut`/`pulse` all returned in **0ms**. Desktop
  1280px no overflow; zero console errors; all requests 200.
- **Honest limitations:** (a) **no phone playtest yet — the gate is unwalked.** (b) The
  preview browser never advances its animation timeline, so motion was verified logically,
  never watched. (c) Ladders are 2–3 rungs; the same mistake more times than that repeats
  its top rung (the card still re-animates). (d) There is now **no way to abandon a board
  mid-game and restart it** — Play resumes, and "Play again" only exists on the end screen.
  Phase 5's select surface is its natural home.
- **Design-doc drift (deviations recorded here, `design.md` left as approved):**
  - **Title screen is not in `design.md`'s Phase 4** — routing was deferred to Phase 5. It
    is a precursor to the select surface and Phase 5 may absorb it.
  - `design.md`'s "pips hidden via a view flag" proved **unnecessary** — `maxMistakes:
    Infinity` already renders zero beans. Only the `aria-label` needed suppressing (it was
    announcing "0 of 0 mistakes used").
  - `tutorialSeen` is recorded when the **last coach-mark appears**, not only on
    Continue/Skip, so a player who wanders off after being coached isn't taught twice.
- **Phase status: Phase 4 built and verified in the preview browser — GATE NOT MET.**
  The gate is Max's playtest on a real iPhone: coach-card placement against the safe area,
  and whether the shake still reads as "wrong" now that the tiles stay put.
- **Next:**
  1. **Max playtests Phase 4 on the phone.** That closes the gate.
  2. **Phase 5a — daily puzzle + archive calendar.** Plan written and approved this
     session: `~/.claude/plans/keen-percolating-boot.md`. Manifest (`puzzles/index.json`) ·
     `validate-manifest.js` · pure `daily.js` (injected `today`, never `toISOString()`) ·
     `results.js` + persisted per-puzzle results · `archive-view.js` calendar ·
     Next-puzzle chaining · tighten `date` to `YYYY-MM-DD` when present (a tightening, not
     a schema change) · drop the tutorial's `date`. Built against the **2** existing boards.
  3. **New decision to record upstream:** Max chose the **daily puzzle format** with a
     calendar archive — this answers GDD **§17.3**'s open question ("daily puzzle format or
     puzzle packs?"). It is a deviation from `design.md`'s flat `select-view.js` list.
  4. **Phase 5b — content.** The remaining 8 boards come from the **AI Puzzle Studio**
     (Max's call), whose brainstorm is still paused at the agent-roster question. Because
     the Studio authors them, it also produces §16's **Difficulty Loop** and **Pipeline
     Demo** artifacts — so **Phase 5's gate needs no reword after all**, contrary to the
     2026-08-01 entry. 5a is gated on its own checklist instead.
  5. Carried: First Light `explanation` editorial pass (Red set weakest) · GDD drift to
     propose upstream (Appendix A pre-v1.0 schema, §8's missing `already-tried` row, motion
     now 187–281ms vs Appendix E's 120–180ms, §17.3 answered twice over now) · the
     tutorial board's sets 2–4 wording is Max's to edit.

## 2026-08-01 — Started: AI Puzzle Studio design (brainstorm paused mid-way)

**No code written.** Design conversation only, paused by Max to resume next session.

- **Why this started:** Max noticed `docs/design.md` covers only the game — the AI Puzzle
  Studio pipeline is explicitly out of scope there ("the crew gets re-tooled later").
  Decision: **do not** bolt it on as a Phase 6; give it its own design plan, including a
  **web interface for Max to review agent outputs and give editorial feedback.**
- **Gap found in the existing plan (unresolved, deliberately):** Phase 5's gate says
  "full §16 acceptance pass", but GDD §16 includes two criteria no phase builds —
  **Difficulty Loop** (test-player agent produces empirical 1–4 grades) and **Pipeline
  Demo** (a puzzle traceable prompt → agent reports → decision log → JSON). Max chose to
  leave `design.md` untouched and let the Studio plan cover them. **Phase 5's gate will
  need rewording when we get there.**
- **Findings from exploring `../maigd-course-handbook/projects/asto/`:**
  - A **runnable 5-agent Python crew already exists** (~1,200 lines: Pair Author, Board
    Builder, Analogy Validator, Adversarial Solver + human editor; blackboard
    orchestration, bounded revise loop, `--mock` offline mode, Assignment-4 RAG layer,
    3 generated boards with traces + reports).
  - **Correction to an earlier log claim:** `crew/schema.py` is *already* near schema
    v1.0 — camelCase, `pairs` as source of truth, required `explanation`, derived 16
    terms, one set per difficulty. Only a leftover `tier` field drifts. The pre-v1.0
    problem is the **GDD's Appendix A**, not the crew code.
  - Max's call: **fully clean slate** — none of the code, corpus, or rubric carries over.
    Consequence to honour in the plan: the grounding corpus and editorial rubric are
    **editorial deliverables that must be budgeted**, not things that appear for free.
    The plan should also re-specify `--mock` mode and a bounded revise loop from the
    start (the two pieces that cost real debugging last time).
- **Design insight worth keeping:** `board-integrity.js` already proves mechanical
  uniqueness exhaustively (43,680 tuples, exactly 16 accepted). The **Adversarial Solver
  must not re-do that** — its job is the part brute force provably cannot see:
  *human-plausible* alternate readings (design.md risk 1).
- **Decisions locked this session:**
  1. **Purpose: both, tool-first** — it must genuinely author Phase 5's boards, with the
     §16 demo falling out of a legible review UI.
  2. **Clean slate**, no carry-over of code or content.
  3. **Node, zero dependencies** — Anthropic API over built-in `fetch`. The studio
     imports `src/source/validate-puzzle.js` and `src/engine/board-integrity.js`
     **directly**, so pipeline and game share one validator and schema drift becomes
     structurally impossible. Keeps the repo's zero-dep rule intact; tests via `node:test`.
  4. **UI scope: review, decide, and send revisions back** — approve/revise/reject with
     notes, and a revise re-invokes the pipeline from the right stage.
  5. **Split into two specs** with the **run-directory format as the contract** between
     them: **Studio Core** (agents + orchestration + artifacts, CLI-driven) then
     **Review Studio** (the web interface). Core is designed and built first.
- **Open — first question next session:** the **agent roster**. GDD §12.1 specifies eight;
  the options on the table were All 8 · Six (Pair Author, Board Builder absorbing Theme
  Grouper, Difficulty Rater, Analogy Validator, Adversarial Solver, Test-Player —
  deferring Style Guide) · Five · Four-then-grow. Note §16's Difficulty Loop requires the
  **Test-Player**, and §9.1 calls it "ASTO's primary difficulty instrument".
- **Also still open:** theme input (Max-supplied vs generated) · where the human gate sits
  in the run · model tier per agent + token budget (GDD §12.5 estimates ≈30k/pass,
  45–60k/approved puzzle) · corpus authoring approach · run-directory layout.
- **Next:**
  1. **Resume the Studio Core brainstorm** at the agent-roster question, then the open
     items above → design doc at `docs/superpowers/specs/` → implementation plan.
  2. Unchanged and independent: **Phase 4 — first-run tutorial** (no engine work needed;
     `maxMistakes: Infinity` has been built and tested since Phase 1). Phase 4 and the
     Studio are separable — either can go first.
  3. Carried: First Light `explanation` editorial pass · §8.3 watch on free so-close
     repeats · the four-item GDD drift list (motion range, `already-tried` row,
     explanation question, Appendix A schema) · Phase 5 gate rewording noted above.

## 2026-08-01 — Phase 3 complete: win/loss screens, share, and the motion pass

- **Built (new):** `src/view/end-view.js` (win + loss screens) · `src/view/motion.js`
  (flip, shake, settleIn, fadeOut, pulse, prefersReducedMotion) · `src/share.js`
  (pure `buildShareText` + `share()` with navigator.share → clipboard → selection
  fallback) · `test/share.test.js`. **Changed:** `index.html` (#screen-end),
  `styles/*` (end screens, REVEALED badge, paper grain, `.screen[hidden]`),
  board/frame/solved-sets views (motion), `game-controller.js` (async serialized
  render + `restart()`), `app.js` (ScreenRouter, share wiring). **No engine changes.**
- **Decisions made with Max:** Share = Connections-style tier-square grid, spoiler-free ·
  **no "Next puzzle" button** (depends on Phase 5 manifest/routing) — win screen offers
  **Play again** instead · **explanations shown on the win screen too**, not just the
  loss screen. That last one closes a GDD §17.3 open question ("how much explanation
  should solved sets reveal?") — propose upstream.
- **Verified:** `npm test` → **103 pass, 0 fail, exit 0** (8 new share tests, red-first);
  `check-board.js` exit 0. Manual gate in preview browser at 375×812 walked the **GDD §16
  checklist item by item** — all passed. Canonical beat confirmed by submitting
  `Fire|Spark|Tree|Seed` and watching the frame reorder to `Seed|Tree|Spark|Fire` before
  clearing. Loss screen shows all four sets, unsolved ones badged REVEALED, every card
  with its explanation. Share text verified spoiler-free (`ASTO — First Light / 4/4 ·
  no beans / ⬛🟩🟥🟨`, squares in solve order; unit-tested against all 16 board words).
  Play again fully resets. Reduced motion: full game playable, helpers return in 0ms.
  Desktop 1280px: no overflow. Zero console errors, all requests 200.
- **No-list audit:** grain on `button.tile` and `.solved-card` only (page background
  `none`); used bean = `rgb(92,70,51)` roast brown, never red; no `setInterval`, no rAF
  loops, no confetti, no particles. The only `setTimeout` is motion's liveness guard.
- **Three real bugs found at the gate, fixed and re-verified:**
  1. **`.screen[hidden]` did nothing** — `.screen { display: flex }` outranks the UA
     stylesheet's `[hidden] { display: none }`, so screens rendered stacked. **Latent
     since Phase 2** (the error screen had the same flaw, never exercised).
  2. **`Animation.finished` can never resolve** (it doesn't in the preview browser at
     all) — and view rendering had been chained onto it, so a stalled animation froze
     the whole game. Every helper now races a bounded timer AND cancels unfinished
     animations. **Motion can no longer hold the game hostage.**
  3. **`fill: 'backwards'` left staggered cards permanently invisible** if their
     animation never ran (backgrounded tab → empty win screen). Visibility is now
     restored in a `finally`, and pending animations are cancelled so they cannot pin an
     element at its first keyframe.
- **Playtest tuning (Max, on device):** motion slowed **20%**, then a further **30%** —
  `--motion-slow` 180 → 216 → **281ms**, `--motion-fast` 120 → **187ms**. On the second
  pass the two duplicated timing constants were **collapsed into one dial**: `motion.js`
  now reads `--motion-slow` from `tokens.css` at runtime and derives the card stagger
  from it, so JS animations and CSS transitions cannot drift. Verified by setting the
  token to 500ms and confirming a JS animation reported exactly 500.
- **Architecture note:** `render()` is now async and **serialized** — a queued pass reads
  `this.state` when it runs, so it always paints the latest truth. The solve sequence
  (frame beat → board close → card settle) falls out of **view order** in `app.js`, not
  timing code. Consequence: taps during a solve animation queue rather than drop. Max
  playtested and reported it feels fine; revisit if it ever reads as laggy.
- **Honest limitation:** the preview browser never advances its animation timeline, so
  **Claude verified motion logic but never watched it play.** All visual timing judgement
  came from Max on a real iPhone.
- **Phase status: Phase 3 gate MET** — §16 checklist passed, solve animation glitch-free,
  no-list held, playtested and approved by Max on device.
- **Docs drift to propose upstream (GDD is Max-owned):** motion is now 187–281ms vs
  Appendix E's stated 120–180ms (~56% longer) · §8 feedback table still lacks the
  `already-tried` row · §17.3's "how much explanation" question is now answered
  (both end screens) · Appendix A schema still pre-v1.0.
- **Next:**
  1. **Phase 4 — first-run tutorial:** `puzzles/tutorial.json` (ordinary schema-v1.0
     board, difficulty-1 set = Seed:Tree::Spark:Fire, same validator + integrity bar),
     `tutorial-script.js` (3 coach-marks: relationship-not-category · order matters ·
     what `::` means, advance conditions keyed to controller events),
     `tutorial-overlay.js`, pips hidden via a view flag, `storage.js` `tutorialSeen`
     + skip affordance. The engine's `maxMistakes: Infinity` no-lose rule is **already
     built and tested** since Phase 1 — no engine work needed.
  2. Phase 4 gate: fresh profile lands in tutorial, cannot lose, coach-marks fire
     correctly, completion routes to First Light, returning visitor skips.
  3. Still open: First Light `explanation` editorial pass (Red set weakest) · the §8.3
     watch-item on free so-close repeats · the handbook/GDD drift proposals above.

## 2026-08-01 — Live on GitHub Pages + first playtest rule: "already tried" is free

- **Shipped the game publicly (Max's call):** repo flipped to public, GitHub Pages
  enabled from `main` root. **Live at https://maxrowe1031-rotn.github.io/ASTO/** —
  every push to `main` auto-redeploys (~1 min). All fetches were already relative
  paths, so the `/ASTO/` subpath needed zero changes. Also reachable on LAN via
  `npm run serve` + `http://<mac-ip>:8080`.
- **First real-device playtest finding (iPhone, Max):** resubmitting the exact same
  wrong four-in-order cost a second bean for the same mistake. Felt unfair; Max
  specified the fix.
- **New engine rule — `already-tried`:** state gained `failedAttempts` (every charged
  miss/so-close records its exact ordered submission; `invalid` no-ops never recorded).
  Resubmitting one → outcome `already-tried`: **no mistake**, selection clears per
  `clearSelectionOnFail`, outcome carries only `type` (no hints, like so-close). Same
  four words in a *different* order = new claim, charges normally. Status copy:
  "Already tried that one." Shake animation for it arrives with Phase 3's motion pass.
- **Deliberate scope note:** so-close repeats are also free — same fairness principle,
  but it slightly softens the §8.3 so-close economy. Flagged to Max; two-line change
  if playtesting disagrees.
- **Verified:** 7 new red-first tests (repeat miss/so-close free · repeat clears
  selection · different order charges · history survives intervening solves · invalids
  unrecorded · no-hint payload) → **95 tests, 95 pass, exit 0**; check-board still
  clean (integrity sweep probes a fresh history per tuple — acceptance surface
  unchanged). Browser end-to-end: bean → free → free → different-order bean. **Max
  re-tested on the phone and confirmed.** 3 existing tests updated off the old
  repeats-charge assumption (they looped one identical miss to rack up mistakes).
- **Docs drift:** GDD §8 feedback table now lacks the `already-tried` row — propose
  upstream (GDD is Max-owned), alongside the standing Appendix A schema drift.
  CLAUDE.md's "rules easy to get wrong" updated in-repo. `docs/design.md` outcome list
  (`solved/so-close/miss`) now reads as pre-revision; deviation recorded here rather
  than editing the approved plan.
- Housekeeping: `.gitignore` added (`.DS_Store` — one snuck into a commit, removed).
- **Phase status: Phase 2 still the last gated phase, gate met.** This session was a
  playtest-driven rules revision + deployment, not a phase.
- **Next:**
  1. **Phase 3 — win/loss screens + motion polish** (unchanged from last entry):
     `end-view.js` (win: tier cards, Share, Next puzzle; loss: reveal with
     explanations), motion pass per Appendix E — FLIP solve→canonical→card, ±4px
     shake ×3 (now also for `already-tried`), `prefers-reduced-motion`, paper grain.
  2. Playtest watch-items for the §8.3 data: does free-repeat-of-so-close give too
     much away? Still open: First Light explanations editorial pass; handbook/GDD
     drift proposal.

## 2026-08-01 — Phase 2 complete: core play screen, playable in the browser

- **Built (all new):** `index.html` (play screen, fonts link, error screen) ·
  `styles/tokens.css` (Appendix E as CSS vars — palette, tier triples, type, motion) +
  `base.css` + `components.css` · `src/source/local-json-source.js` (fetch + validate at
  the boundary, injectable `fetchFn`) · six views in `src/view/` — header (bean pips),
  status strip, frame (honey-glow next slot, pointer-event drag), board (4×4, persistent
  keyed nodes), controls (Confirm-gated), solved cards ·
  `src/controller/game-controller.js` (the only engine caller) · `src/app.js` bootstrap ·
  `test/source/local-json-source.test.js` · `.claude/launch.json`. **No engine changes.**
- **Decisions made with Max:** Google Fonts `<link>` for Bree Serif/Nunito with full
  fallback stacks (network nicety, not a dependency; self-host later) · minimal status
  strip for won/lost in Phase 2 — real end screens are Phase 3's `end-view.js`.
- **Verified:**
  - `npm test` → **88 tests, 88 pass, exit 0** (82 engine/source + 6 new source tests,
    written red-first). `check-board.js` still exit 0.
  - **Manual gate, preview browser, mobile viewport 375×812 — every item passed:**
    full win (each set solved via a *different* accepted order; cards always display
    canonical) · full loss (4 roast-brown beans, board inert after) · so-close costs a
    bean + clears + leaks no set/tier · Clear free · Shuffle unsolved-only with selection
    kept · deselect compresses (board tap AND frame-slot tap) · 4th tap never submits ·
    Confirm gated at exactly 4 · drag-to-reorder commits (drag-fixed a cross-pair frame
    into canonical and solved with it) · taps alone complete the game · zero console
    errors, all requests 200 · desktop width sane.
  - Visual spec held: tiers hidden until solve, beans never red, ink fill on Confirm
    only, honey glow on next slot, flat cream page.
  - **Max playtested and approved** ("working great").
- **Two real view bugs found by the manual gate, fixed, re-verified:**
  1. **Drag-to-reorder never committed** — the dragged slot follows the pointer via
     `transform`, and `getBoundingClientRect()` includes transforms, so the drop
     hit-test always found the dragged slot itself and read the drop as "onto yourself."
     Fix: skip the dragged slot when hit-testing (`frame-view.js`).
  2. **`setPointerCapture` could kill slot taps** — if capture throws (released/synthetic
     pointer), pointerdown died before recording the tap. Now try/caught: capture is an
     optimization, not a dependency.
  Exactly the bug class engine tests can't see — the reason the gate is manual.
- **Deviations from `docs/design.md`:** none of substance. Added `status-view.js` beyond
  the listed views (the Phase 2 minimal end-state strip, agreed with Max);
  `select-view.js`/`end-view.js`/`tutorial-overlay.js` are later phases as planned.
- **Phase status: Phase 2 gate MET** — playable win and loss in mobile emulation with
  all rule behaviors correct, playtested by Max.
- **Still open:** the four First Light `explanation` strings await Max's editorial pass
  (Red set weakest) · handbook drift (GDD Appendix A / tech spec pre-v1.0) still to
  propose upstream.
- **Next:**
  1. **Phase 3 — win/loss screens + motion polish:** `end-view.js` (win: tier cards in
     order, Share, Next puzzle; loss: unsolved sets revealed in canonical order **with
     explanations**, REVEALED badges), motion pass per Appendix E (120–180ms ease-out,
     FLIP solve→canonical→card sequence, ±4px shake ×3, `prefers-reduced-motion`),
     paper grain (inline SVG feTurbulence data-URI, tiles/cards only).
  2. Phase 3 gate: GDD §16 acceptance for core loop + end states, solve animation
     glitch-free, no-list held. Real-iPhone check recommended at this gate (design.md
     risk 4: 100dvh, safe-area, touch-action are in place but untested on device).

## 2026-08-01 — Phase 1 complete: headless engine, validator, integrity, First Light

- **Built (all new):** `package.json` (zero deps, `type: module`) · `src/engine/`
  — `arrangements.js`, `rng.js`, `tiers.js`, `engine.js`, `board-integrity.js` ·
  `src/source/validate-puzzle.js` · `tools/check-board.js`, `tools/serve.js` ·
  `puzzles/first-light.json` · 10 `node:test` suites under `test/`. README rewritten
  (run instructions, boundary law, schema v1.0 example).
- **Built test-first** — each module's suite written and run red before its
  implementation existed.
- **Verified:**
  - `npm test` → **82 tests, 82 pass, 0 fail, exit 0.**
  - `node tools/check-board.js` → First Light clean: schema v1.0 valid,
    **16/16 accepted of 43,680 ordered tuples**, 80 near-miss orderings, exit 0.
  - **Negative check:** the GDD's own Appendix A board (old schema) fed to
    `check-board.js` → **10 distinct errors, exit 1**, each naming schema v1.0. The
    validator has actually failed on purpose, not just passed.
  - **Boundary law audited:** `src/engine/**` imports only its own siblings;
    `validate-puzzle.js` imports nothing. `grep` for `Math.random` / `document.` /
    `window.` / `fetch(` / `localStorage` across `src/` returns comments only.
  - No browser check — Phase 1 ships no UI by design.
- **Engine decisions made this session:**
  - `initGame` is **deterministic** (derived board order); the controller calls
    `shuffle(state, rand)` with an injected RNG, so randomness sits at exactly one seam.
  - `rules` gained two GDD §8.3 playtest seams alongside `maxMistakes`:
    **`soCloseCostsMistake`** and **`clearSelectionOnFail`**, both defaulting to shipped
    behaviour. Revisiting either is now config, not an engine edit. Both are tested.
  - `submit` returns `invalid` with a `reason` string (`not-playing` / `wrong-length` /
    `duplicate-terms` / `off-board`) — a true no-op charging no mistake.
  - The **`so-close` outcome carries only `{ type }`** — no `setId`, no order — so the
    view physically cannot leak which set or tier the player nearly had. Asserted by test.
  - State is frozen on every return; the **puzzle is referenced, never frozen** (freezing
    is a mutation of the caller's object). Both covered by `immutability.test.js`.
- **`board-integrity.js` — honest scope.** With four disjoint sets and no explicit
  `acceptedOrders`, a 43,680-tuple sweep is *structurally guaranteed* to find 16; it
  cannot discover an alternate solution the schema makes impossible. So it samples
  through the **real `engine.submit()`** rather than reimplementing the rules: if anyone
  ever sorts a submission or otherwise widens acceptance, the count balloons past 16 and
  every board in `puzzles/` fails on the next `npm test`. That is regression protection,
  **not** protection against a human-plausible wrong reading — only playtest eyes catch
  that (design.md risk 1). It also reports the **near-miss count** (80 for a clean
  board), a real authoring signal for the size of the "So close!" surface.
- **Deviations from `docs/design.md`** (none touch a locked decision):
  1. `test` script is `node --test "test/**/*.test.js"`, not bare `node --test` — node's
     default patterns would otherwise run `test/fixtures/board.js` as a test file. This
     needs **Node 22+**; `engines` and the README say so.
  2. `tools/serve.js` (~40 lines of `node:http`) instead of `npx http-server`, which
     would have quietly broken the zero-dependency promise. Unused until Phase 2.
  3. The validator also rejects a per-set **`notes`** field (present in the GDD's old
     sample) — schema v1.0 already has `explanation` for author commentary, and two
     fields for one job invites drift. Easy to drop if unwanted.
  4. Added `test/fixtures/board.js` — engine suites run against a fixture, not against
     shipped content, so a content edit can never break an engine test.
- **Phase status: Phase 1 gate MET** — `npm test` green including a headless full win
  and full loss played through engine imports alone (`test/engine/game-flow.test.js`),
  plus the `maxMistakes: Infinity` tutorial rule proven un-losable before any tutorial
  code exists. `check-board.js` passes First Light. No `index.html` — that was the point.
- **Needs Max's editorial pass:** the four `explanation` strings in
  `puzzles/first-light.json` are Claude-drafted in the voice of the design.md example.
  The Red set ("A nest is where a bird lives, the way a den is where a bear lives")
  restates its label rather than adding to it — weakest of the four.
- **Next:**
  1. **Playtest is the gate** — but Phase 1 has no UI, so the honest check is reading
     `test/engine/game-flow.test.js` and confirming the modelled loop is the game you
     want before it gets a face.
  2. Edit the four First Light `explanation` lines to taste.
  3. **Phase 2 — core play screen:** `index.html`, `styles/tokens.css` + `base.css` (GDD
     Appendix E palette, Bree Serif / Nunito with fallback stacks),
     `local-json-source.js`, the views (header + bean pips, 4×4 board, frame with
     honey-glow next slot, Confirm-gated controls, solved cards), `game-controller.js`,
     and drag-to-reorder via Pointer Events + `setPointerCapture` (never HTML5 DnD; taps
     alone must fully suffice). Views own persistent keyed DOM nodes per term — decided
     now because Phase 3's FLIP animations die under rebuild-from-state rendering.
  4. Still open from last session: the handbook touchpoint — GDD Appendix A and
     `asto-tech-spec.md` still describe the pre-v1.0 schema. This session's validator now
     rejects exactly that shape, which makes the mismatch louder. Propose, don't rewrite.

## 2026-08-01 — Repo seeded: approved build plan + GDD

- **Planned in the Development Brain** (`maigd-course-handbook`), executed here. No game
  code yet — this is the handoff commit.
- **Added:** `docs/design.md` (the approved 5-phase build plan) · `docs/asto-gdd.html`
  (GDD v0.13, standalone — rebuilt from source before copying) · `/warmup` + `/wrapup`
  commands in `.claude/commands/`.
- **Locked decisions** (need explicit OK to change): canonical **puzzle schema v1.0**
  (camelCase, pairs as single source of truth, no `words[]`, no `tier` — derived from
  `difficulty` 1–4) · **vanilla HTML/CSS/JS ES modules, zero dependencies, no build
  step**, tests via `node:test` · **phased to full MVP**, 5 gated phases.
- **Architecture:** headless PuzzleEngine → read-only views → thin GameController →
  PuzzleSource seam. Selection order lives in the engine (order decides so-close vs
  solved). Tutorial no-lose via a `maxMistakes: Infinity` rule — no engine fork.
- **Phase status: Phase 1 not started.**
- **Known drift to resolve upstream:** the handbook's GDD **Appendix A** and
  `asto-tech-spec.md` still describe the older schema (snake_case / `words[]` / `tier`).
  Schema v1.0 in `docs/design.md` supersedes them for this repo.
- **Next:**
  1. **Execute Phase 1** — headless engine + schema validator + `node:test` suite +
     `tools/check-board.js` + `puzzles/first-light.json`. Gate: all tests green including
     a headless full win and full loss played through engine imports alone; check-board
     passes First Light. No `index.html` yet — that's the point.
  2. Phase 2 (core play screen) only after the Phase 1 gate is met.
