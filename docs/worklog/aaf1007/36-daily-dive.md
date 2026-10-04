# #36 F23 Daily Dive backend

Status: done
Branch: feat/36-daily-dive (base feat/35-courses-backend, PR #48)
Updated: 2026-10-04 05:45 (Vancouver)

## Goal
Daily Dive backend: daily puzzles as public system Dive Games with a fact-sheet Source Document, one counted Run per Player per Vancouver day, TimescaleDB job + lazy claim, daily_results hypertable and crowd aggregates, Gemini generator, API, Reveal crowd/share extras. Spec: `docs/architecture/daily-dive.md` (overnight-decisions §7, §8, Q9, Q23).

## Done so far
- Migration `20261004T1200_daily_dive.sql` (applied to stormhacks-dev): `daily_puzzles`, `daily_results` + `daily_answer_finds` hypertables (partitioned by date `day`), real-time caggs `daily_score_stats` (percentile_agg, histogram) and `daily_answer_rates`, functions `claim_daily_puzzle`, `award_daily_top10`, procedure `assign_daily_puzzle` + `add_job` (job 1013 on stormhacks-dev, next start 2026-10-05 07:00 UTC).
- `lib/daily/*`, run-engine hook (`recordDailyRun` in `afterFinish`, `dailyReveal` in `getReveal`), Dive `draw()` fixed order for Daily Games, Reveal types (`daily?`, `crowd?`).
- Seed: `npm run db:seed:daily` run on stormhacks-dev (12 puzzles). Generator: `npm run daily:generate`; generated #13 (Mathematics), #14 (Art & Music), #15 (Computing). Gemini spend ≈ $0.13 (incl. two failed flash-lite fallback attempts).
- API: `/api/daily/today`, `/api/daily/today/run`, `/api/daily/leaderboard`, `/api/daily/archive`; curl-checked signed out on port 3800 (today → Daily #1 live).
- Tests: `lib/daily/daily.test.ts` (19), `lib/daily/daily.db.test.ts` (8). Docs: daily-dive.md, ADR-0006, data-model, CONTEXT, courses.md, social.md, FEATURES, `.env.example` (`NEXT_PUBLIC_SITE_URL`).

## Next steps
1. None for F23. Follow-ups: refill the pool before ~2026-10-18 (`npm run daily:generate -- --days 14`); UI in F28/F19/F09.

## Decisions & gotchas
- **One counted Run** = first Run on day D's live puzzle that *finishes* on day D (Vancouver), enforced by `UNIQUE (player_id, day)` on the date-partitioned hypertable. A Run that finishes after midnight is practice (consistent with `gameLeaderboard(day, counting: "first")`).
- **Claims** share one SQL function for job and lazy path; race safety = per-day advisory lock (727004) + UNIQUE(day) + SKIP LOCKED for pool rows. Spec said "ON CONFLICT (day) DO NOTHING"; an UPDATE can't use ON CONFLICT, so the lock does that job.
- **Daily Top 10** is awarded when the day is over (inside every claim, so the midnight job does it), not at read time: a Badge can't be taken back. rank() ≤ 10, same order as the board.
- **Pool Games stay private** until live, so future puzzles can't be played early.
- **Generated puzzles:** `alignEvidence` forces Prompt N's Evidence to page N (bookkeeping; the verbatim-quote check still applies). Title prefix "Daily Dive:" stripped. #13's title was fixed by hand in the DB (pool, unplayed).
- `crowd.answerFindRates` carries `position` + `answer` as well as `answerId` because Reveal answers have no ids.
- Share text for a practice Run ends its header with "(practice)". URL = `${NEXT_PUBLIC_SITE_URL}/daily`.
- DB tests use far-future days and rolled-back transactions; race tests use two real connections, both rolled back (the second claim is shown to block on the first's lock).
- `lib/courses/seed.ts`: exported `buildGameRows` and `insertGame` (no behaviour change) so the Daily writer reuses them.

## Files touched
- db/migrations/20261004T1200_daily_dive.sql, lib/daily/*, app/api/daily/**, scripts/seed-daily.mts, scripts/daily-generate.mts, package.json
- lib/runs/run-engine.ts, lib/runs/engines/dive.ts, lib/runs/engines/common.ts, lib/runs/types.ts, lib/courses/seed.ts
- docs/architecture/daily-dive.md, docs/adr/0006-daily-evidence-from-a-generated-fact-sheet.md, docs/architecture/data-model.md, courses.md, social.md, CONTEXT.md, docs/FEATURES.md, .env.example
