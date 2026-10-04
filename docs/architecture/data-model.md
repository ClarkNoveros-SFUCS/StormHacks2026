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
Run    1──7 Run Prompt N──1 Prompt
guess_events  (hypertable: every guess ever made, the source for Mastery and Staleness)
```

## Conventions

- **Client:** `postgres` (porsager) from `lib/db.ts`, server only. Plain SQL, no ORM.
- **Migrations:** `db/migrations/<UTC timestamp>_<name>.sql`, e.g. `20261003T1530_init.sql`. Use timestamps, not sequence numbers, so parallel branches never collide. `scripts/migrate.mjs` applies files in name order and records them in `schema_migrations`.
- **Ids:** `uuid DEFAULT gen_random_uuid()`. The Player id is the Clerk user id (`text`).
- **Time:** `timestamptz` everywhere.

## Schema (initial migration)

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
  stage_path  text,                              -- '<playerId>/<documentId>/<filename>' once PUT succeeds
  status      text NOT NULL CHECK (status IN ('uploaded','parsing','parsed','failed')),
  error       text,
  page_count  integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE source_pages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id  uuid NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  page_index          integer NOT NULL,          -- 0-based, as Snowflake returns it
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
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE game_sources (
  game_id             uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  source_document_id  uuid NOT NULL REFERENCES source_documents(id) ON DELETE RESTRICT,  -- enforces "can't delete a file a Game uses"
  PRIMARY KEY (game_id, source_document_id)
);

CREATE TABLE prompts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id             uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  source_document_id  uuid NOT NULL REFERENCES source_documents(id),
  kind                text NOT NULL CHECK (kind IN ('open','cloze','definition_to_term','ordered_recall','odd_one_out')),
  text                text NOT NULL,
  tier                text CHECK (tier IN ('common','solid','deep','rare')),   -- single-answer Prompts only
  hint                text,                                                     -- single-answer only; null = no Hint button
  explanation         text,
  items               jsonb,          -- ordered_recall: string[] in the correct order
  options             jsonb,          -- odd_one_out: string[4]
  evidence_page_id    uuid REFERENCES source_pages(id),   -- ordered_recall / odd_one_out
  CHECK ((kind = 'open') = (tier IS NULL))
);

-- Every Prompt has ≥1 Answer row: Open = 4–15, single-answer kinds = exactly 1.
-- ordered_recall's single Answer has canonical = 'correct order'; odd_one_out's is the correct option.
-- That makes Mastery a uniform count over answers.
CREATE TABLE answers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id         uuid NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  canonical         text NOT NULL,
  tier              text NOT NULL CHECK (tier IN ('common','solid','deep','rare')),  -- single-answer: copy of prompt.tier
  rarity_rank       integer,        -- Open only: 1 = most obvious
  exact_only        boolean NOT NULL DEFAULT false,
  evidence_page_id  uuid REFERENCES source_pages(id),
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
  current_position  smallint NOT NULL DEFAULT 1,
  score             integer NOT NULL DEFAULT 0,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz
);
CREATE INDEX runs_best ON runs (player_id, game_id, score DESC) WHERE status = 'finished';

CREATE TABLE run_prompts (
  run_id       uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  position     smallint NOT NULL CHECK (position BETWEEN 1 AND 7),
  prompt_id    uuid NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  started_at   timestamptz,
  deadline_at  timestamptz,           -- moves 3 s earlier per wrong typed guess
  ended_at     timestamptz,
  outcome      text CHECK (outcome IN ('correct','wrong','timeout')),
  answer_id    uuid REFERENCES answers(id),
  hint_used    boolean NOT NULL DEFAULT false,
  points       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, position)
);

-- Every guess, correct or not. Append-only event log, partitioned by time.
-- No foreign keys: it's an event log, and deleting a Game leaves harmless orphans
-- (progress queries join through answers, so orphans never count).
CREATE TABLE guess_events (
  created_at         timestamptz NOT NULL DEFAULT now(),
  player_id          text NOT NULL,
  game_id            uuid NOT NULL,
  run_id             uuid NOT NULL,
  prompt_id          uuid NOT NULL,
  position           smallint NOT NULL,
  raw_text           text NOT NULL,            -- one-shot kinds: JSON of the submitted order/option
  normalized         text,
  matched_answer_id  uuid,
  match_method       text NOT NULL CHECK (match_method IN ('exact','typo','ambiguous','none','choice')),
  distance           smallint,
  is_correct         boolean NOT NULL,
  points             integer NOT NULL DEFAULT 0,
  ms_into_prompt     integer NOT NULL,
  hint_used          boolean NOT NULL DEFAULT false,
  tier               text                      -- tier of the matched Answer, for stats
) WITH (
  tsdb.hypertable,
  tsdb.partition_column = 'created_at',
  tsdb.segmentby = 'player_id',
  tsdb.orderby = 'created_at DESC'
);
CREATE INDEX guess_events_recall ON guess_events (player_id, prompt_id, matched_answer_id) WHERE is_correct;
CREATE INDEX guess_events_game   ON guess_events (player_id, game_id) WHERE is_correct;
```

The `WITH (tsdb.hypertable, …)` syntax comes from the Tiger Data quickstart. Check the `partition_column` option name against the current TimescaleDB docs when writing the migration. If it's rejected, create the table normally and call `SELECT create_hypertable('guess_events', by_range('created_at'));`.

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

## Optional: continuous aggregate for a stats panel (Tiger Data showcase)

```sql
CREATE MATERIALIZED VIEW player_game_daily WITH (timescaledb.continuous) AS
SELECT time_bucket('1 day', created_at) AS day, player_id, game_id,
       count(*)                                         AS guesses,
       count(*) FILTER (WHERE is_correct)               AS correct,
       avg(ms_into_prompt) FILTER (WHERE is_correct)    AS avg_ms_to_correct
FROM guess_events
GROUP BY day, player_id, game_id;

SELECT add_continuous_aggregate_policy('player_game_daily',
  start_offset => INTERVAL '30 days', end_offset => INTERVAL '1 minute', schedule_interval => INTERVAL '5 minutes');
```

This powers an "accuracy and speed over time" chart on the Game page. It isn't needed for the core loop.
