# Data model (Tiger Data / Postgres)

All app data lives in one Postgres database on Tiger Cloud, which includes TimescaleDB. Every table carries or reaches a `player_id`, and **every query filters by the Clerk user id**.

## Relationships

```
Player 1──N Module
Module 1──N Source Document 1──N Source Page
Module 1──N Game
Game   N──M Source Document         (game_sources; a file can feed several Games)
Game   1──N Prompt 1──N Answer 1──N Answer Key
Player 1──N Run N──1 Game
Run    1──N Run Prompt N──1 Prompt      (Dive/Apogee 7, Leap 10, Pairs 12, Blitz a deck of up to 120)
guess_events  (hypertable: every guess ever made, the source for Mastery and Staleness)

Social (F21, ADR-0005):
Player 1──N xp_events      (hypertable: every XP award)
Player 1──N player_badges
Player N──M Player         (friendships: one row per pair, pending or accepted)

Courses (F22, courses.md):
Course 1──1 Module         (owned by the system Player 'system')
Course 1──N Course Topic 1──1 Source Document   (the reading)
Course Topic 1──N topic_games N──1 Game          (one per Mode; the Game is public)
Player 1──N topic_progress N──1 Course Topic

Daily Dive (F23, daily-dive.md):
Daily Puzzle 1──1 Game             (Dive, 7 Prompts, owned by 'system' in the "Daily Dive" Module; public once live)
Daily Puzzle 1──1 Source Document  (the fact sheet, via the Game's game_sources)
Player 1──N daily_results          (hypertable: one Counted Run per day)  → daily_score_stats (cagg)
Player 1──N daily_answer_finds     (hypertable: Answers found by Counted Runs) → daily_answer_rates (cagg)
```

## Conventions

- **Client:** `postgres` (porsager) from `lib/db.ts`, server only. Plain SQL, no ORM.
- **Migrations:** `db/migrations/<UTC timestamp>_<name>.sql`, e.g. `20261003T1530_init.sql`. Use timestamps, not sequence numbers, so parallel branches never collide. `scripts/migrate.mjs` applies files in name order and records them in `schema_migrations`.
- **Ids:** `uuid DEFAULT gen_random_uuid()`. The Player id is the Clerk user id (`text`).
- **Time:** `timestamptz` everywhere.

## Schema

The source of truth is `db/migrations/` (the initial `20261003T1830_init.sql` also adds indexes on foreign keys). Change the schema with a new migration file, never by editing an applied one. Below is the current shape; comments name the later migrations. `20261004T1000_game_modes_engine.sql` (F20) widened the Mode and kind CHECKs and `run_prompts.position`, and added `prompts.is_true` and `runs.mode_state`.

```sql
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;   -- levenshtein_less_equal for answer matching
-- timescaledb is already installed on Tiger Cloud services

CREATE TABLE players (
  id          text PRIMARY KEY,                 -- Clerk user id; upserted on first request
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE modules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE source_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  player_id   text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  filename    text NOT NULL,
  mime_type   text NOT NULL,
  size_bytes  integer NOT NULL,
  stage_path  text,                              -- unused since ADR-0003 (files aren't kept)
  status      text NOT NULL CHECK (status IN ('uploaded','parsing','parsed','failed')),
  error       text,
  page_count  integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE source_pages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id  uuid NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  page_index          integer NOT NULL,          -- 0-based
  page_number         integer NOT NULL,          -- page_index + 1, shown to the Player
  content_md          text NOT NULL,
  UNIQUE (source_document_id, page_index)
);

CREATE TABLE games (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id     uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  player_id     text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  title         text NOT NULL,
  status        text NOT NULL CHECK (status IN ('queued','generating','ready','failed')),
  error         text,
  prompt_count  integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Game Mode (ADR-0004): added by 20261004T0750_games_mode.sql, widened by 20261004T1000 (arena is reserved, not creatable)
  mode          text NOT NULL DEFAULT 'dive' CHECK (mode IN ('dive','apogee','leap','pairs','blitz','arena')),
  -- Added by 20261004T1100_courses.sql (F22): 'public' Games (Course practice, Daily Dive) can be played by any Player
  visibility    text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public'))
);

CREATE TABLE game_sources (
  game_id             uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  source_document_id  uuid NOT NULL REFERENCES source_documents(id) DEFERRABLE INITIALLY DEFERRED,  -- can't delete a file a Game uses
  PRIMARY KEY (game_id, source_document_id)
);

CREATE TABLE prompts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id             uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  source_document_id  uuid NOT NULL REFERENCES source_documents(id) DEFERRABLE INITIALLY DEFERRED,
  kind                text NOT NULL CHECK (kind IN ('open','cloze','definition_to_term','ordered_recall','odd_one_out',
                                                   'multiple_choice','true_false')),   -- last two: F20 (Leap, Blitz)
  text                text NOT NULL,  -- true_false: the statement; definition_to_term: the definition
  tier                text CHECK (tier IN ('common','solid','deep','rare')),   -- every kind but open
  hint                text,                                                     -- Dive single-answer only; null = no Hint button
  explanation         text,
  items               jsonb,          -- ordered_recall: string[] in the correct order
  options             jsonb,          -- odd_one_out, multiple_choice: string[4]
  is_true             boolean,        -- true_false only; F20 (CHECK: set exactly when kind = 'true_false')
  evidence_page_id    uuid REFERENCES source_pages(id) DEFERRABLE INITIALLY DEFERRED,   -- ordered_recall / odd_one_out / multiple_choice / true_false
  CHECK ((kind = 'open') = (tier IS NULL))
);

-- Every Prompt has ≥1 Answer row: Open = 4–15, every other kind = exactly 1.
-- ordered_recall's single Answer has canonical = 'correct order'; odd_one_out's and multiple_choice's
-- is the correct option; true_false's is 'True' or 'False'. Only typed kinds have answer_keys.
-- That makes Mastery a uniform count over answers.
CREATE TABLE answers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id         uuid NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  canonical         text NOT NULL,
  tier              text NOT NULL CHECK (tier IN ('common','solid','deep','rare')),  -- single-answer: copy of prompt.tier
  rarity_rank       integer,        -- Open only: 1 = most obvious
  exact_only        boolean NOT NULL DEFAULT false,
  evidence_page_id  uuid REFERENCES source_pages(id) DEFERRABLE INITIALLY DEFERRED,
  evidence_quote    text
);

CREATE TABLE answer_keys (          -- typed matching lookup; see answer-matching.md
  prompt_id   uuid NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  normalized  text NOT NULL,
  answer_id   uuid NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  exact_only  boolean NOT NULL,
  PRIMARY KEY (prompt_id, normalized)
);

CREATE TABLE runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id         text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  game_id           uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  status            text NOT NULL CHECK (status IN ('in_progress','finished','abandoned')),
  current_position  smallint NOT NULL DEFAULT 1,   -- the current Prompt; Pairs: the current Board
  score             integer NOT NULL DEFAULT 0,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  -- F20: the Mode's own Run state, owned by its engine (lib/runs/engines/<mode>.ts). Null for Dive/Apogee.
  -- Leap: hearts, streak, bestStreak, correct, wrong, timeouts, lifelinePosition, outcome
  -- Pairs: boards[] { startedAt, deadlineAt, endedAt, cleared, mistakes, timeBonus }, outcome
  -- Blitz: startedAt, deadlineAt, deckSize, combo, bestCombo, correct, wrong, outcome
  mode_state        jsonb
);
CREATE INDEX runs_best ON runs (player_id, game_id, score DESC) WHERE status = 'finished';

CREATE TABLE run_prompts (
  run_id       uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  position     smallint NOT NULL CHECK (position >= 1),   -- was 1..7; widened by F20 (Pairs Board b = positions 6b-5..6b)
  prompt_id    uuid NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  started_at   timestamptz,
  deadline_at  timestamptz,           -- moves 3 s earlier per wrong typed guess
  ended_at     timestamptz,
  outcome      text CHECK (outcome IN ('correct','wrong','timeout')),
  answer_id    uuid REFERENCES answers(id),
  hint_used    boolean NOT NULL DEFAULT false,      -- Leap: the 50/50 was used on this question
  points       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, position)
);

-- Every accepted guess, correct or not. Append-only event log, partitioned by time.
-- Rejected requests (any 400 or 409) aren't logged, nor is a guess that arrived after the
-- deadline plus grace (see run-and-scoring.md).
-- No foreign keys: it's an event log, and deleting a Game leaves harmless orphans
-- (progress queries join through answers, so orphans never count).
CREATE TABLE guess_events (
  created_at         timestamptz NOT NULL DEFAULT now(),
  player_id          text NOT NULL,
  game_id            uuid NOT NULL,
  run_id             uuid NOT NULL,
  prompt_id          uuid NOT NULL,
  position           smallint NOT NULL,
  raw_text           text NOT NULL,            -- one-shot kinds: JSON of the submitted order/option; Leap: JSON of the
                                               -- option text; Blitz: "true"/"false"; Pairs: {"term","definition"}
  normalized         text,
  matched_answer_id  uuid,
  match_method       text NOT NULL CHECK (match_method IN ('exact','typo','ambiguous','none','choice')),  -- Leap/Pairs/Blitz: 'choice'
  distance           smallint,
  is_correct         boolean NOT NULL,
  points             integer NOT NULL DEFAULT 0,
  ms_into_prompt     integer NOT NULL,
  hint_used          boolean NOT NULL DEFAULT false,
  tier               text                      -- tier of the matched Answer, for stats
);
SELECT create_hypertable('guess_events', by_range('created_at'));
ALTER TABLE guess_events SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'player_id',
  timescaledb.compress_orderby = 'created_at DESC'
);
CREATE INDEX guess_events_recall ON guess_events (player_id, prompt_id, matched_answer_id) WHERE is_correct;
CREATE INDEX guess_events_game   ON guess_events (player_id, game_id) WHERE is_correct;
```

`create_hypertable(…, by_range(…))` works on every TimescaleDB 2.13+, so the migration uses it instead of the newer `CREATE TABLE … WITH (tsdb.hypertable)` syntax.

**Why four foreign keys are `DEFERRABLE INITIALLY DEFERRED`.** `game_sources.source_document_id`, `prompts.source_document_id`, `prompts.evidence_page_id` and `answers.evidence_page_id` point from the games branch into the source-documents branch. Deleting a Module or a Player cascades down both branches, and an immediate check (`RESTRICT` or `NO ACTION`) fires partway through the cascade and refuses the whole delete. A deferred check runs at commit, after the cascade has finished. Deleting a Source Document that a Game still uses is still refused: with error `23503` at commit, or at the statement itself outside a transaction. F03's delete route should check `game_sources` first and return 409 instead of relying on the error.

## Progress queries

```sql
-- Personal Best: highest finished Run on a Game
SELECT coalesce(max(score), 0) AS personal_best
FROM runs WHERE player_id = $1 AND game_id = $2 AND status = 'finished';

-- Mastery: share of the Game's Answers ever found (any Run, including abandoned)
WITH total AS (
  SELECT count(*) AS n FROM answers a JOIN prompts p ON p.id = a.prompt_id WHERE p.game_id = $2
), found AS (
  SELECT count(DISTINCT ge.matched_answer_id) AS n
  FROM guess_events ge JOIN answers a ON a.id = ge.matched_answer_id
  WHERE ge.player_id = $1 AND ge.game_id = $2 AND ge.is_correct
)
SELECT found.n, total.n, round(100.0 * found.n / nullif(total.n, 0)) AS mastery_pct FROM found, total;

-- Mastery per Tier (Game page: "found 2 of 3 deep")
SELECT a.tier, count(*) AS total, count(f.answer_id) AS found
FROM answers a JOIN prompts p ON p.id = a.prompt_id
LEFT JOIN (SELECT DISTINCT matched_answer_id AS answer_id FROM guess_events
           WHERE player_id = $1 AND game_id = $2 AND is_correct) f ON f.answer_id = a.id
WHERE p.game_id = $2 GROUP BY a.tier;

-- Staleness input: earlier Runs in which this Answer scored on this Prompt
SELECT count(DISTINCT run_id) FROM guess_events
WHERE player_id = $1 AND prompt_id = $2 AND matched_answer_id = $3 AND is_correct AND run_id <> $4;
```

These are sketches; `lib/progress.ts` (F07) implements them with two refinements:
- Answers are counted only through a Game the caller owns (`games.player_id`) or a public Game (`games.visibility = 'public'`, F22), so another Player's private `gameId` reads 0 of 0. Guesses and Runs are always the caller's own.
- The Mastery percentage rounds **down**, so 100% means every Answer was found.

## Continuous aggregate for the stats chart (Tiger Data showcase)

Built in F07: `db/migrations/20261004T0316_player_game_daily.sql`, read through `dailyStats()` in `lib/progress.ts`.

```sql
CREATE MATERIALIZED VIEW player_game_daily
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket('1 day', created_at, 'America/Vancouver') AS day, player_id, game_id,
       count(*)                                         AS guesses,
       count(*) FILTER (WHERE is_correct)               AS correct,
       avg(ms_into_prompt) FILTER (WHERE is_correct)    AS avg_ms_to_correct
FROM guess_events
GROUP BY day, player_id, game_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('player_game_daily',
  start_offset => INTERVAL '30 days', end_offset => INTERVAL '1 minute', schedule_interval => INTERVAL '5 minutes');

CREATE INDEX player_game_daily_lookup ON player_game_daily (player_id, game_id, day);
```

- **`materialized_only = false`** (real-time aggregation): rows newer than the last refresh are computed from `guess_events` at query time, so a Run just played shows on the chart without waiting for the 5-minute policy.
- **Vancouver days:** UTC days would split an evening of play at 5 pm local time.
- **`WITH NO DATA`:** migrations run in a transaction; the policy fills the view in.
- **Never refresh it by hand with a NULL end.** `refresh_continuous_aggregate('player_game_daily', NULL, NULL)` materializes today, and guesses made later today stay hidden until tomorrow. End the window at `now() - interval '1 minute'`, like the policy does.

This powers an "accuracy and speed over time" chart on the Game page (F11). It isn't needed for the core loop.

## Social tables (F21, ADR-0005)

Migration: `db/migrations/20261004T1015_social.sql`. Code: `lib/social/`. Behaviour (XP table, Levels, Streak, Badges, Leaderboards, API): [`social.md`](./social.md).

**Privacy changes here.** Everything above stays private to its Player. These tables, the Profile columns on `players`, and `runs` on **public** Games are read across Players by the Profile and Leaderboard queries. Nothing in a Module (names, files, Prompts, private-Game scores) is.

```sql
-- Profile columns, filled lazily by ensureProfile() (Clerk username/name/email, de-duplicated)
ALTER TABLE players
  ADD COLUMN username      text CHECK (username ~ '^[a-z0-9_]{3,20}$'),          -- unique, stored lowercase
  ADD COLUMN display_name  text CHECK (char_length(display_name) BETWEEN 1 AND 40),
  ADD COLUMN image_url     text,                                                 -- Clerk photo
  ADD COLUMN avatar        text NOT NULL DEFAULT 'anglerfish',                   -- pixel avatar id (AVATARS in lib/social/types.ts)
  ADD COLUMN use_photo     boolean NOT NULL DEFAULT false,                       -- show image_url instead of the avatar
  ADD COLUMN bio           text CHECK (char_length(bio) <= 160),
  ADD COLUMN banner        text;                                                 -- optional banner theme id
CREATE UNIQUE INDEX players_username ON players (username);
-- plus text_pattern_ops indexes on username and lower(display_name) for prefix search

CREATE TABLE xp_events (                    -- hypertable, 30-day chunks
  at         timestamptz NOT NULL DEFAULT now(),
  player_id  text NOT NULL,                 -- no FK: an event log, like guess_events
  amount     integer NOT NULL CHECK (amount BETWEEN 1 AND 10000),
  reason     text NOT NULL,                 -- run_finished | topic_passed | topic_read | course_finished | daily_played
  ref        text NOT NULL                  -- run id, '<course>:<topic n>', course slug, Vancouver day
);
CREATE UNIQUE INDEX xp_events_once ON xp_events (player_id, reason, ref, at);

CREATE TABLE player_badges (
  player_id  text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  badge_id   text NOT NULL,                 -- catalogue in lib/social/badges.ts
  earned_at  timestamptz NOT NULL DEFAULT now(),
  ref        text,
  PRIMARY KEY (player_id, badge_id)
);

CREATE TABLE friendships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester     text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  addressee     text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status        text NOT NULL CHECK (status IN ('pending','accepted')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz,                -- set on accept; decline/remove delete the row
  CHECK (requester <> addressee)
);
CREATE UNIQUE INDEX friendships_pair ON friendships (least(requester, addressee), greatest(requester, addressee));
```

**XP idempotency.** Each event (a Run, a Topic, a Daily day) earns XP once: `(player_id, reason, ref)` identifies it. A hypertable's unique index must include its time column, so that triple can't be a constraint. `awardXp` takes a per-Player advisory transaction lock (`pg_advisory_xact_lock(727002, hashtext(player_id))`) and inserts only if no row with the triple exists; `xp_events_once` (with `at`) is a safety net for callers that pass a deterministic time, such as a Run's `finished_at`.

### Continuous aggregates over `xp_events`

Both are real-time (`materialized_only = false`), created `WITH NO DATA`, and refreshed every 5 minutes up to `now() - 1 minute`. As with `player_game_daily`, never refresh them by hand with a NULL end.

```sql
-- Heatmap: Vancouver days. Policy window 400 days (covers the 53-week grid).
CREATE MATERIALIZED VIEW player_activity_daily WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket('1 day', at, 'America/Vancouver') AS day, player_id,
       sum(amount)::bigint AS xp, count(*) FILTER (WHERE reason = 'run_finished') AS runs
FROM xp_events GROUP BY day, player_id WITH NO DATA;

-- Weekly XP leaderboard: Vancouver weeks starting Monday (time_bucket's default origin 2000-01-03 is a Monday). Window 60 days.
CREATE MATERIALIZED VIEW player_xp_weekly WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket('7 days', at, 'America/Vancouver') AS week, player_id, sum(amount)::bigint AS xp
FROM xp_events GROUP BY week, player_id WITH NO DATA;
```

The heatmap query gap-fills with `time_bucket_gapfill('1 day', day, 'America/Vancouver', lo, hi)` over the aggregate, so days without play come back as 0 (`lib/social/activity.ts`).

**Real-time caveat for tests and backfills:** rows inserted for a day the policy has already materialized stay hidden until the next refresh of that range. Today (and this week) are always computed live. `npm run social:backfill` refreshes both aggregates after inserting past XP; `lib/social/social.db.test.ts` commits its heatmap fixture and refreshes outside a transaction.

### Compression on `guess_events`

`add_compression_policy('guess_events', compress_after => 30 days)`. Compression itself was enabled in the init migration (`segmentby player_id`, `orderby created_at DESC`); this schedules it. TimescaleDB 2.11+ allows INSERT/UPDATE/DELETE on compressed chunks, so the Game delete route and Mastery/Staleness queries are unaffected, and `player_game_daily` only refreshes the last 30 days. Tiger Cloud `stormhacks-dev` runs TimescaleDB 2.30.

## Course tables (F22)

Migration: `db/migrations/20261004T1100_courses.sql`. Code: `lib/courses/`. Behaviour (unlock rule, Pass, seed, API): [`courses.md`](./courses.md).

**Privacy changes here.** Any signed-in Player can start a Run on a `games.visibility = 'public'` Game (`createRun`). Its Runs, `guess_events`, Personal Best and Mastery stay per Player. The Course catalogue, Topic readings (the system Player's Source Pages) and resources are readable by anyone through the Courses API only, signed out included (Q24).

```sql
ALTER TABLE games ADD COLUMN visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public'));
INSERT INTO players (id) VALUES ('system');   -- owns the Course Modules and Games; never has a Profile

CREATE TABLE courses (
  id uuid PRIMARY KEY,                     -- deterministic (seed)
  slug text NOT NULL UNIQUE, title text NOT NULL, level text NOT NULL, summary text NOT NULL, description text NOT NULL,
  banner text, module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  sort integer NOT NULL DEFAULT 0, published boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE course_topics (
  id uuid PRIMARY KEY, course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position integer NOT NULL,               -- Topic number (UNIQUE per Course, deferrable so a seed can reorder)
  slug text NOT NULL,                      -- UNIQUE per Course
  title text NOT NULL, summary text NOT NULL, minutes integer,
  source_document_id uuid NOT NULL REFERENCES source_documents(id) DEFERRABLE INITIALLY DEFERRED,   -- the reading
  resources jsonb NOT NULL DEFAULT '[]'    -- [{ title, url, source? }]
);
CREATE TABLE topic_games (                 -- a Topic's practice Games, one per Mode
  topic_id uuid NOT NULL REFERENCES course_topics(id) ON DELETE CASCADE, mode text NOT NULL,
  game_id uuid NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  PRIMARY KEY (topic_id, mode)
);
CREATE TABLE topic_progress (              -- written by "mark as read" and by every finished Run on a Topic Game
  player_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES course_topics(id) ON DELETE CASCADE,
  read_at timestamptz, passed_at timestamptz,                               -- first Pass
  passed_run_id uuid REFERENCES runs(id) ON DELETE SET NULL, passed_mode text,
  modes jsonb NOT NULL DEFAULT '{}',       -- { "<mode>": { "best": int, "passed": bool, "runs": int } }
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, topic_id)
);
```

Unlocks aren't stored. Topic N+1 is unlocked when the Player's `topic_progress` row for Topic N has `passed_at` (`lockedTopics()` in `lib/courses/rules.ts`). Topic and Course XP and Badges live in `xp_events` and `player_badges`, written by F21's hooks: `topic_passed` (ref `<course>:<n>`), `course_finished` (ref `<course>`) and `topic_read` (ref `<course>:<n>`).

## Daily Dive tables (F23)

Migration: `db/migrations/20261004T1200_daily_dive.sql`. Code: `lib/daily/`. Behaviour (day assignment, Counted Runs, Reveal crowd stats, seed, generation, API): [`daily-dive.md`](./daily-dive.md).

```sql
CREATE TABLE daily_puzzles (
  number integer PRIMARY KEY,               -- "Daily #N"
  day date UNIQUE,                          -- America/Vancouver day; null while in the pool
  theme text NOT NULL, title text NOT NULL,
  game_id uuid NOT NULL UNIQUE REFERENCES games(id),   -- system-owned Dive Game, private until live
  prompt_ids uuid[] NOT NULL,               -- the 7 Prompts in play order (fact sheet page order)
  status text NOT NULL CHECK (status IN ('pool','scheduled','live')),
  source text NOT NULL CHECK (source IN ('seed','gemini')),
  live_at timestamptz, top10_awarded_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'pool') = (day IS NULL))
);

-- Hypertables partitioned by the date `day`, so the unique key can include the time column
CREATE TABLE daily_results (               -- one Counted Run per Player per day
  day date NOT NULL, player_id text NOT NULL, number integer NOT NULL, run_id uuid NOT NULL,
  score integer NOT NULL, finished_at timestamptz NOT NULL,
  tiers jsonb NOT NULL,                     -- per Prompt: "common".."rare" or null (miss); the share grid
  UNIQUE (player_id, day)
);
CREATE TABLE daily_answer_finds (          -- Answers each Counted Run found (from its guess_events)
  day date NOT NULL, player_id text NOT NULL, answer_id uuid NOT NULL,
  UNIQUE (player_id, day, answer_id)
);

-- Real-time continuous aggregates (policy: hourly, up to 1 day ago; today is computed live)
daily_score_stats  (day, players, pct = percentile_agg(score), hist = histogram(score, 0, 1000, 20), top)
daily_answer_rates (day, answer_id, finds)
```

**Functions and the job.** `claim_daily_puzzle(day) → number` (per-day advisory lock 727004; the scheduled puzzle, else the lowest pool puzzle with `SKIP LOCKED`; sets it live and its Game public; then `award_daily_top10(day)`), `award_daily_top10(today) → int` (the `daily-top-10` Badge for each finished day's `rank() <= 10`, once per day via `top10_awarded_at`), and the procedure `assign_daily_puzzle(job_id, config)` registered with `add_job` to run daily at Vancouver midnight (`fixed_schedule`, `timezone => 'America/Vancouver'`).

**Privacy.** A Daily puzzle's Game is private (unplayable by anyone) while in the pool or scheduled, so future puzzles can't be played early. Once live, it's a Public Game: its fact sheet pages reach Players only through the Reveal's Evidence. Crowd stats expose counts and percentages, never another Player's guesses.
