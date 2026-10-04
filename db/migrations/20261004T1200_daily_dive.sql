-- F23 (#36): the Daily Dive. Additive only: new tables, hypertables, continuous aggregates,
-- functions and one TimescaleDB job. Spec: docs/architecture/daily-dive.md, data-model.md.
--
-- Each Daily puzzle is a Dive Game owned by the system Player in its "Daily Dive" Module,
-- built from a fact sheet (a parsed system Source Document: page N backs Prompt N, ADR-0006).
-- Its Game stays private until the puzzle goes live on its day, then it's public.

-- ---------------------------------------------------------------------------------------
-- Puzzles. 'pool': written but not given a day yet. 'scheduled': has a future day.
-- 'live': its day has come (claimed by the job or the lazy path); its Game is public.
CREATE TABLE daily_puzzles (
  number            integer PRIMARY KEY CHECK (number >= 1),   -- "Daily #N"
  day               date UNIQUE,                               -- America/Vancouver day; null in the pool
  theme             text NOT NULL,
  title             text NOT NULL,
  game_id           uuid NOT NULL UNIQUE REFERENCES games(id),
  prompt_ids        uuid[] NOT NULL CHECK (cardinality(prompt_ids) = 7),  -- play order (fact sheet page order)
  status            text NOT NULL CHECK (status IN ('pool', 'scheduled', 'live')),
  source            text NOT NULL CHECK (source IN ('seed', 'gemini')),
  live_at           timestamptz,
  top10_awarded_at  timestamptz,                               -- daily-top-10 Badges handed out (day over)
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'pool') = (day IS NULL))
);
CREATE INDEX daily_puzzles_pool ON daily_puzzles (number) WHERE status = 'pool';

-- ---------------------------------------------------------------------------------------
-- Counted Runs: one row per Player per day, the first Run on that day's puzzle that finished
-- on that day. Partitioned by `day` (a date), so the unique key can include the time column
-- and enforce "one counted Run per Player per day" as a real constraint.
CREATE TABLE daily_results (
  day          date NOT NULL,
  player_id    text NOT NULL,
  number       integer NOT NULL,                  -- the puzzle
  run_id       uuid NOT NULL,
  score        integer NOT NULL CHECK (score >= 0),
  finished_at  timestamptz NOT NULL,
  tiers        jsonb NOT NULL,                    -- per Prompt in play order: "common"…"rare", or null (missed); the share grid
  UNIQUE (player_id, day)
);
SELECT create_hypertable('daily_results', by_range('day', INTERVAL '28 days'));
CREATE INDEX daily_results_board ON daily_results (day, score DESC, finished_at);

-- The Answers each counted Run found (copied from its guess_events when it's counted), for
-- the Reveal's "% of today's players found this".
CREATE TABLE daily_answer_finds (
  day        date NOT NULL,
  player_id  text NOT NULL,
  answer_id  uuid NOT NULL,
  UNIQUE (player_id, day, answer_id)
);
SELECT create_hypertable('daily_answer_finds', by_range('day', INTERVAL '28 days'));

-- ---------------------------------------------------------------------------------------
-- Real-time continuous aggregates (fresh results show at once; the policy materializes
-- older days). Days are already Vancouver dates, so no time zone here.
--   hist = histogram(score, 0, 1000, 20): [below 0, 0–49, 50–99, …, 950–999, 1000+]
--   pct  = toolkit percentile_agg: approx_percentile / approx_percentile_rank read it.
CREATE MATERIALIZED VIEW daily_score_stats
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 day', day) AS day,
       count(*)                      AS players,
       percentile_agg(score)         AS pct,
       histogram(score, 0, 1000, 20) AS hist,
       max(score)                    AS top
FROM daily_results
GROUP BY time_bucket(INTERVAL '1 day', day)
WITH NO DATA;
SELECT add_continuous_aggregate_policy('daily_score_stats',
  start_offset      => INTERVAL '60 days',
  end_offset        => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 hour');

CREATE MATERIALIZED VIEW daily_answer_rates
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 day', day) AS day,
       answer_id,
       count(*) AS finds
FROM daily_answer_finds
GROUP BY time_bucket(INTERVAL '1 day', day), answer_id
WITH NO DATA;
SELECT add_continuous_aggregate_policy('daily_answer_rates',
  start_offset      => INTERVAL '60 days',
  end_offset        => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 hour');
CREATE INDEX daily_answer_rates_day ON daily_answer_rates (day);

-- ---------------------------------------------------------------------------------------
-- daily-top-10 Badges for every live day before `today` that hasn't been handed out yet:
-- rank() over score desc, finish time asc (the leaderboard's order), place <= 10. The UPDATE
-- marks each day once, so concurrent callers never double-award (player_badges ignores
-- repeats anyway). Returns the number of Badges granted.
CREATE FUNCTION award_daily_top10(today date) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  d date;
  granted integer := 0;
  k integer;
BEGIN
  FOR d IN
    UPDATE daily_puzzles SET top10_awarded_at = now()
     WHERE day < today AND status = 'live' AND top10_awarded_at IS NULL
    RETURNING day
  LOOP
    INSERT INTO player_badges (player_id, badge_id, ref)
    SELECT r.player_id, 'daily-top-10', d::text
      FROM (SELECT player_id, rank() OVER (ORDER BY score DESC, finished_at ASC) AS place
              FROM daily_results WHERE day = d) r
      JOIN players p ON p.id = r.player_id
     WHERE r.place <= 10
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS k = ROW_COUNT;
    granted := granted + k;
  END LOOP;
  RETURN granted;
END $$;

-- Gives `target` its puzzle and makes it live: the puzzle already scheduled for that day,
-- else the lowest-numbered pool puzzle. Race-safe: a per-day advisory lock serializes
-- claims for the same day (the UNIQUE (day) index is the backstop) and SKIP LOCKED keeps two
-- different days from taking the same pool puzzle. Also hands out earlier days' Top 10
-- Badges. Returns the puzzle number, or null when the pool is empty. Used by both the
-- midnight job and the app's lazy path (lib/daily/queries.ts).
CREATE FUNCTION claim_daily_puzzle(target date) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(727004, hashtext(target::text));
  SELECT number INTO n FROM daily_puzzles WHERE day = target;
  IF n IS NULL THEN
    SELECT number INTO n FROM daily_puzzles
     WHERE status = 'pool' ORDER BY number LIMIT 1 FOR UPDATE SKIP LOCKED;
    IF n IS NULL THEN
      RETURN NULL;
    END IF;
    UPDATE daily_puzzles SET day = target, status = 'scheduled' WHERE number = n;
  END IF;
  UPDATE daily_puzzles SET status = 'live', live_at = coalesce(live_at, now())
   WHERE number = n AND status <> 'live';
  UPDATE games SET visibility = 'public'
   WHERE id = (SELECT game_id FROM daily_puzzles WHERE number = n) AND visibility <> 'public';
  PERFORM award_daily_top10(target);
  RETURN n;
END $$;

-- The TimescaleDB job (user-defined action): at every Vancouver midnight, claim the new day's
-- puzzle in the database. config may set {"day": "YYYY-MM-DD"} (tests, backfills).
CREATE PROCEDURE assign_daily_puzzle(job_id integer, config jsonb)
LANGUAGE plpgsql AS $$
DECLARE
  target date := coalesce((config ->> 'day')::date, (now() AT TIME ZONE 'America/Vancouver')::date);
  n integer;
BEGIN
  n := claim_daily_puzzle(target);
  IF n IS NULL THEN
    RAISE WARNING 'assign_daily_puzzle (job %): the Daily pool is empty, no puzzle for %', job_id, target;
  ELSE
    RAISE LOG 'assign_daily_puzzle (job %): Daily #% is live for %', job_id, n, target;
  END IF;
END $$;

SELECT add_job('assign_daily_puzzle', INTERVAL '1 day',
  config         => '{}'::jsonb,
  initial_start  => ((now() AT TIME ZONE 'America/Vancouver')::date + 1)::timestamp AT TIME ZONE 'America/Vancouver',
  fixed_schedule => true,
  timezone       => 'America/Vancouver');
