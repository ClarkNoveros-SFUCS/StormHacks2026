-- F07: daily guess stats per Player per Game, for the Game page's accuracy-over-time chart.
-- A continuous aggregate over the guess_events hypertable: TimescaleDB keeps it up to date in
-- the background, so the chart reads a few rows per day instead of every guess.
--
-- * Days are Vancouver days (StormHacks is at SFU). UTC days would split an evening of play
--   in two at 5 pm.
-- * materialized_only = false (real-time aggregation): rows newer than the last refresh are
--   computed from guess_events at query time, so a Run shows up on the chart right away.
-- * WITH NO DATA, because migrations run inside a transaction. The policy fills it in.
-- * Never refresh it by hand with a NULL end (refresh_continuous_aggregate(..., NULL, NULL)):
--   that materializes today, and later guesses today stay hidden until tomorrow. Use
--   now() - interval '1 minute' as the end, like the policy.

CREATE MATERIALIZED VIEW player_game_daily
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket('1 day', created_at, 'America/Vancouver') AS day,
       player_id,
       game_id,
       count(*)                                      AS guesses,
       count(*) FILTER (WHERE is_correct)            AS correct,
       avg(ms_into_prompt) FILTER (WHERE is_correct) AS avg_ms_to_correct
FROM guess_events
GROUP BY day, player_id, game_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('player_game_daily',
  start_offset      => INTERVAL '30 days',
  end_offset        => INTERVAL '1 minute',
  schedule_interval => INTERVAL '5 minutes');

CREATE INDEX player_game_daily_lookup ON player_game_daily (player_id, game_id, day);
