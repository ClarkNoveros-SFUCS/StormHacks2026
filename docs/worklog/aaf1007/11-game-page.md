# #11 F11 Game page UI

Status: done
Branch: feat/11-game-page (base `feat/10-design-system`, PR #47; merged `origin/feat/35-courses-backend`, PR #48)
Updated: 2026-10-04

## Goal
`/games/[gameId]`: the site frame (title, ModeBadge, source chips, created date, a themed hero band per Mode) plus the Mode's own stats panel and Play wording, recent Runs, score sparkline/spread, accuracy-over-time chart, Play with 403/409 handling, generating/failed states. Spec: `docs/architecture/ui-map.md` § Game page, `docs/design/modes/*.md`, overnight-decisions §2, §14.

## Done so far
- Branch created, F22 merged in (ui-map.md conflict resolved: kept F10's route tree + F22's Practice line; kept both Reveal notes).
- `app/games/[gameId]/`: `data.ts` (owner or public Game, Topic lock/pass, finished Runs, F07 progress + dailyStats), `model.ts` (+ tests), `GamePage`, `GameHero` (5 scenes), `PlayButton`, `RecentRuns`, `ScoreHistory`, `AccuracyChart`.
- `components/modes/<mode>/GameStats.tsx` ×5 on `components/modes/GameStatKit.tsx`.
- Verified on :3900 with DEV_PLAYER_ID: all 5 Graph Algorithms Games, a public Python Basics Topic 1 Game (Play → POST → `/runs/<id>`), a locked Topic 2 Game (LOCKED + link; API 403), a temporary generating → failed Game (polling refreshed the page; row deleted afterwards), 404 for unknown/malformed ids. No horizontal overflow at 375 and 1280 (iframe checks). Console: only extension noise.
- tsc, lint, test (200), build all pass.

## Next steps
- None. Follow-ups: F27 builds `/explore/...` (the back link and "Go to Topic N" target); F09/F24/F25 build `/runs/[runId]`.

## Decisions & gotchas
- Play wording from the orchestrator brief (overrides `MODE_UI` verbs): Dive `▼ BEGIN DESCENT ▼`, Apogee `LAUNCH`, Leap `JUMP IN`, Pairs `START MATCHING`, Blitz `GO`.
- Leap "hearts left" = Hearts left on the best-scoring Run. Pairs "best time" = fastest sum of both Boards' durations on a cleared Run. Blitz shows best combo and most correct in one Run.
- Mastery is shown for every Mode (labelled "Pairs learned" / "Statements learned" for Pairs/Blitz).
- Page requires sign-in even for public Games (Q24 makes only Explore/readings public).
- Hero scenes live in `app/games` (not `components/modes/<mode>`) to stay out of F24/F25's folders; only `GameStats.tsx` goes there, as the brief asked.
- Odometer collapses spaces and renders NBSP as 0, so units go in `StatNumber unit`.
- Minimal integration fix: `components/results/ResultList.tsx` KIND_LABEL += multiple_choice, true_false (tsc failed after merging F20 into F10).
- Chrome tabs are hidden for agents (rAF frozen), so visual checks used scaled same-origin iframes.

## Files touched
- app/games/[gameId]/* (new)
- components/modes/GameStatKit.tsx, components/modes/{dive,apogee,leap,pairs,blitz}/GameStats.tsx (new)
- components/results/ResultList.tsx (integration fix)
- docs/FEATURES.md (F11), docs/architecture/ui-map.md (Game page + merge resolution)
