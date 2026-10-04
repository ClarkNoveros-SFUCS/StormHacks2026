-- Initial schema. Spec: docs/architecture/data-model.md

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;   -- levenshtein_less_equal for answer matching
CREATE EXTENSION IF NOT EXISTS timescaledb;     -- already installed on Tiger Cloud; no-op there

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
CREATE INDEX modules_player ON modules (player_id);

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
CREATE INDEX source_documents_module ON source_documents (module_id);

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
CREATE INDEX games_module ON games (module_id);

-- Foreign keys that cross from the games branch into the source_documents branch are
-- DEFERRABLE INITIALLY DEFERRED: checked at commit, after a Module or Player delete has
-- cascaded down both branches. Immediate (RESTRICT or NO ACTION) checks fire mid-cascade
-- and refuse the delete. Deleting a file a Game still uses is refused at commit.
CREATE TABLE game_sources (
  game_id             uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  source_document_id  uuid NOT NULL REFERENCES source_documents(id) DEFERRABLE INITIALLY DEFERRED,  -- can't delete a file a Game uses
  PRIMARY KEY (game_id, source_document_id)
);
CREATE INDEX game_sources_document ON game_sources (source_document_id);

CREATE TABLE prompts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id             uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  source_document_id  uuid NOT NULL REFERENCES source_documents(id) DEFERRABLE INITIALLY DEFERRED,
  kind                text NOT NULL CHECK (kind IN ('open','cloze','definition_to_term','ordered_recall','odd_one_out')),
  text                text NOT NULL,
  tier                text CHECK (tier IN ('common','solid','deep','rare')),   -- single-answer Prompts only
  hint                text,                                                     -- single-answer only; null = no Hint button
  explanation         text,
  items               jsonb,          -- ordered_recall: string[] in the correct order
  options             jsonb,          -- odd_one_out: string[4]
  evidence_page_id    uuid REFERENCES source_pages(id) DEFERRABLE INITIALLY DEFERRED,   -- ordered_recall / odd_one_out
  CHECK ((kind = 'open') = (tier IS NULL))
);
CREATE INDEX prompts_game ON prompts (game_id);

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
  evidence_page_id  uuid REFERENCES source_pages(id) DEFERRABLE INITIALLY DEFERRED,
  evidence_quote    text
);
CREATE INDEX answers_prompt ON answers (prompt_id);

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
);
-- create_hypertable + compression settings work on every TimescaleDB 2.13+,
-- unlike the newer CREATE TABLE ... WITH (tsdb.hypertable) syntax.
SELECT create_hypertable('guess_events', by_range('created_at'));
ALTER TABLE guess_events SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'player_id',
  timescaledb.compress_orderby = 'created_at DESC'
);
CREATE INDEX guess_events_recall ON guess_events (player_id, prompt_id, matched_answer_id) WHERE is_correct;
CREATE INDEX guess_events_game   ON guess_events (player_id, game_id) WHERE is_correct;
