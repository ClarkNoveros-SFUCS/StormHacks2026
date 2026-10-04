# Overnight summary (2026-10-04)

Everything below is open as PRs, and **nothing is merged**. Decisions are in `overnight-decisions.md` (§12–14 are your answers). The full log is in `overnight-state.md`.

## Shipped PRs, in merge order

The indented ones are stacked on the PR above them. Merge each base first, or retarget it to `main` after its base merges.

1. **#43** Overnight plan: the decisions doc and board rows F19–F29. Docs only. **Merge first.**
2. **#44** F14 generation scorecard: the base is `main`. Baseline: 64 Prompts returned, 56 kept, across 4 real decks.
3. **#45** F21 Social backend: profiles, XP, levels, ocean ranks, streaks, heatmap, badges, friends, leaderboards (ADR-0005).
4. **#46** F20 Modes engine and generation: Apogee, Leap, Pairs and Blitz, plus two new Prompt kinds (`multiple_choice`, `true_false`).
   - **#48** F22 Courses + Python Basics (6 Topics, 30 public Games) + XP on every Run. Includes #45.
     - **#57** F23 Daily Dive backend: the pool, a TimescaleDB `add_job` at midnight, crowd stats, share text (ADR-0006).
   - **#54** F15 example Prompts. Prompts kept went from 56 to 64, then 60 on a second run. Includes #44.
     - **#60** F16 Gemini verification pass, which caught 8–9 of 9 planted errors.
       - **#62** F17 overgenerate and select, behind `GEMINI_OVERGENERATE`, off by default.
5. **#47** F10 design system: the site look, Dive's Krillion theme, a mock with real descent, `/styleguide`, and the `DEV_PLAYER_ID` dev bypass.
   - **#51** F19 landing, nav and `/home`. Includes #45.
     - **#56** F26 profile (heatmap, profile card, badges), friends and leaderboard pages. Includes #48.
       - **#59** F28 Daily hub and Daily integrations (Reveal crowd chart, landing teaser). Includes #57 and #49.
   - **#49** F09 Dive Run and Reveal (Krillion layout, real descent, catch screen). Includes #46.
     - **#58** F24 Apogee and Leap, built in three.js.
       - **#61** F29 Arena, the three.js FPS (stretch).
     - **#55** F25 Pairs and Blitz.
   - **#50** F08 Modules page, file viewer and the Mode picker. Closes #8 and is part of #21. Includes #46.
   - **#52** F11 Game page. Includes #48.
   - **#53** F27 Explore, Course and Topic pages. Includes #48.

I reran the checks myself on every PR except #62: a clean tree, tsc, lint with 0 errors, and unit tests. I also checked that each PR closes its issue and has no AI attribution. For #62 I only checked the PR's base, `Closes` line and attribution; its own agent reports all checks passing.

**`overnight/demo`:** an agent was still merging every branch into one demo branch and writing the F12 deploy and demo docs when my usage limit hit. If it finished, the branch is pushed and `docs/worklog/aaf1007/overnight-demo.md` on it lists the conflict resolutions and `demo:` fixes. If it didn't, re-run it from `overnight-state.md`.

## Blocked or skipped
- **F18** (pgvector retrieval): skipped in favour of Arena, as you asked (Q7).
- **F12** (deploy): prep only, as part of the integration agent's work. Deploying, production secrets and accounts are left for you.

## Decisions to check
These are the ones I'd look at first. Each PR body lists all of its own.
- **Product name:** SYLLABYSS kept. The mascot is named "Lumen".
- **Apogee:** 1 km per point. Planets past the ISS sit on a compressed scale.
- **Leap:** the 3rd correct answer in a row gets ×1.5, the 5th gets ×2. A "READY? JUMP" button sits between questions.
- **Pairs and Blitz:** a start press before each Board and before the 3-2-1 countdown.
- **Arena:** the next round starts itself after 6 s.
- **Daily:** the counted Run is the first that *finishes* that Vancouver day. The top-10 badge is awarded after the day ends. Future puzzles stay private until their day.
- **Levels:** level n starts at `50·(n−1)·n` XP, matching your listed 100/300/600.
- **XP awards:** made exactly-once with a per-player lock. TimescaleDB can't enforce a unique key without the time column.
- **Social:** profiles are visible to any signed-in user; Modules never are.
- **F17 is off by default.** A Run only draws 7 Prompts, so overgenerating mostly adds variety for about +20% cost.

## What you need to do for `main`
1. **Merge order:** #43, then #44, #45, #46, #47, then the stacked PRs above. GitHub retargets a stacked PR when its base merges; otherwise retarget it by hand. Expect small conflicts:
   - in `docs/FEATURES.md` board rows
   - in `ResultList.tsx`, where several branches added the same two Prompt-kind labels; keep one copy
   - between #58 and #55 in `app/runs/[runId]/mode-screens.tsx` and `lib/runs/client.ts`; keep both sides
2. **Migrations:** already applied to `stormhacks-dev`, all additive:
   - `…T1000_game_modes_engine`
   - `…T1015_social`
   - `…T1100_courses`
   - `…T1200_daily_dive`
   A fresh DB needs `npm run db:migrate`.
3. **Seeds** (already run on dev, all idempotent): `npm run db:seed -- <clerkId>`, `npm run db:seed:courses`, `npm run db:seed:daily`, `npm run social:backfill`.
4. **Env:**
   - **Production:** set `NEXT_PUBLIC_SITE_URL` for share links. Optional: `GEMINI_VERIFY` (on by default), `GEMINI_VERIFY_MODEL`, `GEMINI_OVERGENERATE` (off).
   - **Never in production:** `DEV_PLAYER_ID`. It only works under `next dev` anyway.
5. **Daily pool** lasts until about 2026-10-18. Refill it with `npm run daily:generate -- --days 14` (about $0.04 per puzzle).
6. **Test data on dev:**
   - Your account has test Runs, +20 XP from "mark as read", and a counted Daily #1 result: 315 points, rank #1.
   - Extra seeded players `user_dev_f24_agent` and `user_dev_arena_agent` exist; delete them if you like.

## What teammates need to know
- The design direction changed (#10): the Codedex-style site, and Krillion's style now belongs only to Dive.
- F08 was taken over from Clark (#8).
- The app is no longer purely solo: ADR-0005 covers profiles and leaderboards on public Games, and ADR-0006 covers the Daily's fact-sheet Evidence.
- New CONTEXT terms: Course, Topic, Pass, Public Game, Daily Dive, Apogee, Leap, Pairs, Blitz, Arena, Heart, Lifeline, Board, Combo, XP, Level, Rank, Streak, Badge, Friend, Leaderboard.

## Suggested next steps
1. Review and merge in the order above. The `overnight/demo` branch, if pushed, gives you the whole app at once to click through.
2. **Manual checks** that agents couldn't do well, because automated tabs throttle animation:
   - landing scroll descent
   - Arena pointer-lock
   - Apogee and Leap 60 fps
3. **Small follow-ups:**
   - a code rule for give-away Hints (F16 couldn't catch them)
   - `/runs/new` launch screens for non-Dive Modes
   - a "Daily not played" nav badge
4. F18 (pgvector) if you want another Tiger Data feature.

**Gemini spend:** about $2.1 of the $5 cap.
