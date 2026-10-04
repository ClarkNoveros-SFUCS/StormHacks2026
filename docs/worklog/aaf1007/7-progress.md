# #7 F07 Progress: Personal Best and Mastery

Status: done
Branch: feat/7-progress
Updated: 2026-10-03 21:15

## Goal
Server-only read functions in `lib/progress.ts` for Personal Best, Mastery, per-Tier Mastery, recent Runs and the Reveal's "new Personal Best? / Mastery before → after". F06's Reveal, F08's Game cards and F11's Game page call them. Spec: `docs/architecture/data-model.md` (Progress queries), `docs/architecture/run-and-scoring.md` (Reveal).

## Done so far
- Claimed #7, branch `feat/7-progress`
- Plan agreed with Anton: build the core first, then the continuous aggregate
- Contract posted on #7 (cc #6, #8, #11); Vitest heads-up posted on #5 and #6
- Vitest 4 (`npm test` = `vitest run`, `vitest.config.mts`). Vitest 5 would have forced an `@types/node` bump to ≥22
- `lib/progress.ts`: `personalBest`, `mastery`, `masteryByTier`, `recentRuns`, `progressForGames`, `runProgress` + types
- `lib/progress.test.ts`: 11 integration tests, all passing on local TimescaleDB (container `stormhacks-test-db`, port 5499). Skipped without `TEST_DATABASE_URL`
- Caught and fixed: the found count didn't check Game ownership (another Player got "1 of 0")
- build, typecheck, lint pass. `TEST_DATABASE_URL` documented in `.env.example`

- Continuous aggregate (Anton approved building it in this feature):
  - Migration `db/migrations/20261004T0316_player_game_daily.sql`: real-time (`materialized_only = false`), Vancouver days, `WITH NO DATA` + 5-minute refresh policy + lookup index
  - `dailyStats(playerId, gameId, days = 30)` → `DailyStat[]` (oldest first; days with no guesses left out)
  - Tests for real-time rows, materialized rows, and other Players seeing nothing
  - `data-model.md` cagg section updated to match
- Independent review agent pass. Fixed what it found:
  - **`runProgress` missed the Run's final guess in Mastery after.** JS `Date` drops microseconds, so `created_at <= finished_at` lost the guess written at the same `now()`. Now one SQL query with the bounds against `runs` columns; there's a regression test
  - **dailyStats tests failed on reruns the same day.** They refreshed with a NULL end, which pushed the watermark past today. Now: fixtures at DB `now()` (real-time) and 2 days ago (materialized), refreshing like the policy
  - Documented "never refresh `player_game_daily` with a NULL end" (migration comment, data-model.md)
  - `finished_at is not null` guards in `recentRuns`/`runProgress`. No schema CHECK, to avoid a shared-contract change
  - data-model.md: notes on Game ownership and rounding Mastery down; `dailyStats` doc says to format `day` in America/Vancouver
- 16/16 tests pass, 3 runs in a row on the same DB. The 2 new tests fail on the pre-fix code. The test DB is left empty
- Anton reviewed and approved the code. He applied `20261004T0316_player_game_daily.sql` to Tiger Cloud `stormhacks-dev`
- Merged origin/main (F05 had added Vitest too): took main's `vitest.config.mts`, `package.json` and lockfile, and renamed the test to `lib/progress.db.test.ts` (F05's `test:db` convention). Dropped `TEST_DATABASE_URL`; a shell `DATABASE_URL` overrides `.env.local` for local runs
- Unit 24/24, DB 23/23 (F05 + F07) on local TimescaleDB, typecheck, lint
- FEATURES.md F07 done, Reveal definitions in run-and-scoring.md

## Next steps
- None. Merged via the PR that closes #7. Follow-ups belong to F06 (add `runProgress` to `/reveal`), F08 and F11 (see FEATURES.md Notes).

## Decisions & gotchas
- **Mastery before** = correct `guess_events` with `created_at < run.started_at`; **after** = `created_at <= run.finished_at`. **previousBest** = max score of finished Runs with `finished_at < this.finished_at`; **isNewBest** = `score > coalesce(previousBest, 0)` (ties and a first Run scoring 0 aren't a new best). These use the Run's own timestamps, so an old Reveal stays stable.
- `runProgress` returns null unless the Run is `finished`.
- The total-answers count joins `games` on `player_id`, so another Player's `gameId` returns 0/0.
- F06 owns `GET /api/runs/[runId]/reveal`. If F06 merges first, F07's PR adds `progress: RunProgress` to the route and `lib/runs/types.ts`; otherwise F06 calls `runProgress`.
- Vitest is the team's test runner (F05's config on main; `server-only` → `test/server-only-stub.ts`).
- Mastery `pct` rounds down (spec SQL used `round`), so 100% means every Answer was found.
- `Tier` is defined in `lib/progress.ts` for now. Once F04/F06 add `lib/scoring/tiers.ts`, import it from there instead.
- Invalid uuid strings make Postgres throw `22P02`. Callers should load or validate the Game/Run first.
- Never pass DB timestamps back through JS `Date` as query bounds: microseconds are lost. Compare columns in SQL.
- `player_game_daily`: manual refreshes must end at `now() - interval '1 minute'`, never NULL.
- `npm run typecheck` in a fresh worktree fails on `LayoutProps` until `next build` (or `next typegen`) has run once. That's existing behavior, not F07's.

## Files touched
- db/migrations/20261004T0316_player_game_daily.sql, docs/architecture/data-model.md
- lib/progress.ts, lib/progress.db.test.ts
- docs/worklog/aaf1007/7-progress.md
