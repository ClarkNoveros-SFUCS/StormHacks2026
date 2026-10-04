# overnight/demo: every PR branch merged (demo only)

Status: done
Branch: `overnight/demo` (decision Q26: demo only, **never merged, never PR'd**)
Date: 2026-10-04

## What's merged

Base: `origin/feat/41-daily-hub` (F28 #59), the top of the biggest stack. It already contains:
F26 #56 (`feat/39-profile-social-ui`), F19 #51 (`feat/32-landing-shell`), F10 #47 (`feat/10-design-system`), F21 #45 (`feat/34-social-backend`), F22 #48 (`feat/35-courses-backend`), F20 #46 (`feat/33-game-modes-engine`), F23 #57 (`feat/36-daily-dive`, incl. `content/seed-content`), F09 #49 (`feat/9-dive-run-ui`), and the plan PR #43 (`chore/overnight-plan`).

Merged on top, in order (each a `--no-ff` merge commit):

| Branch | PR | Conflicts |
|---|---|---|
| `feat/37-apogee-leap` | F24 #58 | `components/results/ResultList.tsx`, `docs/FEATURES.md` |
| `feat/38-pairs-blitz` | F25 #55 | `app/runs/[runId]/mode-screens.tsx`, `lib/runs/client.ts`, `docs/FEATURES.md` |
| `feat/8-modules-ui` | F08 #50 | `components/results/ResultList.tsx`, `docs/FEATURES.md` |
| `feat/11-game-page` | F11 #52 | `docs/architecture/ui-map.md` |
| `feat/40-explore-ui` | F27 #53 | `docs/FEATURES.md`, `docs/architecture/ui-map.md` |
| `feat/25-example-prompts` | F15 #54 (includes F14 #44) | `.env.example`, `package.json` |
| `feat/26-verification-pass` | F16 #60 | none |

Skipped: `feat/42-arena` (F29 #42): no remote branch and no PR when the merge ran.

## Conflict resolutions

- **`ResultList.tsx`** (F28 × F24): kept both. F28's `findRate` ("% found" with the `FoundBy` bar) and F24's `tiers` map (a `TiersContext`, Apogee passes its own tier names) now live together: `ResultList` provides the context, the inner `List`/`OpenAnswers`/`SingleAnswer` read `TIER_UI` from it and still take `findRate`/`pct`. F08's comment line on the extra Prompt kinds dropped (labels already there, one copy).
- **`mode-screens.tsx`** (F24 × F25): every Mode has its real screen (Dive, Apogee, Leap, Pairs, Blitz); `ModeComingSoon` and its `RunClosed`/`modeUi` imports removed (unused).
- **`lib/runs/client.ts`** (F24 × F25): both helpers kept. `runApi.answer` (F24's overloads, Leap and Blitz) and `runApi.blitzAnswer` (F25) coexist; `pair` and `lifeline` both present.
- **`docs/FEATURES.md`**: every board row takes the newest status (`done` beats `planned`), every `## Fxx` section takes the filled-in side. Result: F08–F11, F14–F16, F19–F28 `done`; F12, F13, F17, F18, F29 `planned`.
- **`ui-map.md`**: kept the newest text (F28's Daily Reveal lines, F10's `/styleguide` section at the end); took F11's `/games/[gameId]` section whole; dropped a stray "Practice → POST …" line that had landed inside the route tree.
- **`.env.example`**: kept `DEV_PLAYER_ID` (commented), `NEXT_PUBLIC_SITE_URL`, F14's `EVAL_DECKS_DIR` and F16's `GEMINI_VERIFY`/`GEMINI_VERIFY_MODEL`.
- **`package.json`**: kept `social:backfill`, `seed:content:check` and `generate:eval`. `npm install` afterwards: lockfile already up to date.

## `demo:` integration fixes (port these to the PR they belong to)

| Commit | Fix | Belongs to |
|---|---|---|
| `demo: home Course card reads F22's listCourses` | `app/home/CourseProgress.tsx` is now a server component fed by `listCourses(playerId)` (one card per Course; "Start Topic 1 / Next Topic / Review the course" links to `progress.nextTopicSlug`); `coursesAvailable()` and the client fetch that guessed shapes are gone. | F19 #51 (after F22 #48) |
| `demo: one Topic-pass banner for every Mode …` | F24's `components/results/TopicPassBanner.tsx` read `topic.title`/`href`, which F22's `reveal.topic` doesn't have (banner said "Topic passed!" with no name, on every passed re-run). It now wraps F25's `components/modes/shared/TopicPassBanner.tsx` (reads `topicTitle`, `passedNow`, `unlockedNext`). On a fresh pass that unlocked the next Topic the link is "Unlock the next Topic ▶" → `/explore/<course>?passed=<topic>` (F27's unlock replay). **Dive's Reveal had no Topic handling at all:** it now shows the banner (in `afterHeader`) and Back goes to the Topic. New `components/modes/shared/reveal-links.ts` (`revealLinks`): for Course Games, Evidence links and Back go to the Topic page instead of `/modules/<system module>` (a 404 for Players); used by all five Reveals. | F24 #58, F25 #55, F09 #49 (all after F22/F27) |
| `demo: /runs/new sends non-Dive Modes and public Games to their Game page` | `/runs/new?game=` (RunClosed's "Play again") 404'd for public Games and showed Dive's ocean for every Mode. It now redirects to `/games/<id>` unless it's your own Dive Game. | F09 #49 |
| `demo: Explore/Modules layouts portal their sky …` | `app/explore/layout.tsx` rendered its own Logo + Sign in bar for signed-out visitors on top of F19's signed-out nav (two headers); removed. Both layouts now put `SkyBackdrop` in F19's `BackdropPortal` (so no transformed ancestor traps the fixed canvas, same as `/home` and the social pages), and Modules drops `PageTransition` (the root `RouteTransition` already animates; the filled `transform` trapped fixed overlays). | F27 #53, F08 #50 (after F19) |

## Checks (on the final branch)

- `npx tsc --noEmit`: pass
- `npm run lint`: pass (0 problems)
- `npm test`: 34 files, 328 tests pass
- `npm run test:db`: 9 files, 88 tests pass
- `npm run build`: pass

## Smoke test (dev server on :4600 with `DEV_PLAYER_ID` = Anton; then `next start` for signed-out)

- 200 and no console errors: `/home`, `/explore`, `/explore/python-basics`, Topic 1 and Topic 2 (locked), `/modules`, Graph Algorithms Module, the file viewer (`?doc=…&page=2` drawer and `/modules/files/<id>`), `/games/<id>` for Dive, Apogee, Leap, Pairs, Blitz (own) and Course Dive/Leap, `/daily`, `/leaderboard`, `/friends`, `/u/postyfan`, `/profile` (→ `/u/postyfan`), `/styleguide`, `/styleguide/dive`.
- Dive Run on the Graph Algorithms Dive Game: started from the Game page's BEGIN DESCENT, answered "topological sort" (+25, catch screen, DESCEND), an odd-one-out, reached the put-in-order Prompt, let the rest time out; the Reveal (curve, Dive log, The Catch) rendered with no errors.
- Apogee, Leap, Pairs and Blitz Run screens open on their intro (LAUNCH / JUMP / MATCH / GO) with no errors; an abandoned Run shows RunClosed.
- Production build, signed out (curl, no Clerk session): `/` renders the landing with the Daily teaser ("Name a sorting algorithm"), Sign in and Start playing; `/explore`, the Course and Topic pages and `/daily` render public; `/home` redirects to sign-in; `/modules` streams a redirect to sign-in; `/styleguide` is 404. (Chrome had a real Clerk session on localhost, so the browser view of `/` was the signed-in `/home`.)
- The smoke test played on Anton's player: one finished Dive Run on his Graph Algorithms Dive Game, and an Apogee Run left in progress (any new Run abandons it). No Course Topic was passed, so the demo can still pass Topic 1 live.

## Run the demo locally

```bash
git fetch origin && git switch overnight/demo
npm install
# .env.local: Clerk keys, DATABASE_URL, GEMINI_API_KEY (see .env.example). Leave DEV_PLAYER_ID unset to sign in for real.
npm run db:migrate                 # already applied on stormhacks-dev; needed on a fresh DB
npm run db:seed -- <clerkUserId>   # demo Module + a Game per Mode (only on a fresh DB / new Player)
npm run db:seed:courses            # Python Basics (idempotent)
npm run db:seed:daily              # Daily pool (idempotent)
npm run social:backfill            # XP for Runs finished before F21 (idempotent)
npm run dev
```

On `stormhacks-dev` all of these have already been run; `npm install && npm run dev` is enough.

## Known issues

- F29 Arena isn't in the branch (no PR yet).
- F13 (#21, `games.mode` + Mode picker) still shows `planned` on the board although F08/F20 built most of it ("Part of #21").
- Odometers/animations look frozen in background browser tabs (rAF throttling); not a bug.
- `/runs/new` is still Dive-only by design; other Modes start from their Game page.
- Two `TopicPassBanner` files remain (F24's is now a thin wrapper); when porting, keep F25's in `components/modes/shared/` and drop the wrapper.
