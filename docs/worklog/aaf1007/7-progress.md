# #7 F07 Progress: Personal Best and Mastery

Status: in-progress
Branch: feat/7-progress
Updated: 2026-10-03 20:15

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

## Next steps
1. **Core is done; it's waiting for Anton's review** before step 2
2. **After core (agreed with Anton): `player_game_daily` continuous aggregate**
   - Migration `db/migrations/<UTC ts>_player_game_daily.sql`: the view from `data-model.md`, `WITH NO DATA` (migrations run in a transaction), plus `add_continuous_aggregate_policy`
   - Set `timescaledb.materialized_only = false` so a Run played during the demo shows up right away, not after the next 5-minute refresh
   - `dailyStats(playerId, gameId, days = 30)` in `lib/progress.ts` → `{ day, guesses, correct, accuracy, avgMsToCorrect }[]` for F11's chart
   - Add a test case and document it in FEATURES.md Notes
3. Hand over for review (worklog `in-review`). No PR until Anton approves. Then: FEATURES.md (tick, `done`, Entry points, Notes), put the definitions below into `run-and-scoring.md`, PR with `Closes #7`

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
- lib/progress.ts, lib/progress.test.ts
- vitest.config.ts, package.json, package-lock.json (vitest, `npm test`)
- .env.example (`TEST_DATABASE_URL` note)
- docs/worklog/aaf1007/7-progress.md
