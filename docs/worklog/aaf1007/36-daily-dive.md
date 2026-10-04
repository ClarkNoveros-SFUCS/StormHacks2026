# #36 F23 Daily Dive backend

Status: in-progress
Branch: feat/36-daily-dive (base feat/35-courses-backend, PR #48)
Updated: 2026-10-04 05:30 (Vancouver)

## Goal
Daily Dive backend: daily puzzles as public system Dive Games with a fact-sheet Source Document, one counted Run per Player per Vancouver day, TimescaleDB job + lazy claim, daily_results hypertable and crowd aggregates, Gemini generator, API, Reveal crowd/share extras. Spec: overnight-decisions §7, §8, Q9, Q23; brief in the overnight orchestration.

## Done so far
- Worktree set up, branch created, issue claimed.

## Next steps
1. Migration `db/migrations/20261004T1200_daily_dive.sql`.
2. `lib/daily/` (puzzle checks/rows/writer, days, share, queries, record hook), seed + generate scripts, API routes, tests, docs.

## Decisions & gotchas
- (filled in as I go)

## Files touched
- …
