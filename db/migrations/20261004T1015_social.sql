-- F21 (#34): the social layer (ADR-0005, docs/architecture/social.md). Additive only.
-- Public Profile columns on players, the XP event log (hypertable), badges, friendships,
-- two continuous aggregates (activity heatmap, weekly XP leaderboard), a compression policy
-- on guess_events, and a one-off XP backfill for Runs finished before this migration.

-- ---------------------------------------------------------------------------------------
-- Profile. Filled lazily by ensureProfile() in lib/social/profile.ts (from Clerk, or derived).
-- Usernames are stored lowercase, so a plain unique index is case-insensitive in practice.
ALTER TABLE players
  ADD COLUMN username      text CHECK (username ~ '^[a-z0-9_]{3,20}$'),
  ADD COLUMN display_name  text CHECK (char_length(display_name) BETWEEN 1 AND 40),
  ADD COLUMN image_url     text,                                   -- Clerk photo
  ADD COLUMN avatar        text NOT NULL DEFAULT 'anglerfish' CHECK (avatar ~ '^[a-z0-9-]{1,32}$'),  -- pixel avatar id (AVATARS)
  ADD COLUMN use_photo     boolean NOT NULL DEFAULT false,         -- show image_url instead of the pixel avatar
  ADD COLUMN bio           text CHECK (char_length(bio) <= 160),
  ADD COLUMN banner        text CHECK (banner ~ '^[a-z0-9-]{1,32}$'); -- optional banner theme id
CREATE UNIQUE INDEX players_username ON players (username);
-- Prefix search ("ant" → anton_f): text_pattern_ops lets LIKE 'x%' use the index under any collation
CREATE INDEX players_username_prefix ON players (username text_pattern_ops);
CREATE INDEX players_display_name_prefix ON players (lower(display_name) text_pattern_ops);

-- ---------------------------------------------------------------------------------------
-- XP: one row per award. Append-only, time-series, so a hypertable (like guess_events).
-- Idempotency: awardXp() takes a per-Player advisory lock and inserts only if no row with
-- the same (player_id, reason, ref) exists. A hypertable's unique index must contain the
-- time column, so (player_id, reason, ref) alone can't be a constraint; the unique index
-- below (with `at`) is the safety net for callers that pass a deterministic time, like a
-- Run's finished_at.
CREATE TABLE xp_events (
  at         timestamptz NOT NULL DEFAULT now(),
  player_id  text NOT NULL,
  amount     integer NOT NULL CHECK (amount BETWEEN 1 AND 10000),
  reason     text NOT NULL CHECK (reason ~ '^[a-z_]{1,32}$'),   -- run_finished, topic_passed, course_finished, daily_played, topic_read
  ref        text NOT NULL                                      -- what earned it: run id, '<course>:<topic>', Vancouver day …
);
SELECT create_hypertable('xp_events', by_range('at', INTERVAL '30 days'));
CREATE UNIQUE INDEX xp_events_once ON xp_events (player_id, reason, ref, at);
CREATE INDEX xp_events_player ON xp_events (player_id, at DESC);

-- Badges: the catalogue lives in code (BADGES in lib/social/badges.ts); this is who has what.
CREATE TABLE player_badges (
  player_id  text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  badge_id   text NOT NULL CHECK (badge_id ~ '^[a-z0-9-]{1,64}$'),
  earned_at  timestamptz NOT NULL DEFAULT now(),
  ref        text,                                   -- what earned it (run id, day …)
  PRIMARY KEY (player_id, badge_id)
);

-- Friends: one row per pair, whichever direction the request went. Declining or removing
-- deletes the row; only accepted rows have responded_at.
CREATE TABLE friendships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester     text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  addressee     text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status        text NOT NULL CHECK (status IN ('pending','accepted')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz,
  CHECK (requester <> addressee)
);
CREATE UNIQUE INDEX friendships_pair ON friendships (least(requester, addressee), greatest(requester, addressee));
CREATE INDEX friendships_addressee ON friendships (addressee, status);
CREATE INDEX friendships_requester ON friendships (requester, status);

-- ---------------------------------------------------------------------------------------
-- Continuous aggregates over xp_events (Tiger Data showcase). Both are real-time
-- (materialized_only = false), so an award shows up immediately, and WITH NO DATA because
-- migrations run in a transaction; the policies fill them in. As with player_game_daily,
-- never refresh by hand with a NULL end: end the window at now() - interval '1 minute'.

-- Heatmap and "runs per day": Vancouver days.
CREATE MATERIALIZED VIEW player_activity_daily
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket('1 day', at, 'America/Vancouver') AS day,
       player_id,
       sum(amount)::bigint                          AS xp,
       count(*) FILTER (WHERE reason = 'run_finished') AS runs
FROM xp_events
GROUP BY day, player_id
WITH NO DATA;
-- 400 days covers the 53-week heatmap; a refresh only redoes invalidated ranges, so it stays cheap.
SELECT add_continuous_aggregate_policy('player_activity_daily',
  start_offset      => INTERVAL '400 days',
  end_offset        => INTERVAL '1 minute',
  schedule_interval => INTERVAL '5 minutes');
CREATE INDEX player_activity_daily_lookup ON player_activity_daily (player_id, day);

-- Weekly XP leaderboard: Vancouver weeks starting Monday (time_bucket's default origin
-- 2000-01-03 is a Monday).
CREATE MATERIALIZED VIEW player_xp_weekly
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket('7 days', at, 'America/Vancouver') AS week,
       player_id,
       sum(amount)::bigint AS xp
FROM xp_events
GROUP BY week, player_id
WITH NO DATA;
SELECT add_continuous_aggregate_policy('player_xp_weekly',
  start_offset      => INTERVAL '60 days',
  end_offset        => INTERVAL '1 minute',
  schedule_interval => INTERVAL '5 minutes');
CREATE INDEX player_xp_weekly_lookup ON player_xp_weekly (week, player_id);

-- ---------------------------------------------------------------------------------------
-- Compression (columnstore) for guess chunks older than 30 days. guess_events already has
-- compression enabled (segmentby player_id, orderby created_at DESC, in the init migration);
-- this only schedules it. TimescaleDB 2.11+ allows INSERT/UPDATE/DELETE on compressed
-- chunks, so the Game delete route and Staleness/Mastery queries keep working.
-- player_game_daily refreshes only the last 30 days, so it never re-reads compressed chunks.
SELECT add_compression_policy('guess_events', compress_after => INTERVAL '30 days', if_not_exists => true);

-- ---------------------------------------------------------------------------------------
-- Backfill: XP for every Run finished before this migration (same formula as
-- xpForRunSummary: floor(score / 5) clamped to 5..200), at the Run's finish time so the
-- heatmap and streak show past play. Re-runnable later with `npm run social:backfill`.
INSERT INTO xp_events (at, player_id, amount, reason, ref)
SELECT r.finished_at, r.player_id, greatest(5, least(200, floor(r.score / 5.0)::int)), 'run_finished', r.id::text
FROM runs r
WHERE r.status = 'finished' AND r.finished_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM xp_events x
                  WHERE x.player_id = r.player_id AND x.reason = 'run_finished' AND x.ref = r.id::text);

INSERT INTO player_badges (player_id, badge_id, earned_at, ref)
SELECT DISTINCT ON (r.player_id) r.player_id, 'first-dive', r.finished_at, r.id::text
FROM runs r
WHERE r.status = 'finished' AND r.finished_at IS NOT NULL
ORDER BY r.player_id, r.finished_at
ON CONFLICT DO NOTHING;
