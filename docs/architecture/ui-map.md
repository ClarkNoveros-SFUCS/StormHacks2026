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

- Today's puzzle card: Daily number, play button (signed in, one counted Run per day) or your result with the share text (`SYLLABYSS Daily #12 · −1,400 m` + tier squares, copy to clipboard).
- Flip-clock countdown to the next Daily (America/Vancouver midnight), your streak.
- Today's leaderboard (Global / Friends): score desc, then finish time asc; rows animate rank changes.
- Archive of past days, playable as practice (doesn't count).
- Plays through the normal Dive Run and Reveal screens.

## `/leaderboard`, `/friends`, `/u/[username]`, `/profile` · F26 (#39)

- **`/leaderboard`:** tabs **Daily Dive (today)**, **Weekly XP**, **Course** (Topic passes); scopes **Global / Friends**; your row is pinned and highlighted.
- **`/friends`:** your friends, incoming/outgoing requests (accept, decline, cancel), remove, and a username search with Add buttons. No chat.
- **`/u/[username]`:** banner, `PixelAvatar` (or the Clerk photo if the Player chose it), display name, `@username`, joined date, friend button, the `ProfileCard` stats (level, total XP, rank, badges, day streak), the activity **Heatmap** (last 52 weeks), per-Mode bests on public Games, the badge grid, and a Modules **count** (never Module content: Modules, files and Module Games stay private). On your own profile the card's **Edit** opens the avatar picker.
- **`/profile`:** redirects to `/u/[your username]`.

## `/modules`: Modules list · F08

- One card per Module: name, file count, Game count, last played.
- "New Module" asks for a name, creates the Module, and opens it.
- Empty state: the mascot and "Create a Module for each subject you're studying."

## `/modules/[moduleId]`: Module page · F08

Two panels side by side; stacked on mobile.

**Files panel**
- Drop zone and file picker: PDF, PPTX, DOCX, ≤ 25 MB, ≤ 100 pages.
- One row per Source Document: filename, page count, a `StatusPill` (`Uploading`, `Parsing…`, `Ready`, `Failed` with its error message; the Player deletes it and uploads again), and **"Used by N Games"**.
- Delete is disabled while the file is used, with a tooltip: "Used by Graphs Midterm, Week 9 Drill. Delete those Games first."
- **File viewer:** clicking a Ready file opens a drawer (full screen on mobile) labelled **"Parsed text of your file"**: a page list on the left, the selected page's rendered markdown on the right, and a search box that filters pages and highlights matches. The original file isn't stored (ADR-0003), so it shows the parsed text. Data: `GET /api/documents/[documentId]/pages` (owner only) → `{ pageNumber, contentMd }[]`. Evidence links in the Reveal deep-link here with `?doc=<documentId>&page=<n>`, which opens the viewer on that page.

**Games panel**
- One card per Game: title, a `ModeBadge`, status (`Generating…`, `Ready`, `Failed`), **chips naming the files it was built from**, Personal Best, a Mastery bar, and a **Play** button in the Mode's wording.
- "New Game" opens a dialog: first the **Game Mode tiles** (Dive, Apogee, Leap, Pairs, Blitz; Dive preselected; each with icon, name, tagline, kinds, rules one-liner), then a title field, a checkbox list of this Module's **Ready** files (at least one), and Create. The Game appears immediately as `Generating…`.
- Hovering a file chip highlights that file in the Files panel, and the reverse.

## `/games/[gameId]`: Game page · F11 (#11)

- Site frame: title, the `ModeBadge`, source file chips, created date, recent Runs (date, score in the Mode's metaphor, link to each Reveal).
- The Mode's stats block, in the Mode's theme. Dive: **Personal Best** (`−1,200 M`), **Mastery** (percentage + `Meter`), per-Tier found counts.
- The Mode's **Play** button (Dive: `▼ BEGIN DESCENT ▼`), which creates a Run and navigates to `/runs/[runId]`.
- Optional: the accuracy-over-time chart from the continuous aggregate (`data-model.md`).

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

## `/styleguide` (dev only) · F10 (#10)

Every design-system component with its states, plus a **Dive playground** that runs a fake 7-Prompt Dive client-side (no API) through the full descent and catch flow. Returns `notFound()` when `NODE_ENV === 'production'`.
