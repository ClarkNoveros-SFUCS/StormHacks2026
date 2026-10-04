# UI map

The screens and what each one shows and does. The **visual style** lives in `docs/design/design-system.md` (the two worlds: site and Mode screens) and `docs/design/modes/<mode>.md` (one per Game Mode); this file is only about structure and content. Spec of record for the new routes: `docs/worklog/aaf1007/overnight-decisions.md` §2, §5–7, §9–10.

Site pages (landing, home, Explore, Daily, social, Modules) share one look. The Game page frame belongs to the site, but its stats block, the Run and the Reveal belong to the Game's Mode (`game-modes.md`); the Run and Reveal sections below describe **Dive**.

```
/                                  Landing (signed out) · signed in → /home
├── /home                          Dashboard
├── /explore                       Course catalogue                       (public)
│   └── /explore/[course]          Course page: Topic timeline            (public)
│       └── /explore/[course]/[topic]   Topic: reading + Practice Games   (reading public, play signed in)
├── /daily                         Daily Dive hub
├── /leaderboard                   Leaderboards (Daily, Weekly XP, Course; Global / Friends)
├── /friends                       Friends, requests, search
├── /profile                       → /u/[me]
├── /u/[username]                  Public profile
├── /modules                       Modules list
│   └── /modules/[moduleId]        Module page: Files (+ file viewer) + Games
│       └── /games/[gameId]        Game page: progress + Play
│           └── /runs/[runId]      Run (play screen, the Mode's theme)
│               └── /runs/[runId]/reveal   Reveal (results)
└── /styleguide                    Every component + the Dive playground  (dev only)
```

**Auth.** Public routes: `/` (landing), `/explore`, `/explore/[course]` and Topic readings (decision Q24: playing needs sign-in), `/sign-in`, `/sign-up` (Clerk's pages). Every other route is protected at the top of its page (`requirePlayer()`) or route handler (`getApiPlayer()`), both in `lib/auth.ts`. A signed-in user visiting `/` is redirected to `/home`.

**Dev auth bypass.** When `DEV_PLAYER_ID` is set **and** `NODE_ENV === 'development'`, `requirePlayer()` / `getApiPlayer()` return that id before calling Clerk (and upsert the `players` row as usual), so agents can render signed-in pages without a session. It's a no-op in production builds. Set it only in a worktree's `.env.local`.

**Nav (signed in).** Logo · Explore · My Modules · Daily · Leaderboard — right: streak flame + count, XP/level chip, mute toggle, avatar menu (Profile, Friends, My Modules, Sign out). Signed out: Explore, Daily, Sign in, "Start playing". On mobile the links collapse into a bottom menu sheet. Built in F19 (#32): `components/site/`.

## `/`: Landing (signed out) · F19 (#32)

No invented stats or testimonials. In order:
1. **Hero:** animated pixel sky-and-ocean scene with cursor parallax (it turns into ocean as you scroll), the Logo, the tagline "Turn your notes into games. Rarer answers sink deeper.", primary `Start playing — it's free` (sign up), secondary `Try today's Daily Dive`, and the floating mascot.
2. **How it works:** Upload your slides → Pick a Game Mode → Play and remember, each with a pixel illustration.
3. **Game Modes:** a `ModeTile` per Mode with its looping mini-scene and one-liner.
4. **Learn something new:** the Python Basics course card (links to `/explore`).
5. **The Daily Dive:** today's first Prompt as a teaser, plus the share grid.
6. **Why it sticks:** active recall, spaced repetition, every answer comes from your notes (Evidence).
7. **Social:** streaks, friends, leaderboards, a heatmap preview.
8. Footer CTA and footer (StormHacks 2026, Tiger Data, Gemini, Clerk credits).

## `/home`: Dashboard · F19 (#32)

- Greeting with the mascot and a speech bubble (streak reminder, level-up, or a nudge).
- **Jump back in:** a big banner card for the last-played Game or Topic with a progress bar.
- **Daily Dive card:** today's status (play / your result), countdown, streak.
- **Continue:** cards for in-progress Courses and recent Modules.
- Sidebar (stacks below on mobile): `ProfileCard`, friends' activity, a leaderboard snippet.

## `/explore`, `/explore/[course]`, `/explore/[course]/[topic]` · F27 (#40)

- **`/explore`:** course catalogue: cards with a pixel banner, level chip, Topic count and your progress; "coming soon" locked cards (e.g. SQL Basics, Data Structures).
- **`/explore/[course]`:** banner hero (level chip, title, description, CTA), a numbered Topic timeline (vertical line, circled numbers) with accordions listing each Topic's Practice Games and their pass bars; locked Topics show a lock until the previous one is passed. Sidebar: `ProfileCard` mini, course progress, badges.
- **`/explore/[course]/[topic]`:** the reading (markdown, code blocks) on the left with an optional "mark as read" (+20 XP, gates nothing), the learning resources (links), and a **Practice** panel with a `ModeTile` per Game (Dive, Apogee, Leap, Pairs, Blitz), the pass bar, your best result, and "Next topic" once passed. Passing plays a pixel burst, +150 XP, the Topic badge and the next Topic's unlock animation.

## `/daily`: Daily Dive hub · F28 (#41)

Built in F28 (`app/daily/`, shared pieces in `components/daily/`). Public: signed out it shows the puzzle, board and archive, and play buttons open Clerk's sign-in modal.
- **Hero:** a pixel ocean at dawn (`DawnScene`: posterized sky, rising sun, drifting clouds, birds, the dive boat, a shimmering sun road, cursor parallax), the day number huge in VT323 with the chromatic shadow, theme and title, players today, and Lumen with a line for your state (`lumenLine`).
- **Today's puzzle card** (Dive look): `PROMPT 1 OF 7` teaser, the Tier legend, then by status: `▼ DIVE IN ▼` (`POST /api/daily/today/run` → `/runs/[id]`), `▼ RESUME DIVE ▼`, or your counted result: depth (Odometer), tier squares, rank, "better than X%", score, the share text with **Share** (clipboard + toast + burst; on failure the toast shows the text), See your catch, Practice dive.
- **Sidebar:** split-flap countdown to the next Vancouver midnight (`FlipClock`, server clock offset, refreshes the page at 0), your Daily streak with `StreakFlame`, how it works.
- **Today's leaderboard** (Global / Friends, top 10 + your row, depth and finish time), link to `/leaderboard?tab=daily`.
- **Archive:** every live day newest first with your counted squares and depth or best practice; past days play as practice (`POST /api/games/[gameId]/runs`).
- Plays through the normal Dive Run and Reveal screens.

## `/leaderboard`, `/friends`, `/u/[username]`, `/profile` · F26 (#39)

- **`/leaderboard`:** tabs **Daily Dive (today)**, **Weekly XP**, **Courses** (Topic passes), deep-linkable with `?tab=`; scope toggle **Global / Friends**. A pixel podium for the top 3 (trophies, confetti on hover), then rows (avatar, @username, Rank, Level, value) that FLIP to their new place on a scope switch; your row is highlighted, and pinned at the bottom when you're outside the top 50. Weekly shows the reset countdown (Monday 00:00 Vancouver), Daily the next-Daily countdown. The Daily tab uses today's puzzle (`getDailyPuzzle`, wired in F28); with no puzzle today it says "Daily Dive arrives soon" (`app/leaderboard/daily.ts`).
- **`/friends`:** tabs **Friends** (cards: avatar, Level, Rank, streak flame, unfriend), **Requests** (incoming Accept/Decline, sent Cancel), **Find** (debounced username search with Add buttons); `?tab=` deep links. No chat. Lumen empty states.
- **`/u/[username]`:** animated pixel banner (ocean / space / sky, chosen in Edit profile, default from the username), round avatar overlapping it (`PixelAvatar` or the Clerk photo, Q17), display name, Level, Rank, `@username`, joined date, friend / run / topic counts and a Modules **count**; the friend button (or **Edit profile** on your own: display name, username with live availability, bio, avatar picker, photo toggle, banner). Main column: activity **Heatmap** (53 weeks, tooltips, streaks), **Bests** per Mode on public Games, **Courses** progress with Topic badges, **Recent activity**. Sidebar: the stats card (Total XP, Rank, Badges, Day streak, Level bar) and the **Badges** grid (earned glow and flip; locked show how to earn). Never Module content (Modules, files and Module Games stay private).
- **`/profile`:** redirects to `/u/[your username]` (after `ensureProfile`).

## `/modules`: Modules list · F08

- One card per Module: a pixel banner (page stack grows with its files, a flag per Mode), name, file count, Game count, Mode badges, best result (in that Game's Mode's words), last played.
- "+ New Module" unfolds a name field in place, creates the Module (server action), and opens it.
- Empty state: the mascot and "Create a Module for each subject you're studying."

## `/modules/[moduleId]`: Module page · F08

Two panels side by side; stacked on mobile.

**Files panel**
- Drop zone and file picker: PDF, PPTX, DOCX, ≤ 25 MB, ≤ 100 pages.
- One row per Source Document: filename, page count, a `StatusPill` (`Uploading`, `Parsing…`, `Ready`, `Failed` with its error message; the Player deletes it and uploads again), and **"Used by N Games"**.
- Delete is disabled while the file is used, with a tooltip: "Used by Graphs Midterm, Week 9 Drill. Delete those Games first."
- **File viewer:** clicking a Ready file (or a Game's file chip) opens a large panel (full screen on mobile) labelled **"Parsed text of your file (the original isn't stored)"**: a page list on the left (page number + first heading; a scrolling strip on mobile), the selected page's rendered markdown on the right, a search box that highlights matches, counts them per page and jumps between matching pages (Enter / Shift+Enter), and ←/→ between pages. The original file isn't stored (ADR-0003), so it shows the parsed text. Data: `GET /api/documents/[documentId]/pages` (owner only) → `{ document: { id, filename, pageCount }, pages: { pageNumber, contentMd }[] }`. Deep link: `/modules/[moduleId]?doc=<documentId>&page=<n>` opens the viewer on that page (the URL follows the open page); `/modules/files/<documentId>?page=<n>` redirects there when only the file is known (Evidence).

**Games panel**
- One card per Game: title, a `ModeBadge`, status (`Generating…`, `Ready`, `Failed`), **chips naming the files it was built from**, Personal Best, a Mastery bar, and a **Play** button in the Mode's wording.
- "New Game" opens a dialog: first the **Game Mode tiles** (Dive, Apogee, Leap, Pairs, Blitz; Arena locked "coming soon"; Dive preselected; each with its mini-scene, name, tagline and rules one-liner, plus the selected Mode's rules and Prompt kinds), then a title field (defaults to "Module · Mode"), a checkbox list of this Module's **Ready** files (at least one; a gentle hint when the pages look too few for the Mode, never blocking), and Create. The Game appears immediately as `Generating…`.
- Hovering a file chip highlights that file in the Files panel, and the reverse.

## `/games/[gameId]`: Game page · F11 (#11)

Signed in. Your own Game (any status) or any public Game (Course practice, Daily); otherwise 404.
- Site frame: back link (Module, or the Topic page for a Course Game), a **hero band** in the Mode's world (Dive: ocean surface with the boat; Apogee: launch pad at dusk; Leap: sky islands; Pairs: card table; Blitz: neon), the `ModeBadge`, title, tagline, prompt count, created date, and source file chips linking to `/modules/[moduleId]?doc=<id>` (private Games only).
- The Mode's stats panel, in its theme (`components/modes/<mode>/GameStats.tsx`):
  - Dive: **Personal Best** (`−1,200 M`), **Mastery** (percentage + `Meter`), `FOUND` per Tier (`SHALLOWS 9/11` …).
  - Apogee: best altitude in km, Mastery, per-band `REACHED` (Troposphere → Deep Space).
  - Leap: best score, best streak, Hearts left on the best climb, Mastery. Pairs: best score, best time (both Boards), Mastery. Blitz: best score, best combo, Mastery.
- Course practice Games: the pass bar, Passed/Locked chips.
- The Mode's **Play** button (Dive `▼ BEGIN DESCENT ▼`, Apogee `LAUNCH`, Leap `JUMP IN`, Pairs `START MATCHING`, Blitz `GO`): unlocks audio, plays the hero's take-off, creates a Run and navigates to `/runs/[runId]`. 403 (locked Topic): "Pass the previous Topic first" with a link to it. 409: the server's message.
- Lumen (the mascot) comments on your progress; recent Runs (number, date, score in the Mode's words, the Mode's ending, link to each Reveal).
- Charts: your scores over time (Personal Best marked) or their spread (your latest marked), and accuracy per Vancouver day from the `player_game_daily` continuous aggregate.
- Generating: the mascot and a pulsing pill; the page polls `GET /api/games/[id]` and refreshes when it settles. Failed: the error and a link back to the Module.

## `/runs/[runId]`: Run (Dive) · F09 (#9)

Layout and motion: `docs/design/modes/dive.md` §5–6 (Krillion positions, real descent).
- HUD row: depth, progress squares + `PROMPT n OF 7`, score. Menu tile top left, mute tile top right. Depth ruler with `YOU ◀` on the right edge.
- The prompt card under the waterline (at the start) with `▼ rarer answers sink deeper ▼`.
- Input, depending on the Prompt kind:
  - Typed (open, cloze, definition): one text box. Enter submits and the box clears. A wrong guess shakes the box and shows −3 s.
  - Odd-one-out: 4 option buttons, one tap.
  - Put-in-order: draggable list plus `LOCK IN`.
- **Hint** button on single-answer Prompts that have a Hint: reveals the clue inline, shows the Tier drop (e.g. "Abyss → Reef"), used once.
- On a correct answer: the chip sinks past the tier lines, the camera descends 10 m per point, then the **catch screen** (creature, tier, the answer, `+60 PTS · sink 600m`, a verdict) with `DESCEND ▼` (Enter, or auto after ~6 s). The clock is paused: the client calls `start-prompt` for the next Prompt only after DESCEND.
- On a timeout: "Time!", then the next Prompt.
- The clock starts only after the Prompt is on screen (the client calls `start-prompt` after the entry transition).
- Reloading mid-Run resumes from the server state. A finished Run redirects to its Reveal; an abandoned one shows a stop screen.
- Other Modes dispatch in `app/runs/[runId]/mode-screens.tsx` (placeholders until F24/F25).

## `/runs/new?game=<gameId>`: launch beat · F09 (#9)

The ocean at the surface with the Game's title and the Mode's Play button (`▼ BEGIN DESCENT ▼`). Pressing it unlocks sound, creates the Run and opens `/runs/[runId]`.

## `/runs/[runId]/reveal`: Reveal (Dive) · F09 (#9)

A results column scrolling over the sea from your final depth (`dive.md` §7):
- `DIVE #N COMPLETE`, the score with the depth beside it, **New Personal Best!** when it applies, Mastery before → after.
- Distribution chart: your past Runs (private Games) or today's players (public Games).
- Dive log, The Bearing.
- **The Catch**, one section per Prompt:
  - your answer and points (with Staleness/Hint notes)
  - **Open Prompts:** every Answer grouped by Tier (rarest first), found ones ticked, tier filters and search, each with "📄 Week 9 slides · p.41" and the Evidence quote (links into the file viewer)
  - **Single-answer Prompts:** the correct Answer, the explanation and the Evidence page
- Buttons: Dive again, Back to Game.
- **Daily Dive Runs** (`reveal.daily` / `reveal.crowd`, F28): title `DAILY #N COMPLETE`; a Daily block under the header (title, `✓ COUNTED` or `PRACTICE`, tier squares, Share); the distribution is today's counted players (histogram buckets, YOU marked, "BETTER THAN X% OF TODAY'S PLAYERS", players and median); each Answer in The Catch shows "% found" by today's players; buttons become "See today's leaderboard" (`/daily#leaderboard`; a past day: back to the archive) and "Practice dive"; Back goes to `/daily`. No Personal Best or Mastery block; Evidence is plain text (the fact sheet's Module is the system's). Confetti once on a fresh counted Reveal.
- **Course practice Games:** when `reveal.topic` is set, Back goes to the Topic page, and `topic.passedNow` triggers the Topic-pass moment (pixel burst, +150 XP, the Topic Badge, then the next Topic's unlock animation when `topic.unlockedNext`; Course Badge when `topic.courseFinished`) (Q27).

## `/explore`, `/explore/[course]`, `/explore/[course]/[topic]`: Courses (F22 backend, F27 UI)

All three are public (Q24): signed out they render without progress and the Play buttons ask to sign in. Data and shapes: [`courses.md`](./courses.md) § API.

- **`/explore`** (`GET /api/courses`): a card per Course with banner, level chip, topic count, minutes, Modes and, signed in, progress (`passed / total`, Continue → `nextTopicSlug`).
- **`/explore/[course]`** (`GET /api/courses/[slug]`): banner hero (title, level, description, CTA to the next Topic), numbered Topic timeline (each Topic: number, title, summary, minutes, Mode icons, state locked / unlocked / passed and read), sidebar with progress and the Topic and Course Badges (`badgeInfo(badgeId)`).
- **`/explore/[course]/[topic]`** (`GET /api/courses/[slug]/topics/[topicSlug]`): the reading page by page (markdown with code blocks) with an optional **Mark as read** (`POST …/read`, +20 XP, gates nothing); resources (title, source, link); a **Practice** panel with one tile per Mode (pass bar text, your best and a passed tick), and Play → `POST /api/games/[gameId]/runs` (403 = locked: show "Pass Topic N−1 first"); prev/next Topic links, "Next topic" highlighted once passed.

## `/styleguide` (dev only) · F10 (#10)

Every design-system component with its states, plus a **Dive playground** that runs a fake 7-Prompt Dive client-side (no API) through the full descent and catch flow. Returns `notFound()` when `NODE_ENV === 'production'`.
