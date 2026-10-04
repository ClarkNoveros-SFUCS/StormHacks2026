# #7 F07 Progress: Personal Best and Mastery

Status: in-review
Branch: feat/7-progress
Updated: 2026-10-03 20:30

## Goal
Server-only read functions in `lib/progress.ts` for Personal Best, Mastery, per-Tier Mastery, recent Runs and the Reveal's "new Personal Best? / Mastery before → after". F06's Reveal, F08's Game cards and F11's Game page call them. Spec: `docs/architecture/data-model.md` (Progress queries), `docs/architecture/run-and-scoring.md` (Reveal).

## Done so far
- Claimed #7, branch `feat/7-progress`
- Plan agreed with Anton: build the core first, then the continuous aggregate
- Contract posted on #7 (cc #6, #8, #11); Vitest heads-up posted on #5 and #6
- Vitest 4 (`npm test` = `vitest run`, `vitest.config.ts`). Vitest 5 would have forced an `@types/node` bump to ≥22
- `lib/progress.ts`: `personalBest`, `mastery`, `masteryByTier`, `recentRuns`, `progressForGames`, `runProgress` + types
- `lib/progress.test.ts`: 11 integration tests, all passing on local TimescaleDB (container `stormhacks-test-db`, port 5499). Skipped without `TEST_DATABASE_URL`
- Caught and fixed: the found count didn't check Game ownership (another Player got "1 of 0")
- build, typecheck, lint pass. `TEST_DATABASE_URL` documented in `.env.example`

- Continuous aggregate (Anton approved building it in this feature):
  - Migration `db/migrations/20261004T0316_player_game_daily.sql`: real-time (`materialized_only = false`), Vancouver days, `WITH NO DATA` + 5-minute refresh policy + lookup index
  - `dailyStats(playerId, gameId, days = 30)` → `DailyStat[]` (oldest first; days with no guesses left out)
  - 3 more tests (real-time before refresh, same after `refresh_continuous_aggregate`, other Player sees nothing); 14/14 pass. The test DB is left empty
  - `data-model.md` cagg section updated to match
- Migration applied to the **local test DB only**. NOT applied to Tiger Cloud `stormhacks-dev`

## Next steps
1. Anton reviews all of F07 (core + aggregate)
2. Apply `20261004T0316_player_game_daily.sql` to Tiger Cloud (`npm run db:migrate`) when Anton says so, e.g. once the PR merges
3. After Anton approves: FEATURES.md (tick all 3, Status `done`, Entry points, Notes), put the Reveal definitions into `run-and-scoring.md`, worklog `done`, PR with `Closes #7`

## Decisions & gotchas
- **Mastery before** = correct `guess_events` with `created_at < run.started_at`; **after** = `created_at <= run.finished_at`. **previousBest** = max score of finished Runs with `finished_at < this.finished_at`; **isNewBest** = `score > coalesce(previousBest, 0)` (ties and a first Run scoring 0 aren't a new best). These use the Run's own timestamps, so an old Reveal stays stable.
- `runProgress` returns null unless the Run is `finished`.
- The total-answers count joins `games` on `player_id`, so another Player's `gameId` returns 0/0.
- F06 owns `GET /api/runs/[runId]/reveal`. If F06 merges first, F07's PR adds `progress: RunProgress` to the route and `lib/runs/types.ts`; otherwise F06 calls `runProgress`.
- Vitest was chosen as the team's test runner (Anton, 2026-10-03). `server-only` is aliased to its `empty.js` in `vitest.config.ts`.
- Mastery `pct` rounds down (spec SQL used `round`), so 100% means every Answer was found.
- `Tier` is defined in `lib/progress.ts` for now. Once F04/F06 add `lib/scoring/tiers.ts`, import it from there instead.
- Invalid uuid strings make Postgres throw `22P02`. Callers should load or validate the Game/Run first.
- `npm run typecheck` in a fresh worktree fails on `LayoutProps` until `next build` (or `next typegen`) has run once. That's existing behavior, not F07's.

## Files touched
- db/migrations/20261004T0316_player_game_daily.sql, docs/architecture/data-model.md
- lib/progress.ts, lib/progress.test.ts
- vitest.config.ts, package.json, package-lock.json (vitest, `npm test`)
- .env.example (`TEST_DATABASE_URL` note)
- docs/worklog/aaf1007/7-progress.md
