# Overnight build: decisions (2026-10-04)

Anton asked for an overnight build (`overnight-orchestrator.md` plus a long list of extras) and went to sleep. Phase 0 of the orchestrator ("grill me") couldn't happen interactively, so **every question I would have asked is answered here with a default**. Anything marked **CHECK** is a guess Anton should confirm in the morning. Subagents: treat this file as the spec of record for the new direction until `docs/design/design-system.md` is rewritten (U1 does that).

Reference images Anton attached (on his Desktop):
- `~/Desktop/Screenshot 2026-10-04 at 1.03.10 AM.png`: Krillion Run screen (prompt)
- `~/Desktop/Screenshot 2026-10-04 at 1.04.30 AM.png`: Krillion "catch" screen after a correct answer
- `~/Desktop/Screenshot 2026-10-04 at 1.05.29 AM.png`: Krillion results screen
- `~/Desktop/Screenshot 2026-10-04 at 1.02.27 AM.png`: our Apogee space variant (`inspo/krillion-space-variant/apogee.html`)
- Codedex (codedex.io): studied live, see §2. The Codedex screenshot and the "add this to the profile" screenshot weren't saved to disk. **CHECK:** the profile one is assumed to be an activity heatmap (GitHub/Codedex style) with streak, XP and badges.

---

## 1. Two visual worlds

| World | Where | Feel |
|---|---|---|
| **Site** (the "house") | landing, home dashboard, Explore, Course and Topic pages, Modules, Module page, Game page, Profile, Friends, Leaderboards, Daily hub | **Codedex-like**: dark night-navy, pixel-font headings, clean sans body, rounded-but-chunky cards, yellow pixel CTA buttons, pixel-art banners and sprites, XP/levels/streaks/badges. "Pixel, but not fully." Polished, animated, delightful. |
| **Mode screens** | `/runs/[id]` and `/runs/[id]/reveal` (and the Mode's stats on the Game page) | each Game Mode owns its look. **Dive keeps the Krillion spec** (`docs/design/modes/dive.md`, VT323, CRT, two-ring pixel borders), re-laid-out to match Krillion's positions (§3). Apogee, Leap and Pairs get their own themes (§4). |

So the old design system splits: the Krillion recipes (VT323 everywhere, CRT stage, no border-radius) become **Dive's theme**, and the site gets a new Codedex-style shell. Keep the Mode/theme mechanism (`data-theme`), the motion vocabulary and the accessibility rules.

## 2. Site design (Codedex-inspired, our own)

Studied codedex.io live (home dashboard, `/python` course page, profile). What we borrow vs. make our own:

| Borrow | Make our own |
|---|---|
| Near-black navy background, slightly lighter card surfaces with a 1 px cool-grey border and ~8–10 px radius | Our palette accents (coral/pink, cyan, gold, violet) instead of their yellow-only branding; the yellow CTA stays as our primary button |
| Pixel display font for headings and buttons, clean sans for body | Our own pixel-art banners/scenes (drawn in SVG/canvas with `shape-rendering: crispEdges`, no copied art) |
| Pixel "stepped" buttons with a hard 3–4 px bottom drop | Ocean/space/sky themed illustrations tied to our Modes |
| Course page: banner hero with level chip, title, description, CTA; numbered chapter timeline (vertical line, circled numbers) with accordions listing exercises and Start buttons; right sidebar with profile mini-card, course progress, badges | Topics end in a **game** (active recall) instead of a code exercise |
| Signed-in home: greeting with mascot speech bubble, "Jump back in" big banner card with progress bar, "Continue progress" cards, right sidebar profile card (level, total XP, rank, badges, day streak) | Daily Dive card, friends' activity, leaderboard snippet |
| Profile: banner, avatar, name, @username, joined date, followers/following, tabs, sidebar stats and badges | Activity **heatmap** (TimescaleDB), per-Mode bests, Modules count (never Module content) |

**Tokens (site):**
```
--bg #0a0d1c   --bg-2 #0f1326   --surface #141a33   --surface-2 #1b2242   --border #2a3358   --border-strong #3b4675
--text #eef2ff --muted #9aa6c8   --faint #6b7699
--primary #ffd84d (yellow CTA, text #1a1405, drop #b8941f)
--accent #ff5d8f  --signal #4de3ff  --reward #ffd166  --violet #9d7bff  --success #3ddc97  --danger #ff5c5c  --caution #ff9f43
radius: --r-sm 6px, --r 10px, --r-lg 16px
```
**Type:** headings and buttons in **Pixelify Sans** (Google Fonts, pixel style that still reads well, has lowercase); body in **Mulish**; **VT323** stays for game HUDs and big numbers (Dive). Load with `next/font/google`.

**Motion and interaction (site):** card hover lift (translateY −3 px + border brightens + soft glow), pressable pixel buttons (drop shrinks on `:active`), staggered `rise-in` on lists, count-up numbers, animated streak flame, XP bar fill with shine sweep, confetti/pixel burst on level-up and Topic pass, parallax pixel clouds/stars on the landing hero, a floating mascot that blinks, marquee of Mode tiles on landing, smooth page transitions (fade + rise). All of it off under `prefers-reduced-motion`.

**Theme:** dark only for now (Codedex is dark). **CHECK:** light mode deferred.
**Accessibility:** focus ring `2px solid var(--signal)` offset 3 px; body ≥ 15 px; contrast ≥ 4.5:1 for body text; bands/tiers never colour-only; keyboard reachable everything; `aria-live` for game timers per the existing spec.
**Mobile:** every site page works at 375 px wide (16 px gutters, sidebars stack under main content, nav collapses to a menu sheet). Game screens are playable on mobile (input docks at the bottom).

**Nav (signed in):** Logo · Explore · My Modules · Daily · Leaderboard — right side: streak flame + count, XP/level chip, mute toggle, avatar (Clerk `UserButton` menu with links to Profile and Friends).

**Signed-in `/`:** now redirects to **`/home`** (dashboard), not `/modules`. **CHECK.**

**Product name:** keep the working title **SYLLABYSS** (logo with the chromatic shadow). **CHECK**: it reads ocean-only now that there are space/sky Modes; easy to change (`<Logo>` + metadata).

**Mascot:** the pixel anglerfish stays the site mascot (lantern = "light in the deep"). Each Mode can have its own sprite (Apogee: rocket; Leap: a pixel hopper).

## 3. Dive (Krillion) — layout and real diving

Keep `docs/design/modes/dive.md` (tiers Shallows/Reef/Abyss/Trench, depth = 10 m per point, words, sounds, Reveal sections). **Change the layout to Krillion's positions** (screenshots above):

**Run screen**
- **Top HUD, three pixel plates in a centred row:** `DEPTH 0m` plate (cyan) left of centre, progress squares + `PROMPT 1 OF 7` in the middle, `SCORE 0` plate (pink) right of centre.
- **Menu tile top-left, mute tile top-right** (below the HUD row, at the side margins).
- **Scene:** at the start of a Run the camera is at the surface: sky in the top ~25%, the pixel boat on the waterline. The **prompt card sits centred just under the waterline**, with `PROMPT 1 OF 7` in pink tracking, the prompt in big VT323, and `▼ rarer answers sink deeper ▼` under it.
- **Depth ruler on the right edge:** a vertical tick ruler with labels (`-100m`, `-200m`, …) and a pink **`YOU ◀`** marker at your current depth. The ruler scrolls as you descend.
- **Mascot** wanders on the left side of the water, idle-bobbing and blowing bubbles; fish silhouettes drift past.
- **Bottom dock centred:** round sonar timer (digits in the middle, sweep), the wide input (`type one answer…`) with the **fuse bar right under it**, and the `DIVE` button on the right. Hint button sits under/next to the dock for single-answer Prompts.
- **Catch screen (after a correct answer, Krillion image 3):** the prompt card fades, and centred on the dark water: the tier's pixel creature icon (glowing), the tier name big (`TRENCH` in band colour), the answer in quotes, `+60 PTS · sink 600m`, and a one-line flavour verdict ("Genuinely uncommon. Nice pull."). A `DESCEND ▼` primary button at the bottom continues (Enter also continues; auto-continue after ~6 s).

**Real diving (missing from the mock today):** depth is a real camera position. Every point scored moves the camera down 10 m in world space; the scene is a tall world (surface → sunlit → twilight → midnight → abyss → trench) whose colour, light rays, marine snow, creature types (fish schools, jellyfish, anglerfish, giant squid silhouette) and ruler labels change with depth. Scoring animates a smooth descent (spring) — the waterline and boat scroll up out of view on the first catch, the YOU marker slides down the ruler, bubbles stream up. Between Prompts the camera stays at your depth (the sea stays dark at depth). The Reveal starts at your final depth and the results column scrolls over the sea (Krillion image 4), with the boat silhouette and dusk sky visible when scrolled to the top.

**Reveal (Krillion image 4):** centred column: small logo + `DIVE #N COMPLETE` right-aligned; big score with depth beside it in cyan; a **distribution chart** — for Module Games: a curve of your own past Run scores with `YOU` marked (and Personal Best); for the Daily Dive and Course games: "better than X% of today's players" from real crowd data (TimescaleDB, §7); the `DIVE LOG · deeper = rarer` chart (per-prompt droplines with creature icons); `THE BEARING` band table; then `THE CATCH` per-prompt list (unchanged spec); buttons `▼ DIVE AGAIN ▼` and `BACK`. Menu/mute/settings tiles top-right.

The mock in `docs/design/mock/` must be updated to this layout **with working descent logic** (U1).

## 4. Game Modes

Verified state today: `games.mode` exists but `CHECK (mode IN ('dive'))`, `MODES` has only `dive`, generation and the run engine are Dive-only. The overnight work makes the pipeline genuinely multi-Mode:

| Mode | Id | Plays like | Prompt kinds | Rules (default) | Look |
|---|---|---|---|---|---|
| **Dive** | `dive` | Krillion | open, cloze, definition_to_term, ordered_recall, odd_one_out | unchanged (7 × 25 s, −3 s per wrong guess, Tiers, Staleness) | ocean, Krillion layout (§3) |
| **Apogee** | `apogee` | Krillion in space (inspo/krillion-space-variant) | same as Dive | **same rules and scoring as Dive** (shares Dive's rules module); score shown as altitude (km), Tiers renamed for altitude (e.g. Troposphere / Orbit / Lunar / Deep space — the subagent picks names that fit the inspo) | three.js rocket launch, port of `apogee.html` |
| **Leap** | `leap` | StudyFetch-style jumper: answer right and your avatar jumps to the next platform | **new `multiple_choice`** kind (stem, 4 options, 1 correct, explanation, Evidence) | 10 Prompts, 15 s each, one try each; correct = 100 + speed bonus (up to +50) × streak multiplier (1, 1.5, 2 at 3+/5+ in a row); wrong or timeout = platform crumbles, lose a heart; 3 hearts; 0 hearts ends the Run ("fell") | three.js: voxel/pixel hopper on floating sky-island platforms rising upward, parallax clouds |
| **Pairs** | `pairs` | match terms to definitions against the clock | `definition_to_term` (term ↔ definition) | 2 boards × 6 pairs, 60 s per board shared clock; correct match +50, mismatch −10 and 2 s; time bonus 5 pts per remaining second; one board at a time, server validates each pair | bright pixel card table, flip/snap animations |

Daily Dive (§7) is not a separate Mode: it's a public Dive Game.
Stretch if time allows: **Blitz** (60 s rapid true/false). Not committed.

**Generation per Mode:** each Mode declares the kinds it needs and its Gemini instructions/schema (`lib/modes/<mode>/generate.ts`); shared reading, common checks and writing stay shared (as `docs/architecture/game-modes.md` already describes). Apogee reuses Dive's generator. Leap needs MCQ generation (distractors must be plausible and come from the same notes; Evidence still required for the correct option). Pairs reuses definition_to_term generation but needs ≥ 12 pairs, so it asks for more definitions.
**One Game Mode per Game stays** (ADR-0004). A Course Topic offers several Games (one per Mode) built from the same Topic text.

**Mode picker:** New Game dialog shows 4 Mode tiles (icon, name, tagline, which kinds, rules one-liner), Dive preselected.

## 5. Explore and Courses (seeded learning paths)

New domain terms (add to `CONTEXT.md`):
- **Course**: a public, seeded learning path anyone can follow (first: **Python Basics**). Not owned by a Player.
- **Topic**: one step of a Course: a reading (markdown), learning resources (links), and Practice Games. Passing one Practice Game unlocks the next Topic.
- **Pass**: a Run on a Topic's Practice Game that meets that Mode's pass bar.

Python Basics (seeded, hand-written, accurate): 6 Topics — 1 Hello World & Syntax (print, comments, indentation), 2 Variables & Types (int/float/str/bool, type(), casting), 3 Operators & Expressions (arithmetic, comparison, logical, precedence, f-strings), 4 Control Flow (if/elif/else, truthiness), 5 Loops (for, range, while, break/continue), 6 Functions (def, params, return, scope). Each Topic: ~400–700 words of reading with code blocks, 3–4 real resource links (python.org docs/tutorial sections, W3Schools/Real Python pages that exist), and Practice Games in **Dive, Leap and Pairs** (Apogee optional) seeded with hand-written prompts covering the kinds each Mode needs.

**How it's stored:** Courses reuse Modules/Games. A system Player (`id = 'system'`) owns one Module per Course; each Topic's reading is a parsed Source Document (its pages are the reading), so **Evidence still points at real pages**. Games get `visibility = 'public'` so any signed-in Player can play them; Runs, guess_events, Personal Best and Mastery stay per Player. New tables: `courses`, `course_topics` (order, slug, title, summary, reading doc id, resources jsonb), `topic_games` (topic, game, mode, pass rule), `topic_progress` (player, topic, passed_at, best run). Seed: `npm run db:seed:courses` (idempotent).

**Pass bars (default):** Dive/Apogee: score ≥ 150 (−1,500 m). Leap: finish with ≥ 7 correct of 10. Pairs: clear both boards (all 12 pairs) within time. Topic 1 is unlocked; Topic N+1 unlocks when any Practice Game of Topic N is passed. Passing a Topic grants XP and a Topic badge; finishing the Course grants a Course badge.

**Pages:** `/explore` (course catalogue: cards with pixel banner, level chip, topic count, progress; plus "coming soon" locked cards for e.g. SQL Basics, Data Structures — **CHECK**), `/explore/[course]` (Codedex course page: banner hero, numbered Topic timeline with accordions, sidebar progress/badges), `/explore/[course]/[topic]` (reading on the left, resources, a "Practice" panel with Mode tiles, pass bar, best result, "Next topic" once passed).

## 6. Social: profiles, XP, streaks, friends, leaderboards

**Domain change (needs ADR-0005):** the app was strictly solo ("no leaderboard"). Now: **Modules, Source Documents and Module Games stay private**; what's shared is a public **Profile** (display name, username, avatar, level, XP, streak, badges, heatmap, per-Mode bests on public Games) and **leaderboards** on public Games (Daily Dive, Course Topics) and weekly XP. Personal Best and Mastery keep their meaning.

- **Players** get `username` (unique, from Clerk username or derived from the name/email local part, editable), `display_name`, `image_url` (from Clerk), `created_at`.
- **XP** (`xp_events` hypertable: player, at, amount, reason, ref): Run finished = `floor(score / 5)` capped at 200 per Run (min 5); Topic passed +150; Course finished +500; Daily Dive played +50, plus +5 × streak day (cap +50). **Level** from total XP: level n needs `50·n·(n+1)` total XP (L1 0, L2 100, L3 300, L4 600 …). **Rank** names by level (Plankton 1–2, Shrimp 3–4, Reef Fish 5–7, Dolphin 8–11, Orca 12–16, Leviathan 17+) — **CHECK** names.
- **Streak:** consecutive America/Vancouver days with ≥ 1 finished Run; today counts once played. Shown with a flame.
- **Heatmap:** last 52 weeks of activity per day (Runs finished + XP) from a TimescaleDB continuous aggregate (`player_activity_daily`, `time_bucket('1 day', at, 'America/Vancouver')`), GitHub-style grid with 5 intensity levels in our accent.
- **Badges** (computed, stored in `player_badges`): First Dive, 7-day streak, 30-day streak, Trench Diver (a rare Answer), Perfect Leap, Pairs Speedrun, Topic badges, Python Basics complete, Daily Top 10, etc.
- **Friends:** `friendships (requester, addressee, status pending|accepted, created_at, responded_at)`; add by username search or by visiting `/u/[username]`; accept/decline; remove. No chat.
- **Leaderboards** `/leaderboard`: tabs **Daily Dive (today)**, **Weekly XP**, **Course** (Topic passes); scopes **Global / Friends**. Built on continuous aggregates.
- **Pages:** `/profile` (redirects to `/u/[me]`), `/u/[username]`, `/friends` (list, requests, search).

## 7. Daily Dive (Wordle/Krillion daily)

- **What:** every day (America/Vancouver midnight) one **public Dive Game** of 7 education-trivia Prompts (mixed general knowledge: science, history, geography, literature, math, CS), the same Prompts and Answers for every Player. **One Run per Player per day**; replays are practice and don't count. Krillion-style: Open Prompts with Tiers so rarer correct Answers score more.
- **Where answers come from:** there are no uploaded files, so Gemini writes each puzzle plus a short **fact sheet** (one page per Prompt explaining the Answers). The fact sheet is stored as a system Source Document, so Answers still have Evidence and the Reveal can show it. A second Gemini call verifies Answers (drop unsupported ones).
- **How it's produced:** `npm run daily:generate -- --days 14` pre-generates future puzzles into a **pool** (status `scheduled` with a `day`), and a hand-written **seed pool** of ≥ 7 puzzles ships so it works with no Gemini key. At read time `getDailyGame(day)` returns that day's puzzle; if none is scheduled it claims the next unused pool puzzle for that day with `INSERT … ON CONFLICT (day) DO NOTHING` (race-safe). **Tiger Data showcase:** a TimescaleDB **user-defined action** (`add_job`) runs at Vancouver midnight to assign the day's puzzle in-database, plus the lazy path as a fallback.
- **Scoring/rarity:** Tiers are fixed at generation (ADR-0001 still holds). The **crowd** shows up only in the Reveal: score distribution of today's players ("better than X% of today's players", Krillion image 4) and a per-Answer "% of players found this" line, both from a continuous aggregate over the daily results hypertable.
- **Share:** Wordle-style share text: `SYLLABYSS Daily #12 · −1,400 m` plus a row of tier squares (🟦🟪🟨⬛) and a link; copy to clipboard.
- **Leaderboard:** today's Daily (global and friends): score desc, then finish time asc. Countdown to the next Daily.
- **Pages:** `/daily` (hub: today's puzzle card, play button or your result, countdown, streak, leaderboard, archive of past days as practice), plays through the normal Dive Run/Reveal screens.

## 8. Other Tiger Data features (answer to "what else can we use?")

Already used: Postgres, `guess_events` hypertable, `player_game_daily` continuous aggregate. Overnight additions:
1. **Hypertables** for `xp_events` and `daily_results` (time-series by nature).
2. **Continuous aggregates** for the activity heatmap, weekly XP leaderboard, daily score distribution and per-Answer find rates (real-time aggregates so fresh plays show immediately).
3. **Jobs / user-defined actions** (`add_job`) to assign the Daily puzzle at midnight.
4. **Compression / columnstore policy** on `guess_events` older than 30 days and a **retention policy** on raw `daily_results` beyond aggregates (**CHECK**: retention off by default; compression on).
5. **`time_bucket_gapfill`** for the heatmap (days with no activity → 0) and charts.
6. **pgvector + pgvectorscale** (F18, stretch) for retrieval-based Open Prompt answer expansion, and later "related Topics" recommendations.
7. **Hyperfunctions** (`percentile_agg`, `approx_percentile`) for "better than X% of today's players".

## 9. Landing page (signed out)

Inspired by StudyFetch Arcade's *content* (not its UI): hero, how it works, game modes, learning science, social proof → our version, Codedex/pixel styled:
1. **Hero:** animated pixel ocean-and-sky scene (parallax), the logo, tagline "Turn your notes into games. Rarer answers sink deeper.", primary CTA `Start playing — it's free` (sign up) and secondary `Try today's Daily Dive`, plus a floating mascot.
2. **How it works:** 3 steps (Upload your slides → Pick a Game Mode → Play and remember), each with a pixel illustration.
3. **Game Modes showcase:** a tile per Mode (Dive, Apogee, Leap, Pairs) with a looping mini-animation and its one-liner; hover plays it.
4. **Learn something new:** Explore teaser with the Python Basics course card.
5. **The Daily Dive:** a teaser of today's puzzle prompt (first Prompt only) and the share grid.
6. **Why it sticks:** active recall + spaced repetition + "every answer comes from your notes" (Evidence), with short copy (no fake stats).
7. **Social:** streaks, friends, leaderboards, profile heatmap preview.
8. **Footer CTA** and footer (StormHacks 2026, Tiger Data, Gemini, Clerk credits).
No invented statistics or testimonials.

## 10. Module page additions

- **View your uploaded files:** each file row opens a **file viewer**: a modal/drawer that shows the parsed pages (page list on the left, rendered markdown of the selected page on the right, search within the file). The original file isn't stored (ADR-0003), so we show the parsed text, labelled "Parsed text of your file". New route `GET /api/documents/[documentId]/pages` (owner only) returning `{ pageNumber, contentMd }[]`. Evidence links in the Reveal can deep-link into it (`?doc=&page=`).

## 11. Process decisions (orchestrator)

- **Parallel lanes instead of strictly one agent at a time.** The scope roughly tripled, so three lanes run concurrently in separate git worktrees: **P** (generation quality F14–F17), **A** (backend: Modes, Social, Courses, Daily), **U** (frontend). Each lane runs one agent at a time, stacks PRs where needed, and avoids touching another lane's in-flight files.
- **Shared dev DB:** migrations are **additive only** (new tables/columns, widened CHECKs), so `main` keeps working on the shared Tiger Cloud `stormhacks-dev`. Never drop/rename; never edit an applied migration.
- **Dev auth bypass for screenshots:** `lib/auth.ts` honours `DEV_PLAYER_ID` **only when `NODE_ENV === 'development'`**, so agents can render signed-in pages without typing passwords. It's a no-op in production builds. Set it only in worktree `.env.local` copies, never in Anton's own `.env.local`.
- **Gemini budget:** ≤ $1 for F14–F17 scorecards; ≤ $1 for Daily/Mode generation tests.
- **No PR merges, no pushes to main, no AI attribution.**

---

## 12. Anton's answers, round 1 (2026-10-04 ~02:50)

| Q | Decision |
|---|---|
| 1 | **3 parallel lanes** (P, A, U) in worktrees. Update `overnight-orchestrator.md` to match. |
| 2 | Priority: **UI and new features first**; F15–F17 may slip. |
| 3 | Name stays **SYLLABYSS**. |
| 4 | Signed-in `/` → **`/home`** dashboard. |
| 5 | Site look as in §2: dark only, Pixelify Sans + Mulish (VT323 inside Dive), yellow CTA, accent palette, 10 px radius cards. |
| 6 | Dive: the **chip sinks past the tier lines, then the Krillion catch screen** appears with `DESCEND ▼` (Enter continues, auto after ~6 s). The 25 s clock pauses during the catch screen. |
| 7 | Build **all of Dive, Apogee, Leap, Pairs and Blitz**. Very last, if time allows: a **three.js FPS study game**. |
| 8 | Social as in §6: Global + Friends leaderboards; profiles visible to any signed-in user. |
| 9 | Daily Dive = **Krillion-style typed open answers with Tiers**, one counted attempt per day, share grid. |
| 10 | Python Basics: 6 Topics, passing any one practice Game unlocks the next. |
| 11 | Ocean ranks (Plankton → Leviathan). |
| 12 | Profile gets **both**: the Codedex profile card (pixel avatar with **Edit**, Total XP, Rank, Badges, Day streak, **View profile**; image 7) **and** the activity heatmap. |
| 13 | File viewer shows **parsed text** page by page (no original-file storage). |
| 14 | Dev auth bypass OK; agents use Anton's player id `user_3KD852awCV88LswW9l5jkVyo4gB`. |
| 15 | Additive-only migrations on `stormhacks-dev`; **the morning summary must say exactly what Anton needs to do for `main`** (migrations to apply, env vars, seed commands, merge order). |
| 16 | Gemini budget for the night: **$5 total**. |

## 13. Anton's answers, round 2

| Q | Decision |
|---|---|
| 17 | **Pixel avatar by default** (picker of ~16 self-drawn pixel avatars via the card's **Edit**), with a toggle to use the Clerk photo instead. |
| 18 | **Leap:** 10 MCQ, 15 s each, one try; correct = jump + 100 + speed bonus (≤ 50) × streak multiplier (×1.5 at 3+, ×2 at 5+); wrong/timeout = platform crumbles, −1 heart; 3 hearts, 0 = "fell" (Run ends); **one 50/50 lifeline per Run** (removes 2 wrong options, halves that question's points). |
| 19 | **Pairs:** 2 boards × 6 pairs, 60 s per board; +50 per match, −10 and −2 s per mismatch, +5 per second left; **two columns** (terms left, definitions right, click one then the other), not memory-flip. |
| 20 | **Blitz:** 60 s rapid **true/false** from your notes; +10 per correct, ×2 combo after 5 in a row; wrong resets combo and costs 3 s. New Prompt kind `true_false` (statement, truth value, explanation, Evidence). Neon arcade look with a beat-synced pulse. |
| 21 | **Apogee:** score in km; tiers **Troposphere 10 · Orbit 25 · Lunar 60 · Deep Space 100**; play verb **LAUNCH**; results **MISSION REPORT**. Same rules as Dive. |
| 22 | **Arena (FPS, very last, only if time):** three.js first-person room; question on a floating board; 4 answer targets drift; shoot the right one; wrong shots cost time; reuses `multiple_choice`; pointer-lock + WASD, click-to-aim fallback on mobile. |
| 23 | **Daily Dive:** rotating mix (science, history, geography, literature, math, computing, art/music), high-school to first-year-university level, Vancouver midnight, Daily #1 = 2026-10-04. **Launch day (#1, 2026-10-04) is CS-themed.** |
| 24 | Signed out: `/explore` and Course/Topic readings are public; playing needs sign-in; landing shows today's Daily first Prompt as a teaser. |
| 25 | **Sounds synthesized with WebAudio** (no downloaded packs). |
| 26 | Push an **`overnight/demo`** branch merging all PR branches (demo only, never merged). |
| 27 | Topic pass: pixel burst + 150 XP + Topic badge + next Topic unlock animation. Reading has an optional **"mark as read"** (+20 XP) that gates nothing; practice is playable straight away. |

Course practice Modes per Topic: every Mode whose kinds are seeded: **Dive, Apogee, Leap, Pairs, Blitz** (pass bars: Dive/Apogee ≥ 150; Leap ≥ 7/10 correct and not fallen; Pairs both boards cleared; Blitz ≥ 150 points).

## 14. Final direction note from Anton (before "go")

> Codedex is only a reference: it's "kinda stale and lacking". The site must be **really visually stunning and as interactive as possible**, with more character.

So for every site page, go beyond Codedex:
- **A living world, not flat panels.** The site has a persistent animated pixel backdrop (a sky that becomes ocean as you scroll on the landing; drifting clouds, stars, birds, bubbles; day/dusk tint by local time). Cursor parallax on hero scenes.
- **Character everywhere.** The anglerfish mascot reacts: follows the cursor with its eyes, peeks from card corners, comments in speech bubbles (empty states, streak reminders, level-ups), sleeps when idle. Pixel avatars bob and wave on hover.
- **Tactile UI.** Buttons squash and spring; cards tilt in 3D toward the cursor with a glare sweep; Mode tiles play a looping mini-scene on hover; numbers roll like odometers; XP bars fill with a shine and spark particles; badges flip and gleam; streak flames flicker for real.
- **Moments.** Level-up and Topic pass trigger full pixel-confetti bursts plus a banner; the Daily countdown ticks with a flip clock; leaderboard rows animate rank changes (FLIP); the heatmap cells ripple in on load and show tooltips.
- **Sound** (synthesized, opt-in mute): soft UI blips on hover/click, chimes on rewards.
- **Easter eggs:** clicking the mascot plays a reaction, and a Konami code drops a tiny fishing mini-game. (Keep them cheap.)
- Still: 60 fps, reduced-motion respected, accessible, mobile-friendly, and no heavy assets (SVG/canvas pixel art, three.js only where it earns it).
