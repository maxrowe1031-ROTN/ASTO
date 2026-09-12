# The visibility push — the plan (2026-09-12)

**Status: approved by Max 2026-09-12 (D-36).** Research and sources:
`docs/research/2026-09-12-visibility-deep-dive.md`. Scope: free channels only; the audience
is word-game enthusiasts (the Wordle and Connections crowd). Nothing in this plan is posted
until Max says so, door by door. When Max approves the plan it becomes **D-36** in
`docs/design.md`; each door opened gets a line in `docs/log.md` and a row in the scoreboard
at the bottom of this file.

## The idea in three lines

1. **Get ready** so every door opens onto a game that works and a link that previews.
2. **Get listed** in the directories that keep linking, quietly, all in one week.
3. **Post to the crowds** one community at a time, a few days apart, reading the play
   counter after each so we know which door moved what.

Then look at the numbers and decide what is next.

## Who does what

- **Max:** everything outward-facing — submitting forms, posting, replying to comments,
  the itch account. Reviews the waiting boards. Picks the one-liner and the clip.
- **Claude:** the link-preview change (the one code change in this plan), the clip cut, the
  posting kit below sized to each door, the scoreboard reads, the log.

## Week 0 — get ready (Sat 12 → Tue 15 Sep)

Order matters: R1 before anything, because the calendar runs dry on 19 Sep.

| # | Item | Who | Done when |
|---|---|---|---|
| R1 | **Extend the calendar.** Review and publish waiting boards in the Studio (`npm run studio:review`); 19 are waiting. Aim for at least three weeks of runway | Max | `npm run check-schedule` shows the last scheduled day ≥ 10 Oct |
| R2 | **Link previews.** A meta description, Open Graph title/description/image, and a `<noscript>` line on `index.html` and `about.html`, so a pasted link shows the game's name, a sentence, and a board image | Claude builds on a work branch, tests, browser check; Max approves the sentence and the image | A Reddit/Discord-style fetch of playasto.com returns the description; merged to `main`; `npm run check-deploy` passes |
| R3 | **The one-liner.** Default: *"Connections, but you build the analogies."* Never "the only daily analogy game" (dailyanalogy.com exists) | Max picks | The line is in this file and used everywhere below |
| R4 | **The clip, 60–90 s**, cut from the 08 Sep capstone recording: opens on play, a solved set, a *So close!*, the tier reveal, the calendar, no title-screen wait. **A Past Pour board, never today's. Never the share sheet** | Claude cuts two options; Max picks | An mp4 under 20 MB in `dist/`, git-ignored |
| R5 | **The itch page.** Find it (or publish it), paste its URL into D-26, set the generative-AI disclosure to **Text & Dialog** (and Code if applicable), tags `daily` `word-game` `connections` `puzzle` `cozy`, upload a fresh `npm run itch` build after R1 | Max; Claude builds the zip | The URL is in `docs/design.md`; the page is public and indexed |
| R6 | **Screenshots.** Three at 375×812 from a Past Pour: a mid-game board, a solved set with its tier colour, the end screen with the share squares | Claude | In `dist/`, git-ignored; picked from the browser pane |

## Week 1 — get listed (Wed 16 → Tue 22 Sep)

These compound: they keep linking for months and none of them is a "launch". Do all six in
one sitting if you like; they are forms and comments. Read the counter on the 22nd.

| # | Door | What to do | Effort |
|---|---|---|---|
| L1 | **Playlin** — https://playlin.io/submit/ | Form: URL `https://www.playasto.com`, name ASTO, creator Max Rowe, email; opt in to the Playlin 40 newsletter | 5 min |
| L2 | **Room Escape Artist** — comment on https://roomescapeartist.com/2025/09/06/daily-puzzle-game-recommendations-guide/ | Kit text K1 | 5 min |
| L3 | **Thinky Games** — https://thinkygames.com/about/ → Contact → *Submit your own game* | Form; kit text K2. Optionally join the Discord and read its sharing rules before posting anything there | 10 min |
| L4 | **Listdle** — https://listdle.com "Suggest a Game" | Name, URL, one sentence | 3 min |
| L5 | **Dle Hunt** — https://dlehunt.com "Submit a dle" | Same | 3 min |
| L6 | **The Dles** — https://dles.aukspot.com "suggest a dle" | Same | 3 min |

## Week 2 — the crowds, one at a time (Wed 23 Sep → Sun 5 Oct)

Two or three days apart so each read of the counter belongs to one door. Best fit first.
Reply to every comment the same day; that is where these posts earn their upvotes.

| # | Door | When | What to do |
|---|---|---|---|
| C1 | **r/NYTConnections** (65K) | Wed 23 Sep, morning US time | Text post, flair *General Discussion* (or *Custom Puzzle*), kit K3, one screenshot |
| C2 | **r/WebGames** (143K) | Sat 26 Sep | **Link post** to playasto.com, title from kit K4 (must begin with "ASTO"), flair `[PZL]` |
| C3 | **r/playmygame** (141K) | Tue 30 Sep | Text post via "Make a Post", flair `[Mobile] (Web)`, kit K5 — the AI line is required here |
| C4 | **r/wordgames** (4.7K) | Fri 3 Oct | First reply in the two live request threads (kit K6), a few genuine comments on other posts, then one *Showcase* post the following week |
| C5 | **r/puzzles** (450K) | Any week | One comment in the stickied *Promo Weekly* thread (kit K6). Standalone posts are removed |

## Week 4 — lottery tickets and the readout (from Mon 6 Oct)

- **Show HN** — https://news.ycombinator.com/submit, title `Show HN: ASTO – Connections, but you build the analogies`. Expect single digits; Clues by Sam got 3 points. Once.
- **Product Hunt** — free; launch at 12:01 AM PT if at all. Once.
- **awesome-wordle** on GitHub — a PR. Once.
- **The readout, ~10 Oct:** the scoreboard below, summed. Which door moved starts? Did any
  browser come back a second day? Then one of three calls, Max's: **push further on the
  door that worked**, **open the next scope** (creators and press, out of scope today), or
  **build for the educational angle** (a teacher page and an easier mode — game changes
  with their own gates).

## The rules on every door

- **Never lead with "AI-made."** Disclose it where a rule asks (r/playmygame) and at the end
  of the longer posts, in one plain sentence. Never in a title. Where GenAI is banned
  (r/IndieGaming, r/crossword, Newgrounds), don't post.
- **Never show today's board.** Every screenshot and the clip come from a Past Pour.
- **One post per community, ever, unless a rule says otherwise** (r/playmygame: one a
  month; r/WebGames: no repost within three months).
- **Post from Max's own Reddit account.** Many subs auto-filter new accounts; if it is new
  or low-karma, spend a week commenting in these subs first.
- **Be a person.** Answer every comment; take criticism without arguing; thank the "too
  hard" replies and point them at the hint and the Vocab button.
- **Read the counter after each door**, not at the end: `npm run plays`. Starts per day,
  distinct browsers, browsers back on a second day. Ratings are opinions; these are the
  facts.

## The posting kit

Everything below is a draft for Max to edit. The one-liner is R3's default; swap it if he
picks another. `<slug>` means a Past Pour's slug, e.g. `bedside-manor`.

**K1 — Room Escape Artist comment**
> Suggestion for the list: ASTO (playasto.com) — Connections, but you build the analogies.
> Sixteen words hide four sets of "A is to B as C is to D"; you have to place all four in a
> valid order, so the reasoning is the puzzle. One free board a day, no signup, plays well on
> a phone. I made it; happy to answer anything.

**K2 — Thinky Games submit form (description field)**
> ASTO is a free daily word puzzle: Connections, but you build the analogies. A 4×4 board of
> sixteen words hides four analogy sets (A : B :: C : D). Order is the game — "So close!"
> means the right four words in the wrong order. One board a day, a calendar of past boards,
> a hint, and a Learning Mode that defines any word. No account, no ads. Solo project;
> boards are drafted by an AI pipeline I built and every one is hand-edited and played by me
> before release. Mobile-first, works in any browser. https://www.playasto.com

**K3 — r/NYTConnections text post**
Title: `I made a Connections-style game where the four groups are analogies — ASTO`
> If you like the "find the four groups" part of Connections, this is that with a twist: the
> groups are analogies. Sixteen words, four hidden sets of *A is to B as C is to D* — and you
> have to place them **in order**. The right four words in the wrong order is a "So close!"
> and costs a mistake, so the reasoning is the whole game.
>
> One free board a day, no signup, plays best on a phone: https://www.playasto.com
>
> Tiers are revealed when you solve a set (green to black, like you'd expect). There's a hint
> and a Vocab button if a word is unfamiliar. Past boards are on the calendar if you want
> more than one.
>
> I'm a solo dev; the boards are drafted by an AI pipeline I built and every one is
> hand-edited and played by me before it goes out. Would love to hear which sets felt fair
> and which didn't — that's what makes the next boards better.

**K4 — r/WebGames link post** (link only; the title is the whole post)
Title: `ASTO — Connections, but you build the analogies. A free daily word puzzle, no signup [PZL]`
First comment, posted right after: the second paragraph of K3 plus the AI sentence.

**K5 — r/playmygame text post**
Title: `[Mobile] (Web) ASTO — Connections, but you build the analogies. Free daily word puzzle`
> **Play:** https://www.playasto.com — free, in the browser, no signup, best on a phone.
>
> **What it is:** a 4×4 board of sixteen words hides four analogy sets (A is to B as C is to
> D). Find the four words *and* put them in a valid order; the right words in the wrong
> order is a "So close!". One board a day, a calendar of past boards, a hint, a Vocab button
> that defines any word.
>
> **My role:** solo developer — design, code, and the editing. **AI use, stated plainly:**
> the boards are drafted by an AI pipeline I built; every published board is hand-edited and
> played by me before release. The game code has no AI at runtime.
>
> **What I'd love feedback on:** is the difficulty curve fair, and does "order is the game"
> click within the first board?

**K6 — replies and the r/puzzles Promo Weekly comment**
> ASTO — Connections, but you build the analogies. Sixteen words, four hidden "A is to B as
> C is to D" sets, and order counts. One free board a day, no signup: https://www.playasto.com
> (I made it — solo project.)

## The scoreboard

Filled in after each door from `npm run plays`. "Next 3 days" is starts in the three days
after the post; "back" is distinct browsers seen on two or more days.

| Door | Date opened | Starts, next 3 days | Distinct browsers | Back on a 2nd day | Upvotes / comments | Notes |
|---|---|---|---|---|---|---|
| Baseline (nothing opened) | 2026-09-12 | 0 | 0 | 0 | — | Counter live since 09-08 |
| L1 Playlin | | | | | — | |
| L2 Room Escape Artist | | | | | — | |
| L3 Thinky Games | | | | | — | |
| L4–L6 Listdle / Dle Hunt / The Dles | | | | | — | |
| C1 r/NYTConnections | | | | | | |
| C2 r/WebGames | | | | | | |
| C3 r/playmygame | | | | | | |
| C4 r/wordgames | | | | | | |
| C5 r/puzzles Promo Weekly | | | | | | |
| Show HN / Product Hunt | | | | | | |

## Out of scope, on purpose

Paid anything. Creators and press (Rangsk, Aftermath, NPR — recorded in the research for
the next scope). App stores and PWA. The educational angle until a teacher page and an
easier mode exist. Leaderboards. Any change to the share text or the counter.
