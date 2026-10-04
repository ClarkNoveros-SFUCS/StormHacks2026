# #86 Sonar-made Games show up live; generation tops up when short

Status: done
Branch: feat/86-sonar-game-live

## Problem
- Pressing Sonar's **Make this Game**, then closing and reopening the drawer, lost the card's "Generating…" state, and the Game appeared on the Module page only after a reload: `ModuleWorkspace` keeps its Games in state and only polls when one is already generating, so `router.refresh()` didn't add it.
- A Leap Game from one 28-page PDF failed with "only N passed the checks. Try adding more files".

## Done
- `lib/sonar/client.ts`: `announceGameCreated(key, game)` records the card as pressed (module-level map, per session) and fires `sonar:game-created` with the API's `GameSummary`. `ActionCard` starts `done` from `createdGameFor(key)` and shows "Building in the background…".
- `ModuleWorkspace` listens, adds the Game (same Module only) as Generating; its existing polling gives the Ready toast and burst.
- `generateGame`: the per-document round is a function; below the minimum, a top-up round runs with `topUp(request, keptTexts)` (lists the kept Prompts, asks for other facts/pages, temperature +0.2), merged and rechecked.
- Error text suggests Dive.

## Decisions
- One top-up round only: bounded cost and time; most short Games were a few Prompts under.
- The prod failure wasn't in the local DB, so the exact Mode/count is unknown; the top-up covers every Mode.

## Checks
tsc, lint, `npm test` (421), `lib/games/generate-game.db.test.ts` (19, incl. the new top-up test).
