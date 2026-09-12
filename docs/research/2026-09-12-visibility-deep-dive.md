# Visibility deep dive — how and where to get ASTO to the public (2026-09-12)

**Status: research complete.** The forward plan built from it is `docs/superpowers/plans/2026-09-12-visibility-push.md`. Nothing here has been
posted, submitted, or sent. Every door below needs Max's word before it is knocked on.
Scope set by Max this session: **free channels only**; the main audience is **word-game
enthusiasts** (the Wordle and Connections crowd); **communities and listings** first; the
**educational angle** is a secondary section. Creators/press and app stores are out of scope.

Method: two research passes (channels; education) fetched every rules page, submit form and
article cited below on 2026-09-12. Reddit blocks page fetches in this environment, so
subreddit rules and member counts come from Reddit's public JSON endpoints
(`/about/rules.json`, `/about.json`), and a few teacher-subreddit rules come from third-party
mirrors. Anything not fetched is marked **UNVERIFIED**. Multipliers ("4× plays") are not
used anywhere in this doc — the Brain flags them as folklore.

---

## 0. The baseline

- `npm run plays` today: **no plays recorded** since the counter went live 2026-09-08.
  D-34's reconsider-when ("a month of nobody but Max — then the listings push stops being
  optional") is four days into its month.
- Calendar runway: today's board is on; **last scheduled board 2026-09-19**. 19 boards are
  awaiting Max's read in the Studio; publishing them extends the calendar without a new
  batch. **A visitor who arrives on 09-20 to no board is a visitor lost.**
- Link previews: `index.html` and `about.html` carry **no `<meta name="description">` and
  no Open Graph tags**. A fetcher with no JavaScript (Reddit's link preview, Discord's
  embed, Playlin's crawler) sees only *"Something went wrong loading the puzzle."*
- itch.io: D-26 records the upload but **no URL** anywhere in the repo, and searches for
  `asto`, `playasto`, and the two obvious profiles found no published page. Either it is
  a draft, unlisted, or under another account. Tags, screenshots and the generative-AI
  disclosure field could not be inspected (**UNVERIFIED**).
- What ASTO already has of the mechanics credited with organic spread (§5): the
  spoiler-free share grid with a deep link, one board a day for everyone, no signup, no
  ads, a named human on the About page, streaks and an archive.

---

## 1. The ranked plan

Sequenced the way D-34 and the Brain agree: **readiness → the doors that compound
(directories that keep linking) → the crowds → lottery tickets → the educational angle
last.** One door every few days, not all at once, with `npm run plays` read after each
so the signal is attributable. The measures that count are the honest ones: **starts per
day, distinct browsers, browsers back on a second day** — not ratings.

### Readiness (before any door)

| # | Item | Effort | Needs from Max | Claude prepares |
|---|---|---|---|---|
| R1 | **Extend the calendar past 09-19** — review and publish waiting boards in the Studio | 1–2 h of reviews | His reads | Nothing new; the Desk (D-35) is built for this |
| R2 | **Link previews** — a meta description and OG title/description/image on `index.html` and `about.html`, plus a `<noscript>` line that describes the game | ~1 h | Approve the copy and the image (a board screenshot) | The change, the tests, the browser check; a small gated unit on a work branch |
| R3 | **The 60–90 s clip** cut from the 09-08 capstone take (Brain: `the-ninety-second-demo-video`) — open on play, ~7 peak moments, only what is shipped | 1–2 h | Choose the cut; **use a Past Pour, never today's board; never tap Share on camera** | The cut with ffmpeg from the existing recording, as on 09-08 |
| R4 | **The one-liner and a blurb per channel** — *"Connections, but you build the analogies."* Never *"the only daily analogy game"* (§6: dailyanalogy.com exists). Disclose AI on the About page, never in the headline (Brain: `ai-disclosure`) | 30 min | Pick the line | Blurb variants sized to each door's form |
| R5 | **The itch page** — find or republish it; record its URL in `docs/design.md` D-26; tick the generative-AI disclosure (**Text & Dialog**, plus Code if applicable); tags `daily`, `word-game`, `connections`, `puzzle`, `cozy`; re-upload `npm run itch` after R1 | 20 min | All of it — the account is his | A tags/description checklist; the fresh zip |

### Tier 1 — the word-game crowd (free, dev-friendly, evidence of traction)

| # | Door | Reach | Rule / mechanism | Evidence | Effort | Needs from Max |
|---|---|---|---|---|---|---|
| 1 | **Playlin** submit form — https://playlin.io/submit/ | The daily-game directory of record: 950+ games, hand-played, links back to the game's own home, a weekly "Playlin 40" chart and newsletter. Its *games like Connections* page lists 15 indies and no analogy game | Free to play in the browser without an account; original concepts, not clones. Form asks URL, name, creator, email | Chronoodle's maker runs it; NYT Connections sits at #20 on this week's chart | 5 min | Submit under his name |
| 2 | **r/NYTConnections** (65K) post | The exact audience | Rule *Self promotion*: "Posting Connections boards you have created is acceptable and encouraged! But please no promotion of materials that are tenuously related" — https://www.reddit.com/r/NYTConnections/wiki/rules | CraftWord "a new daily word game" 236↑/143c (2024-03); "I made a game that's similar to Connections" 110↑/51c; Unloseable Connections 137↑ | 20 min | Post from his account; frame it as a Connections-inspired board, a screenshot of a solved set |
| 3 | **r/WebGames** (143K) link post, flair `[PZL]` | Large, explicitly dev-friendly | Direct link to the game; **title must begin with the game's name**; no signup required; no repost within 3 months — https://www.reddit.com/r/WebGames/about/rules/ | Poople daily word game 104↑/72c (2025-10); Hidden Joey 34↑; Word Pizza 29↑; daily word games reliably 30–100↑ | 10 min | Post; reply to comments the same day |
| 4 | **r/playmygame** (141K) | Launch crowd; **AI-tolerant if truthful** | Free to play now, direct link, state your role; "Be Truthful — no false claims about your game"; "No AI culture wars"; **one post per month** — https://www.reddit.com/r/playmygame/about/rules/ | **Clues by Sam launched here** 84↑/76c (2025-05); Redactle 73↑; Blockle 29↑/70c | 15 min | Post with the AI line stated plainly |
| 5 | **Thinky Games** — About → Contact → *Submit your own game*; press@thinkygames.com | A funded six-person editorial team, a games database, a biweekly newsletter that carries **one free web-game recommendation**, a Discord (~10K, UNVERIFIED) | Developer submit form; Discord sharing rules not readable without joining (UNVERIFIED) | Their *Tired of Wordle and Connections? Try these 7+ daily puzzle games* (updated Dec 2025) lists Clues by Sam, Minute Cryptic, Nerdle… | 15 min | Submit; join the Discord under his name if he wants that channel |
| 6 | **r/wordgames** (4.7K) — reply in the two live request threads, then one *Showcase* post | Small but exactly right | "You may share your own work occasionally if you also participate meaningfully" — mod META 2025-10 | *Looking for chill daily word games that are not Wordle clones* 21↑/148c (2026-07); *daily word games… NOT part of a platform* 21↑/109c | 20 min | Two replies, one post, a few genuine comments elsewhere first |
| 7 | **Room Escape Artist** — comment on the Daily Puzzle Game Recommendations Guide — https://roomescapeartist.com/2025/09/06/daily-puzzle-game-recommendations-guide/ | A guide readers keep returning to, updated periodically | "If you have a favorite daily puzzle game that isn't listed here, please leave a comment"; 22 comments, latest Aug 2026, readers' suggestions were added | 5 min | One comment |

### Tier 2 — the long tail of directories (one afternoon, cumulative search traffic)

| # | Door | Mechanism |
|---|---|---|
| 8 | **Listdle** — https://listdle.com (600+ daily games) | "Suggest a Game" link; contact@listdle.com |
| 9 | **Dle Hunt** — https://dlehunt.com (620 games) | "Submit a dle"; "our team reviews every submission" |
| 10 | **The Dles** — https://dles.aukspot.com (755 games) | "Suggest a dle" form |
| 11 | **r/puzzles** (450K) | Self-promotion **only** as a comment in the stickied *Promo Weekly* thread (126 comments in the current one); standalone posts are removed |

### Lottery tickets (free, single-digit expectations, do them once)

- **Show HN** — rules: playable without signup, don't ask friends to upvote. Clues by Sam's
  Show HN scored **3 points** (https://news.ycombinator.com/item?id=43923843) and the game
  reached 50K daily players anyway. Daily *word* games on HN score 3–12; daily *logic* games
  do better. Expect single digits.
- **Product Hunt** — free; Word Games topic has 143 products, most with one review; no
  evidence an indie daily word game drew traffic. Launch at 12:01 AM PT if at all.
- **awesome-wordle** GitHub list (https://github.com/prakhar897/awesome-wordle) — a PR, 24 stars, Wordle-variant focused.
- **Tips lines that already covered these games:** Aftermath (tips@aftermath.site;
  Riley MacLeod's July 2026 "too many start-the-day games", Gita Jackson on Clues by Sam),
  the Daily Illuminator's "Daily Game Quirk" posts (smarsh@sjgames.com), Rangsk on YouTube
  (116K subscribers, daily "Bracket City and other daily games" videos at ~1K views each).
  These are press, not listings — out of scope this session; recorded for when a door has
  moved the counter and there is something to point at.
- **Bluesky.** Both the NPR/LAist and Aftermath writers said they found their games through
  people on Bluesky. Not a door; where the listeners are.

### Tier 3 — the educational angle (secondary; needs work before any door opens)

Findings in §6. In one line: the adult analogy tests are gone (SAT 2005, GRE 2011, Miller
Analogies Test discontinued Nov 2023); the live analogy-practice population is **children
aged 8–14** on CogAT, OLSAT, SSAT, HSPT, the UK 11+ and the WordMasters Challenge. ASTO's
Red and Black tiers are adult vocabulary. So every educational door below needs **a teacher
page** (bell-ringer framing, no-login and privacy line, "every board human-reviewed", Learning
Mode explained, tier guidance) and most need **an easier mode or a tier filter** — both are
game changes with their own gates, and neither is proposed here.

| # | Door | What it wants | Prerequisite |
|---|---|---|---|
| E1 | **Larry Ferlazzo's "Best Learning Games" lists** (https://larryferlazzo.edublogs.org/2026/07/04/the-best-learning-games-of-2026-so-far/) — already lists indie daily word games (Shuffalo, Pears, Fluxis); developers get listed by posting in comments | A tip in the comments | Teacher page |
| E2 | **ISTE+ASCD EdTech Index** self-listing — the named replacement now that Common Sense Education **paused its edtech reviews in Jan/Feb 2026** | A free developer listing | Teacher page + privacy statement |
| E3 | **Teachers Pay Teachers free printable** — a board plus answer key as a PDF that carries the URL inside; TPT bans link-only listings, and "daily analogies" printables already sell there | A printable export | An easier board set |
| E4 | **Well-Trained Mind forum** — the one homeschool venue whose rules **explicitly permit a one-time invitation to a free program** (https://forums.welltrainedmind.com/guidelines) | One post, once | Easier mode |
| E5 | **Advanced ESL** — r/languagelearning (3.4M, promo allowed "not too frequently"); r/EnglishLearning bans promotion **without modmail first** | Modmail, then one post | A "for advanced learners" note; ESL Wordle variants cap vocabulary at A2–B1, ASTO's upper tiers are C1+ |

**Closed educational doors:** r/Teachers (rule 3: "Do not advertise nor promote anything");
Facebook teacher groups (no-links norm; only when someone *asks*); the elevenplusexams.co.uk
forum (bans outside prep materials); Common Sense Education (reviews paused).

### Skip, with reasons

| Channel | Why |
|---|---|
| r/IndieGaming (522K) | "If your game heavily utilizes or relies on GenAI, please do not post it here" — AI-generated puzzles qualify |
| r/gamedev (2.06M) | "No Showcasing Projects" — only a real postmortem with numbers, later |
| r/wordle (82K) | Wordle only; spinoffs go to r/WordleSpinoffs (203 members, AI must be flaired) |
| r/crossword (59K) | "If it doesn't have a grid, it doesn't belong here"; also "No AI-generated content" |
| r/casualgames | Private |
| r/puzzlevideogames (22K) | No rules published; no evidence either way. Marginal, not skip — try after Tier 1 |
| Poki | Requires **web exclusivity** — conflicts with playasto.com |
| Kongregate | Stopped accepting games in July 2020 |
| Newgrounds, Game Jolt | Anti-AI stance and the wrong audience (games judged/blammed; "no bots/ai" in Game Jolt's blurb) |
| CrazyGames, Armor Games | Ad-revenue portals and licensing pitches; a zero-monetisation daily is listable but pointless |
| Puzzmo | Zach Gage's own games; no open submissions |
| Merriam-Webster, Dictionary.com, Britannica | Run or acquire their own games (Quordle, Octordle); no third-party link-outs. Wordnik is the friendliest dictionary brand (a "Word Gamers newsletter" for developers) — a soft note, not a listing |
| Crossword Fiend, BoardGameGeek | Crosswords and tabletop only |

### Rules that apply to every door

- **Never lead with "AI-made."** State it plainly where a rule asks (r/playmygame) and on
  the About page; never in a title. Where a community bans GenAI, don't post.
- **Never post today's board's answers.** The capstone take played that day's board; the
  clip and every screenshot use a Past Pour.
- **One post per community.** r/WebGames: no repost within three months; r/playmygame: one
  a month. Don't push the same small group twice (Brain: `honest-feedback-sources`).
- **Post from a Reddit account with history.** Most subs auto-filter new accounts
  (r/IndieGaming requires a week; others UNVERIFIED). Max's account is his to judge.
- **Read the counter after each door**, not at the end. `npm run plays` is the scoreboard;
  `docs/log.md` records which door moved what.

---

## 2. What D-34 already established (not re-researched)

Meowdoku's audience was bought (Oakever Games, ~$500K/day of user acquisition). The organic
dailies — Wordle, Bracket City, Clues by Sam — share a share artifact, one free daily board,
and a break that came from **a person with an audience playing it**, not the creator's
posts. The share text now carries the deep link home; the play counter is live. See
`docs/design.md` D-34 and `docs/superpowers/specs/2026-09-08-visibility-prerequisites-design.md`.

## 3. Reddit, in detail

Member counts from `about.json`, rules from `about/rules.json`, fetched 2026-09-12. Post
scores from Reddit search; each linked post was opened.

- **r/WebGames** — 143,150. P2 no repost within 3 months · P3 titles begin with the game's
  name · P4 direct links to single web games · P5 no signup · P7 works in standard browsers.
  Flair list at https://www.reddit.com/r/WebGames/wiki/index (`[PZL]`, `[HTML5]`). Daily word
  games: Wordle 284↑ (2021), **Poople 104↑/72c** (https://reddit.com/r/WebGames/comments/1o65gfv/),
  Gisnep 56↑, Hidden Joey 34↑/29c (2026-07), Word Pizza 29↑/19c (2026-02).
- **r/puzzles** — 449,562. "Self-promotion is allowed only in the Promo Weekly post stickied
  to the top." Also bars puzzles from ongoing contests "includes daily puzzles" as posts.
  Current Promo Weekly: https://www.reddit.com/r/puzzles/comments/1w9cdoo/ (126 comments).
- **r/wordgames** — 4,745. "We love when creators share their word game projects — but please
  do so thoughtfully and in moderation." Mod META (2025-10-19): no spam, surveys or monetised
  links (https://www.reddit.com/r/wordgames/comments/1ob0x6h/). Request threads:
  https://reddit.com/r/wordgames/comments/1v3b92b/ (148 comments) and the "not part of a
  platform" thread (109 comments). Comparable posts: Overlaps 23↑/14c, Strokes 25↑/44c.
- **r/NYTConnections** — 65,056. Self-promotion rule quoted in §1. Posts:
  https://reddit.com/r/NYTConnections/comments/1bsbzyt/ (CraftWord, 236↑),
  https://reddit.com/r/NYTConnections/comments/1ccf7tl/ (110↑). Flairs: *Custom Puzzle*,
  *General Discussion*.
- **r/playmygame** — 141,308. Rules quoted in §1. Flair `[Mobile] (Web)` or `[PC] (Web)`.
  https://reddit.com/r/playmygame/comments/1kffeb3/ (Clues by Sam, 84↑/76c).
- **r/IndieGaming** 522,391 · **r/gamedev** 2,061,995 · **r/wordle** 81,662 ·
  **r/WordleSpinoffs** 203 · **r/puzzlevideogames** 22,451 · **r/crossword** 58,577 ·
  **r/casualgames** private — see the skip table.
- No standing "daily game of the day" thread exists on any of these; the two r/wordgames
  request threads are the nearest thing.

## 4. Directories, portals, communities, writers — in detail

**Directories.** Playlin (https://playlin.io/about/, https://playlin.io/charts/,
https://playlin.io/collections/games-like-connections/) — "Every game is hand-played…
original concepts (not clones)… Every listing links to the game's original home, so
creators keep the traffic"; chart "ranked by plays and favorites… paid placement never
does". Listdle, Dle Hunt, The Dles as in §1. Puzzle Index (https://puzzle-index.com) has
no submission path. greatest.games' guide is a studio's own blog. Crosswordle's "25 Wordle
alternatives" has no submit path.

**Portals.** itch.io: indexing needs Public + cover image + browser-playable; "Recently
released is a very bad place to launch"; devlogs go out in email digests; tag abuse gets a
page deindexed (https://itch.io/docs/creators/getting-indexed,
https://itch.io/docs/creators/quality-guidelines). Tags in use: `daily` (213 games),
`word-game` on web (1,519), `connections` (26, incl. MeowGrid). Generative-AI disclosure:
"only mandatory for asset creators, but we encourage everyone to fill it out"; "itch.io
itself doesn't apply any penalties or automatic filtering" (https://itch.io/post/11423214).
Poki (https://developers.poki.com/guide/working-with-poki) requires exclusivity. CrazyGames
(https://docs.crazygames.com/requirements/intro/) lists free games but exists for ad
revenue. Armor Games: email mygame@armorgames.com, licensing deals. Kongregate closed to
new games 2020-07. Newgrounds judges HTML5 games in "Under Judgment"; its anti-AI stance is
stated for the Art Portal and UNVERIFIED for games.

**Communities.** Thinky Games (https://thinkygames.com/about/): team of six, Carina's
Thinking Games Initiative funding, database, biweekly newsletter with a free web-game pick,
"Thinky Dailies"; submit form on the About page; press@thinkygames.com. The original Thinky
Puzzle Games Discord (2018, ~5K, UNVERIFIED) reportedly has a progress-report channel
(UNVERIFIED). Puzzle Hunters Discord (~32K, UNVERIFIED) is hunt-focused. Crossword Fiend
reviews newspaper crosswords only. BoardGameGeek's word-game threads are tabletop.

**Writers who recommend daily browser puzzles** (recorded; press outreach is out of scope
this session): Room Escape Artist (§1); Thinky Games (§1); Playlin's *Meet the Makers*
interviews; Rangsk on YouTube; Aftermath (tips@aftermath.site); Linda Holmes at NPR/LAist
(Sept 2026 "five great games", sourced from Bluesky, no tips channel); Steven Marsh's Daily
Illuminator; W. Eric Martin's Clues by Sam write-up (contact page 404). Substacks checked
and set aside: Puzzle Talk, Quite Vexing, Puzzle Weekly, Puzzle Digest.

## 5. Growth mechanics credited in coverage — has / lacks

| Mechanic | Source | ASTO |
|---|---|---|
| Spoiler-free emoji share grid — Wordle went from 90 players (2021-11-01) to 300K (2022-01-02) once it was built in | https://en.wikipedia.org/wiki/Wordle · https://techcrunch.com/2022/01/12/josh-wardle-interview-wordle/ | **Has** — tier squares + deep link (D-34) |
| One puzzle a day, the same for everyone — "scarcity… everybody is solving it" | TechCrunch interview | **Has** |
| Nothing wanted from you — no signup, no ads, no push | TechCrunch interview | **Has** |
| A named human behind it — "there was a person behind the games" | https://www.wericmartin.com/spotting-criminals-is-a-daily-challenge-with-clues-by-sam/ · https://slate.com/culture/2022/01/wordle-game-creator-wardle-twitter-scores-strategy-stats.html | **Has** — the About page |
| A one-line hook a writer can repeat — Clues by Sam: "the game doesn't let you guess" | https://aftermath.site/clues-by-sam-wordle-daily-puzzle-game/ | **Lacks a settled line** — R4 |
| Word of mouth plus one streamer spike (Northernlion's Clues by Sam video, 87K views) | https://www.youtube.com/watch?v=huGAhUdqw-A ; the "majority from word of mouth" quote is from a LinkedIn post seen only in a snippet — UNVERIFIED | n/a — out of scope |
| A friend-of-a-friend to a publisher (Bracket City → The Atlantic at ~90 daily solvers, UNVERIFIED figure) | https://www.readergrev.com/p/bracket-city-the-atlantic-wordle-connections-nyt | n/a |
| Streaks and stats, an archive | Puzzmo interview, https://www.gamedeveloper.com/design/puzzmo-co-creator-zach-gage-on-building-newspaper-games-that-can-last-forever | **Has** both |
| Leaderboards / groups | same | Lacks — not proposed; Puzzmo sells them as subscription value |
| Link previews that describe the game | (an ASTO finding, §0) | **Lacks** — R2 |

Not credited anywhere fetched: hints, a learning mode, confetti.

## 6. The educational angle — in detail

**Where analogies still live.** SAT dropped them in 2005
(https://blog.prepscholar.com/sat-analogies-and-comparisons-why-removed-what-replaced-them);
GRE in 2011 (https://www.manhattanreview.com/gre-changes/); the Miller Analogies Test was
last administered 2023-11-15 (https://en.wikipedia.org/wiki/Miller_Analogies_Test). They
remain on **CogAT** (Verbal Analogies subtest, grades 3+, used for gifted identification —
https://www.testprep-online.com/cogat-verbal), **OLSAT** (NYC gifted & talented —
https://www.testingmom.com/tests/olsat-test-5/sections/), **SSAT** (30 of 60 verbal items —
https://testinnovators.com/blog/ssat-verbal-reasoning/), **HSPT** (Catholic high-school
entrance), the **UK 11+** GL Assessment verbal reasoning
(https://www.explorelearning.co.uk/11-plus-exams/gl-11-plus-exam-information/), some
civil-service tests, and the **WordMasters Challenge** — a real national grades 3–8 analogy
competition, three meets a year, published word lists, $110 per grade team
(https://www.wordmasterschallenge.com/how-the-challenge-works). The practising population
is children and their parents and teachers; they practise on TestingMom, TestPrep-Online,
Quizlet (500+ SSAT analogy sets), 11plusehelp, Twinkl, Critical Thinking Co. workbooks.

**dailyanalogy.com exists** (verified in the browser 2026-09-12): three daily modes (Classic
fill-the-blank from a word bank, Odd One Out, The Connection), streaks, weekly leagues,
duels, an archive, and a **Classroom mode** with class codes and a leaderboard; free with a
sponsored ad slot; puzzle #620 today, so roughly a January 2025 start (inferred). It
competes on the phrase "daily analogy" and differs on mechanic: a quiz, not a board you
assemble. Other analogy practice: Brain Curls (untimed adult quiz), RoomRecess and TinyTap
(K–5), Google Play aptitude-drill apps, Vocabulary.com's analogy worksheets (now inside IXL,
paid), Membean's analogy question type (paid), TPT "Analogy of the Day" printables — which
prove teachers already run a daily-analogy warm-up ritual on paper.

**Teacher, homeschool and ESL venues and their rules** — see Tier 3 and the closed list in
§1. Sources: r/Teachers rule via mirror (https://leadsrover.io/subreddits/r/teachers, reviewed
2026-06-08); Facebook-group norms (https://groupboss.io/blog/facebook-group-rules/); Well-
Trained Mind (https://forums.welltrainedmind.com/guidelines); TPT content guidelines
(https://help.teacherspayteachers.com/hc/en-us/articles/360042626931-TPT-Content-Guidelines);
Common Sense Education's pause (https://www.commonsense.org/education/reviews/FAQ); the ISTE
EdTech Index (https://iste.org/edtech-index-faqs); WeAreTeachers on Wordle as a bell-ringer
(https://www.weareteachers.com/using-wordle-in-the-classroom/); TCEA on Connections games
(https://blog.tcea.org/connections-games-classroom/); r/EnglishLearning and r/languagelearning
rules via mirror (https://leadsrover.io/subreddits/r/EnglishLearning,
https://leadsrover.io/subreddits/r/languagelearning); ESL Wordle vocabulary caps
(https://www.eslkidsgames.com/esl-wordle). Dictionary brands: Merriam-Webster acquired Quordle
(https://games.slashdot.org/story/23/01/20/222214/merriam-webster-acquires-wordle-clone-quordle);
Dictionary.com's games hub is run by Arkadium with licensed publishers only; Wordnik's Word
Gamers newsletter (https://blog.wordnik.com/whats-happening-with-wordnik-news-and-events-2).

**Honest assessment (judgement, marked as such).** The daily cadence and no-login are exactly
what the Wordle-in-the-classroom coverage praises. Three things stand between ASTO and a
teacher's bookmark: difficulty (Black is adult; the population is grades 3–8), a content
guarantee (cozy adult themes need a "classroom-safe" line), and the AI disclosure phrased
for schools — 2026 district AI policies commonly require that AI-generated content be
"reviewed and approved by an educator before it can be presented to students"
(https://excelined.org/2026/05/26/state-k-12-ai-policy-in-2026-milestones/); ASTO's "every
published puzzle has been played by Max before release" is the right kind of statement,
worded for the wrong reader. Credible as a warm-up, not as a study tool: there is no adult
test left to study for.

## 7. Positioning notes

- The line: **"Connections, but you build the analogies."** The mechanic is the claim; the
  category ("daily analogy game") is taken.
- The About page already discloses the AI pipeline and human review well. It does not
  mention Learning Mode, an age range, or a privacy line aimed at schools — only needed if
  Tier 3 is ever pulled in.
- Every writer above found their games through people, not submissions. The directories
  and subreddits are where a person with an audience might find ASTO; they are not the
  break themselves. D-34's finding stands.

## 8. Candidate backlog lines from this research (unapproved)

- Link-preview metadata on `index.html`/`about.html` (R2) — a small gated change.
- The itch page URL is unrecorded in the repo (R5).
- dailyanalogy.com as a named competitor — worth a look at its Classroom mode if Tier 3
  is ever pursued.
- A teacher page and an easier/tier-filtered mode — the two prerequisites for Tier 3.
- A one-line hook on the title screen — R4's line, once chosen, could live on the page.

## 9. Method notes and the unverified list

Fetched this session: every rules page, submit form, article and post linked above. Reddit
data via public JSON endpoints in the user's own Chrome (read-only). **UNVERIFIED:** Thinky
Games Discord size and sharing rules; Thinky Puzzle Games and Puzzle Hunters Discord sizes;
Newgrounds' AI policy for games; Game Jolt's formal AI policy; r/ELATeachers, r/homeschool,
r/Gifted, r/logophilia, r/words rules; Dave's ESL Cafe rules; Free Technology for Teachers'
2026 activity; the Clues by Sam "word of mouth" quote and its 50K DAU figure; Bracket City's
~90-solver figure; dailyanalogy.com's creator; the itch.io page's existence and settings;
Rangsk's and W. Eric Martin's contact details.
