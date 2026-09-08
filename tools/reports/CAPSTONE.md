# MAIGD Capstone — the Sept 8 submission

> **Submitted 2026-09-08.** Package: `dist/asto-capstone-2026-09-08.zip` — the light video
> cut (3:59), the playable build, and a README. This document is now the record.

**Game:** ASTO — *"Connections, but with analogies."* Live at **https://www.playasto.com**;
also on itch.io. This document is everything around the one artifact only Max can make:
the gameplay video. Prepared 2026-09-07, the day before the deadline, from a full
rehearsal of the route below in the browser at 375×812.

## 1. The bar, and where ASTO stands

Class 14's stated requirements (Brain: `learning/maigd/class-14-the-architects-exit.md`).
Passing is 80/100; *"a simple, fun, working game scores higher than an ambitious, broken,
impressive one."* The final submission is **just the game**.

| Requirement | Status |
| --- | --- |
| A completed playable game, ideally a click-and-play itch.io link | **Done.** playasto.com is current (`npm run check-deploy` matched today). The itch upload is the **2026-08-25 build** — see §6. |
| A README covering *how to play* | **Not required** by the class's own rule: the title screen's *How to play* runs a coached warm-up board. Covered anyway: `README.md` now opens with a player-facing *How to play*, and §5 has a blurb for the itch page and the form. |
| Some improvement between Sept 1 and Sept 8 | **Met** — see §7 for the one-line answer. Visible on playasto.com; only visible on itch if the build is re-uploaded. |
| A 2–3 minute gameplay video | **Not yet.** §2–§4 are the shot list, the script and the recording setup. |

## 2. The demo board and the route

**Board: Bedside Manor** (`?puzzle=bedside-manor`, released 2026-09-05, Max's own pick as
his best puzzle). Its answers will be public in the video — it is a Past Pour, not today's
board, so the daily spoil is nil. The four sets, in tier order:

| Tier | Answer, in order | Card label |
| --- | --- | --- |
| Green | surgeon : scalpel :: phlebotomist : needle | worker and the tool of their trade |
| Yellow | onset : remission :: admission : discharge | start and end of a medical span |
| Red | bandage : wound :: cast : fracture | a cover and the true thing hidden beneath it |
| Black | stent : blood flow :: pacemaker : heartbeat | the device that lets a bodily process continue |

Glossary word for the Vocab beat: **phlebotomist** ("someone trained to draw blood from
people, usually for tests or donations"). Learning Mode definition used in the route:
**stent** ("a tiny tube placed inside a vessel to keep it open and working").

**Start from a fresh profile.** Open a **Private tab** so the board is unplayed, Learning
Mode is off (the Settings flip on camera is then real), and the calendar carries no history.
Rehearsed and verified: the deep link lands straight on the board, no title screen.

**What the rehearsal found that shapes the order:**

- **Vocab must come before the green solve.** The gloss belongs to *phlebotomist*; once
  that set is solved the Vocab pill greys out. So the cold open is: two tiles, Vocab, two
  more tiles, Confirm.
- **Long words now fit their tiles** (fixed 2026-09-07, before recording): a term steps
  its font size down only as far as it must — *phlebotomist* sits on one line at 11px on
  its tile and 10px in the frame slot — and only past the floor does a word hyphenate
  onto a second line. Verified on every long word in the catalogue. No wrap to worry
  about on camera.

**Alternative board**, in case you prefer it: *Borders, Bounds, and Bearings*
(`?puzzle=borders-bounds-and-bearings`, 2026-08-01, the oldest). Green `lodging : hostel ::
transport : ferry` · Yellow `rudder : steer :: throttle : accelerate` · Red `carousel :
luggage :: overhead bin : carry-on` · Black `pitch : strike :: inflate : deflate`. Gloss:
*carousel*. Every beat below transfers; only the words change.

## 3. Shot list and script — about 2:15

Every on-screen string below was read back from the DOM during the rehearsal. Narration is a
suggestion; say it your way. Keep the first thirty seconds tight — that is the part that
gets watched.

| Time | On screen | You do | You say |
| --- | --- | --- | --- |
| 0:00 | The board, mid-title "Bedside Manor", four empty beans | Tap **surgeon**, **scalpel**. | "ASTO. Sixteen words, four hidden analogies. Surgeon is to scalpel…" |
| 0:08 | Status: *A little vocabulary — on the house.* Footnote: **phlebotomist** — someone trained to draw blood… | Press **Vocab**. | "Don't know a word? Every board glosses its hardest one." |
| 0:14 | Frame fills: surgeon : scalpel :: phlebotomist : needle | Tap **phlebotomist**, **needle**, press **Confirm**. | "…as phlebotomist is to needle." |
| 0:20 | *Correct!* — tiles fly into a **GREEN** card: *worker and the tool of their trade* | Pause a beat. | "That's one set. This is to that." |
| 0:26 | Frame: onset : admission :: remission : discharge | Tap **onset**, **admission**, **remission**, **discharge**, **Confirm**. | "Here's the twist. These four are a set — but order is the whole game." |
| 0:36 | *So close! Right four words — check the order.* One bean turns brown; the four stay in the frame. | Let it land. | "So close. Right words, wrong order — it costs a bean, but it keeps your four." |
| 0:42 | Frame: onset : remission :: admission : discharge | **Drag admission** to the third slot (or tap it out and tap it back), **Confirm**. | "Onset to remission, admission to discharge. The start and end of a medical span." |
| 0:50 | *Correct!* — **YELLOW** card | | |
| 0:54 | *These four make one analogy — the order is yours to find.* Four tiles tint red. | Press **Hint**. | "Stuck? One free hint shows you a whole set — and its colour tells you how hard it is." |
| 1:02 | Calendar → Settings: **Learning mode** switch slides to **On** | **Back**, the **gear**, flip **Learning mode**, **Back**, tap **5**, **Play**. | "New this week: Learning Mode. Turn it on in Settings…" |
| 1:14 | Board resumes, two cards solved. Status: *Tap a tile to see what it means.* Every tile wears a dashed ring. | Press **Vocab**. | "…and now Vocab defines *any* tile." |
| 1:20 | Footnote: **stent** — a tiny tube placed inside a vessel to keep it open and working. Tile not selected. | Tap **stent**. | "Tap a word, read what it means, keep playing." |
| 1:28 | **RED** card | Tap **bandage**, **wound**, **cast**, **fracture**, **Confirm**. | "A bandage hides a wound, a cast hides a fracture." |
| 1:38 | **BLACK** card | Tap **stent**, **blood flow**, **pacemaker**, **heartbeat**, **Confirm**. | "And the hard one: what each device keeps going." |
| 1:46 | *Puzzle solved!* · *All four sets, 1 bean used.* Confetti. The four cards arrive one by one with their explanations. | Let the cards land. | "Every set explained. One bean spent, and I learned a word." |
| 1:58 | Survey: *How was this one?* — a tapped row slides out, **✓ Difficulty 3 · change** slides in. | Tap **Difficulty 3**. Optionally **Share**: *Copied to your clipboard.* | "Tell me how it felt — the ratings shape the next boards." |
| 2:06 | Past Pours calendar: the **5** shows a brown cup with a small book. Then the Statistics page. | **Puzzles**, then the **bar-chart icon**. | "One board a day. Every past day stays open, and the calendar remembers." |
| 2:14 | Title screen: **ASTO · This is to that. · How to play · Play · About this game** | Tap the wordmark, then **How to play** for two seconds. | "New players get a coached warm-up." |
| 2:20 | About page, the line *"Every published puzzle has been played by Max before release."* | Tap **About this game**. | "The puzzles come from an AI pipeline I built and edit. Every one is played before it ships." |
| 2:26 | Title screen | | "playasto.com. This is to that." |

**Share text** on this run, deterministic: `ASTO — Bedside Manor` / `4/4 · 1 bean · 📖` /
`🟩🟨🟥⬛`. The 📖 is the Learning Mode mark.

**Cuts if it runs long:** the statistics page (2:06) and the How-to-play glimpse (2:14) are
the first to go. Don't cut the so-close beat — it is the one thing no other word game does.

## 4. Recording — exact steps

Route 0 is the one to use: wireless, one device, real touch, and the game's sound and
your voice land in one file. Routes A and B need the Mac.

**Before either route (five minutes)**

1. Charge the phone; put it on **Do Not Disturb** (Control Center → Focus) so no banner
   lands in the take.
2. Read §3 once through and keep it open on the Mac beside the recording window.
3. Decide what you will say for the first fifteen seconds. Everything after that can be
   loose.

**Route 0 — record on the iPhone itself (wireless, recommended)**

1. Settings → Control Center → add **Screen Recording** if it is not there (the green +).
2. Do Not Disturb on. Ringer switch on, volume about half.
3. Safari → tabs button → **Private** → **+** → `playasto.com/?puzzle=bedside-manor`. Tap
   the **aA** icon in the address bar → **Hide Toolbar**, so only a thin domain strip shows.
4. Swipe down from the top-right for Control Center. **Long-press** the Screen Recording
   button (a circle inside a circle). Tap **Microphone** so it is on. Tap **Start
   Recording**. Three-second countdown; swipe up to close Control Center.
5. Run the §3 route, narrating as you go.
6. Stop: tap the red indicator at the top of the screen → **Stop**. The video is in Photos.
7. Photos → **Edit** → trim the first and last seconds (Control Center, the stop tap).
8. Share → **AirDrop** to the Mac, or upload from the phone with the YouTube app as
   **Unlisted**. Portrait is fine for itch and YouTube.

**Wireless alternatives if you want it on the Mac:** the **iPhone Mirroring** app (macOS
15+, same Apple ID, Bluetooth and Wi‑Fi on) shows the phone in a window — record that
window with QuickTime as in Route B, narrating live; or turn on **AirPlay Receiver**
(System Settings → General → AirDrop & Handoff) and use Screen Mirroring from the
phone's Control Center, then record the same way. Game sound does not reach a Mac screen
recording without a loopback device; do the throwaway take first either way.

**Route A — iPhone mirrored into QuickTime**

1. Plug the iPhone into the Mac with a cable. On the phone tap **Trust** if asked.
2. On the Mac open **QuickTime Player** (⌘Space, type QuickTime, Return).
3. **File → New Movie Recording.** A camera window opens.
4. Click the small **▾ arrow** beside the red record button. Under **Camera** choose your
   iPhone. Under **Microphone** choose your iPhone too — that is what carries the game
   sound into the file. Set **Quality: Maximum**.
5. The phone's screen now shows in the window. On the phone open **Safari**, tap the
   **tabs button** (two squares, bottom right), tap **Private**, tap **+**, and type
   `playasto.com/?puzzle=bedside-manor`. Go. Confirm the board is up and nothing is
   tapped yet. A Private tab means an unplayed board, a clean calendar, and Learning
   Mode off, so the Settings flip on camera is real.
6. Turn the phone's ringer switch **on** and the volume to about half, so the beats have
   sound.
7. Click **record** in QuickTime. Count two seconds. Start the §3 route from the top.
8. When the title screen is back up at the end, count two seconds, click **stop**.
9. **File → Save** → `asto-capstone-take1.mov` on the Desktop. Watch it once. Then do
   the real take the same way — the first one is the throwaway that proves recording
   works.
10. **Narration:** the phone-as-microphone does not pick up your voice, so add it after.
    Open **iMovie → Create New → Movie**, drag the .mov in, drag it onto the timeline,
    put the playhead at the start, click the **microphone icon** under the viewer, press
    the red button and talk over the playback using the §3 lines. Stop, then **File →
    Share → File → Resolution 1080p → Next → Save**.
    If you would rather not narrate, skip iMovie: QuickTime **File → Export As → 1080p**
    and the game sound carries the video on its own.

**Route B — the Mac, a phone-sized region**

1. Open **Chrome → File → New Incognito Window** (⇧⌘N). Go to
   `playasto.com/?puzzle=bedside-manor`.
2. **View → Developer → Developer Tools** (⌥⌘I). Click the **device toolbar** icon at the
   top left of the DevTools panel (⇧⌘M). In the **Dimensions** dropdown choose
   **Responsive** and type **375** × **812**. Set the zoom dropdown to **100%** (or 150%
   for a bigger picture). Press **⌘R** so the page lays out at phone size.
3. Undock DevTools so the phone frame sits alone: the **⋮** menu at the top right of
   DevTools → **Dock side → Undock into separate window**. Move that window aside.
4. **QuickTime → File → New Screen Recording.** In the toolbar that appears choose
   **Record Selected Portion**, then drag the dotted region to just cover the phone
   viewport. **Options → Microphone → MacBook Microphone** so you can narrate live.
5. Click **Record**. Count two seconds. Run the §3 route with the mouse — drag a frame
   slot to reorder, or tap it out and back in; both work.
6. Stop with the **⏹ icon in the menu bar**. **Edit → Trim** to cut the ends, **File →
   Export As → 1080p**, save to the Desktop.
7. Game audio does not reach a screen recording without a loopback device; your
   narration is the soundtrack. That is fine.

**After either route**

- Upload to **YouTube** as **Unlisted** (or Vimeo). Copy the link.
- itch: **Edit game → Details → Video or trailer** → paste the link → Save.
- Submission form: paste the same link, plus the playable link(s) from §6.

## 5. How to play — the blurb for the itch page and the form

> **ASTO — This is to that.** Sixteen tiles hide four analogies: *A is to B as C is to D*.
> Tap four tiles **in order**, then Confirm. Right words in the wrong order is *"So close!"*
> — it keeps your four in the frame and costs one coffee bean. Four beans, four mistakes.
> **Hint** tints a whole set; **Vocab** defines a hard word; turn on **Learning Mode** in
> Settings and Vocab defines any tile you tap. One new board a day; every past day is
> open in Past Pours. New here? *How to play* on the title screen runs a coached warm-up.

## 6. The itch build — a decision for Max

`dist/asto-itch-2026-09-07.zip` is built and verified clean (94 files, 481 KB). The itch
page still serves the **2026-08-25** upload, which predates sound, the Settings screen, the
survey receipts and Learning Mode. Two honest options:

1. **Re-upload the zip** (itch.io → Uploads → replace; tick *played in the browser*,
   viewport 480 × 800, *Mobile friendly*, *Fullscreen button*). Then the graded
   click-and-play link carries the Sept-1-to-Sept-8 improvement. **Recommended** — the
   improvement requirement is judged on the build they open.
2. **Submit www.playasto.com as the link** and leave itch frozen. The class asked for
   itch "ideally"; a web link satisfies "click and play."

Either way, submit both links if the form allows it.

## 7. Submission checklist

| Item | Ready? | Where |
| --- | --- | --- |
| Click-and-play link | ✅ | https://www.playasto.com — plus the itch page, current only after a re-upload (§6) |
| How-to-play | ✅ | In-game warm-up; `README.md` §How to play; the blurb in §5 |
| Gameplay video, 2–3 min | ✅ recorded on the iPhone; light cut 3:59 in the submission zip | §3 route, §4 setup |
| "What improved since Sept 1" | ✅ | *A Settings screen with real switches for sound and Learning Mode; Learning Mode itself — Vocab now defines any tile, with sixteen authored definitions on every board; the end-screen survey rows turn into receipts; and the itch build now carries sound.* |
| Development documents | — | Not required for the final submission (they went in on Sept 1) |

## 8. What was verified, and how

Full route driven in the browser at 375×812 from a cleared profile, one screenshot per beat,
every quoted string read from the DOM: deep link → board · green solve · Vocab greys after
its set is solved · so-close keeps the frame and spends one bean · slot tap-out compresses
the order · reorder → *Correct!* · Hint tints the red set · Back → calendar → Settings →
Learning mode switch On (stored) → the Sept 5 day card → **Play resumes the same board** ·
Vocab arms (dashed rings, `aria-pressed`) · tapping *stent* defines and does not select · red
and black solves · win screen, confetti, the four cards with explanations · Difficulty 3 →
receipt (the Supabase post was intercepted, no test row written) · calendar cell 5 carries
the cup and the book badge · statistics page · title screen · How to play's first coach
card · About page copy. `npm test` 1705/0 after the README edit. `npm run itch` verified.
