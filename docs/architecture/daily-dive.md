# Daily Dive

Every America/Vancouver day, one **Daily puzzle**: a public Dive Game of 7 education-trivia Prompts, the same for every Player (Wordle/Krillion style). Each Player's first Run of it that finishes that day is their **Counted Run**; any later Run is a **Practice Run**. Daily #1 went live on 2026-10-04 (CS-themed). Terms: `CONTEXT.md` § Daily Dive. Decisions: overnight-decisions §7, §8, Q9, Q23. Why Answers can come from a generated fact sheet: [ADR-0006](../adr/0006-daily-evidence-from-a-generated-fact-sheet.md). Built in F23 (#36).

## How it's stored

```
system Player ('system')
└── Module "Daily Dive"                                        DAILY_MODULE_ID (lib/daily/puzzle.ts)
    ├── Source Document "Daily Dive #N · <title> (fact sheet)"   7 pages: page N is the Evidence for Prompt N
    └── Game "Daily Dive #N: <title>" (Dive, 7 Prompts)          private until live, then public
daily_puzzles (number PK, day UNIQUE, game_id, prompt_ids[7], status pool|scheduled|live, source seed|gemini)
daily_results        hypertable on day: one Counted Run per (player, day)        → daily_score_stats (cagg)
daily_answer_finds   hypertable on day: Answers found by Counted Runs            → daily_answer_rates (cagg)
```

- A puzzle is an ordinary Dive Game built with the same writers and checks as generation, so `answer_keys` come from `normalize()`, Open Tiers from `assignOpenTiers`, and matching, Hints, Staleness and the Reveal work unchanged.
- **Fixed order.** A Daily Game always plays its Prompts in `prompt_ids` order (fact sheet page order), so share grids line up. The Dive engine's `draw()` checks `daily_puzzles` first (`lib/runs/engines/dive.ts`).
- **Shape.** 3 Open Prompts (6–12 Answers each, most obvious first), then cloze, definition_to_term, ordered_recall, odd_one_out. Prompt N's Evidence must be on page N.
- **Status.** `pool` (no day yet), `scheduled` (has a future day), `live` (its day came; Game public). `CHECK ((status = 'pool') = (day IS NULL))`.

## Day assignment: the midnight job and the lazy path

Both call one SQL function, `claim_daily_puzzle(day)` (migration `20261004T1200_daily_dive.sql`):

1. `pg_advisory_xact_lock(727004, hashtext(day))` serializes claims for the same day; `UNIQUE (day)` is the backstop.
2. The puzzle already scheduled for that day, else the lowest-numbered `pool` puzzle (`FOR UPDATE SKIP LOCKED`, so two different days never take the same one).
3. Status `live`, `live_at`, its Game `visibility = 'public'`.
4. `award_daily_top10(day)`: Badges for days before it (below).

- **TimescaleDB job (Tiger Data showcase):** the procedure `assign_daily_puzzle(job_id, config)` is registered with `add_job(..., schedule_interval => '1 day', initial_start => next Vancouver midnight, fixed_schedule => true, timezone => 'America/Vancouver')`, so it fires at 00:00 Vancouver time across DST. `config` may carry `{"day": "YYYY-MM-DD"}`. Check it with `SELECT * FROM timescaledb_information.jobs WHERE proc_name = 'assign_daily_puzzle'` and its runs in `timescaledb_information.job_history`. Run it by hand with `CALL assign_daily_puzzle(0, '{}')` or `CALL run_job(<job_id>)`.
- **Lazy fallback:** `getDailyPuzzle(day)` (`lib/daily/queries.ts`) returns the live puzzle for a day; for **today** only, if none is live yet, it calls `claim_daily_puzzle(today)` first. Any Daily request does this, so the Daily works even if the job didn't run.
- An empty pool means no Daily that day (`GET /api/daily/today` → 404; the job logs a WARNING). Refill with `npm run daily:generate`.

## Counted and Practice Runs

`afterFinish()` in `lib/runs/run-engine.ts` runs once per finished Run inside its transaction: `onRunFinished` (Run XP), `recordTopicRun` (Courses), then `recordDailyRun` (`lib/daily/record.ts`):

- The Run's Game is a **live** Daily puzzle and the Run **finished on the puzzle's own Vancouver day** → `INSERT INTO daily_results … ON CONFLICT (player_id, day) DO NOTHING`. `daily_results` is partitioned by its `day` (a `date`), so `UNIQUE (player_id, day)` is a real constraint: the first Run to finish wins, race-free.
- If the row went in: copy the Run's correct `guess_events.matched_answer_id`s into `daily_answer_finds`, then `onDailyPlayed(player, day)` (+50 XP, +5 per Streak day, bonus ≤ 50, once per day).
- Anything else is a Practice Run: normal Run XP, nothing Daily. That includes later Runs the same day, a Run started at 23:59 that finishes after midnight, and Runs of past puzzles from the archive.

Leaderboard order is the same as F21's `gameLeaderboard(gameId, { day, counting: "first" })`: score desc, then finish time asc (ties on score are split by who finished first).

**Daily Top 10 Badge.** Awarded once a day is over (not at read time, so a later Run can't knock someone out after they've been told they're in): `award_daily_top10(today)` marks every live day before `today` (`top10_awarded_at`) and grants `daily-top-10` (ref = the day) to everyone with `rank() <= 10` by score desc, finish asc. It runs inside every claim, so the midnight job (or the first request of the new day) hands it out. `player_badges` keeps one row per Badge, so the ref is the first day earned.

## Reveal extras

Every Reveal now has `daily` and `crowd` (both null outside the Daily; `lib/runs/types.ts`, shapes in `lib/daily/types.ts`):

```ts
daily: { number, day, title, counted, tiers: (Tier | null)[], shareText }   // counted = this Run is the Counted Run
crowd: {
  players,                  // Counted Runs that day
  betterThanPct,            // % of them that scored less than this Run; null if none
  medianScore,              // approx_percentile(0.5)
  bucketSize,               // 50 points (500 m)
  histogram: { bucket, count }[],                                   // bucket = lower bound in points, 0 … top bucket in use
  answerFindRates: { answerId, position, answer, pct }[],           // every Answer of this Run's Prompts; % of Counted Runs that found it
}
```

- `betterThanPct` = `approx_percentile_rank(score − 0.5, pct)` over the toolkit `percentile_agg` in `daily_score_stats`; the histogram is TimescaleDB's `histogram(score, 0, 1000, 20)` in the same aggregate. Both continuous aggregates are **real-time**, so a fresh Counted Run shows immediately; the policy materializes days older than one day.
- Crowd data is context only: Tiers stay fixed at generation (ADR-0001).
- **Tiers for the share grid:** an Open Prompt scores at its Answer's Tier; a single-answer Prompt at its Tier, one lower after a Hint (`TIER_BELOW`, common stays common); a miss is null.
- **Share text** (`lib/daily/share.ts`):
  ```
  SYLLABYSS Daily #12 · −1,400 m
  🟦🟨⬛⬜🟪🟦⬜
  https://<NEXT_PUBLIC_SITE_URL>/daily
  ```
  🟨 rare, 🟪 deep, 🟦 solid, ⬜ common, ⬛ miss. Depth = score × 10 with a true minus sign; 0 shows `0 m`. A Practice Run's header ends in `(practice)`. `NEXT_PUBLIC_SITE_URL` falls back to `http://localhost:3000`.

## API

Types: `lib/daily/types.ts` (client-safe). Errors are `{ error }`.

| Method | Route | Auth | Returns |
|---|---|---|---|
| GET | `/api/daily/today` | optional | `{ daily: DailyToday }`; 404 no puzzle today |
| POST | `/api/daily/today/run` | required (401) | `DailyRunResponse { runId, resumed, counted, number, day }`; 404 no puzzle |
| GET | `/api/daily/leaderboard?day=&scope=global\|friends&limit=` | optional (friends: 401) | `{ daily: { number, day, title, gameId }, leaderboard: Leaderboard }`; 400 bad day; 404 no live puzzle that day |
| GET | `/api/daily/archive?limit=` | optional | `{ days: DailyArchiveEntry[] }` newest first, today included |

```ts
DailyToday { number, day, theme, title, gameId, teaser /* first Prompt text */, promptCount, players,
             nextAt /* ISO, next Vancouver midnight */, serverNow,
             me: { status: "not_played" | "in_progress" | "counted", runId, result: DailyResult | null,
                   streak: Streak /* F21 */, dailyStreak: Streak /* days with a Counted Run */ } | null }
DailyResult { runId, score, depth, finishedAt, tiers, shareText }
DailyArchiveEntry { number, day, theme, title, gameId, isToday, players,
                    me: { counted: { score, depth, finishedAt, tiers } | null, bestScore, runs } | null }
```

- **Play today:** `POST /api/daily/today/run` resumes your in-progress Run on today's puzzle or starts one (abandoning any other in-progress Run, as every new Run does); then the normal Dive Run screens and Reveal (`/api/runs/[runId]…`). `counted: false` = today's result is already in, so this is practice.
- **Archive:** past puzzles play as practice with `POST /api/games/[gameId]/runs` (they're public).
- The landing page teaser uses `GET /api/daily/today` signed out (`me: null`).
- Countdown: render from `nextAt` with the clock offset `Date.parse(serverNow) − Date.now()`.

## Seed

`npm run db:seed:daily` (`scripts/seed-daily.mts`, `-- --check` validates without the database) loads `db/seed/daily/pool.json`: 12 hand-written puzzles; #1 on 2026-10-04 (Computing), #2–#7 scheduled 2026-10-05 … 10-10, #8–#12 in the pool. `checkPuzzle(file, { strict: true })` runs each through Dive's own generation checks plus the Daily rules (anything the pipeline would drop is an error); `buildPuzzleRows` derives every id from the content; `writePuzzle` inserts what's missing. Idempotent: unchanged content writes nothing; a changed puzzle that isn't live yet gets a new Game; a live puzzle is never changed. `npm run seed:content:check` also checks the pool file.

## Generation

`npm run daily:generate -- --days N [--dry-run] [--save file.json] [--theme X] [--max-usd 1]` (`scripts/daily-generate.mts`, prompts in `lib/daily/generate.ts`):

1. Theme: Q23's rotation by puzzle number (`themeFor(n)`: Computing, Science, History, Geography, Literature, Mathematics, Art & Music), unless `--theme`. Prompt texts already used in that theme are passed as "ask about other things".
2. **Write call:** Gemini returns the puzzle and its 7-page fact sheet together (`PUZZLE_RESPONSE_SCHEMA`: Dive's Prompt schema plus `fact_sheet.pages`).
3. Clean-up: Open Prompts capped at 12 Answers; every Answer of Prompt N pointed at page N (`alignEvidence`; the quote must still be verbatim on page N); a "Daily Dive:" title prefix stripped. Kinds must come in the fixed order.
4. **Verify call:** a second Gemini call judges every Open Answer and every single-answer Prompt against general knowledge **and** its fact sheet page (temperature 0). Unsupported Open Answers are dropped; an unsupported single-answer Prompt rejects the puzzle.
5. `checkPuzzle(file, { strict: false })`: drops are allowed but the Daily rules must still hold. A rejected puzzle is retried once, then skipped.
6. Written with `writePuzzle` as `pool` (`source = 'gemini'`), number = next free number. Pool puzzles are claimed in number order, after the seed spares.

Cost per puzzle on `gemini-3.6-flash` was about $0.04 (two calls, ~9k thinking + output tokens). If `GEMINI_MODEL` is overloaded the shared client falls back to `GEMINI_FALLBACK_MODEL` (flash-lite), whose puzzles fail the checks more often; the retry usually covers it.

## Code

| File | Responsibility |
|---|---|
| `lib/daily/types.ts` | API and Reveal shapes (client-safe) |
| `lib/daily/days.ts` | Vancouver midnights across DST: `startOfVancouverDay`, `nextVancouverMidnight` (pure) |
| `lib/daily/share.ts` | `shareText`, `tierSquares`, `formatDepth`, `siteUrl` (pure) |
| `lib/daily/puzzle.ts` | `checkPuzzle`, `buildPuzzleRows`, `writePuzzle`, `nextPuzzleNumber` (Node-loadable) |
| `lib/daily/generate.ts` | Gemini instructions/schemas, verification, theme rotation, prices (Node-loadable) |
| `lib/daily/record.ts` | `recordDailyRun` (run engine hook), `dailyReveal`, `crowdStats`, `runTiers` |
| `lib/daily/queries.ts` | `getDailyPuzzle`, `dailyToday`, `startTodayRun`, `dailyLeaderboard`, `dailyArchive`, `DailyError` |
| `lib/daily/http.ts` | `dailyRoute` (optional/required sign-in, errors → status) |
| `db/migrations/20261004T1200_daily_dive.sql` | tables, hypertables, aggregates, `claim_daily_puzzle`, `award_daily_top10`, `assign_daily_puzzle` + `add_job` |
| `scripts/seed-daily.mts`, `scripts/daily-generate.mts` | the seed and the generator |
| `lib/daily/daily.test.ts`, `lib/daily/daily.db.test.ts` | unit tests (day math, share text, checks, generation helpers) and DB tests (claims and races, the job, counted/practice, board order, crowd stats, Top 10) |
