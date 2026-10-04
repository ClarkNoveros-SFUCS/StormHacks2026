-- F22 (#35): public Games and Courses. Additive only: a new column with a default, a system
-- Player row and new tables, so code on main keeps working against the same database.
-- Spec: docs/architecture/courses.md, data-model.md.

-- ---------------------------------------------------------------------------------------
-- Public Games. A private Game (the default, every Module Game) is readable and playable only
-- by its owner. A public Game (Course practice Games, the Daily Dive) can be played by any
-- signed-in Player; Runs, guess_events, Personal Best and Mastery stay per Player. Reading
-- the Module or its files stays owner-only either way.
ALTER TABLE games
  ADD COLUMN visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public'));
CREATE INDEX games_public ON games (id) WHERE visibility = 'public';

-- The system Player owns the Course Modules (and later the Daily Dive's). It never signs in
-- and never gets a Profile ('system' is a reserved username, lib/social/username.ts).
INSERT INTO players (id) VALUES ('system') ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------------------
-- Courses: public, seeded learning paths (npm run db:seed:courses). Each Course is backed by
-- one Module of the system Player; each Topic's reading is a parsed Source Document in it.
CREATE TABLE courses (
  id           uuid PRIMARY KEY,                      -- deterministic (seed), from the slug
  slug         text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        text NOT NULL,
  level        text NOT NULL,                         -- 'Beginner' …, shown as a chip
  summary      text NOT NULL,                         -- one line, for the catalogue card
  description  text NOT NULL,                         -- the Course page hero
  banner       text CHECK (banner ~ '^[a-z0-9-]{1,32}$'),  -- pixel banner id for the UI
  module_id    uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  sort         integer NOT NULL DEFAULT 0,            -- catalogue order
  published    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE course_topics (
  id                  uuid PRIMARY KEY,               -- deterministic (seed), from course + topic slug
  course_id           uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position            integer NOT NULL CHECK (position >= 1),   -- Topic number: 1, 2, 3 …
  slug                text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title               text NOT NULL,
  summary             text NOT NULL,
  minutes             integer CHECK (minutes > 0),    -- reading time
  -- The reading: a parsed Source Document of the system Player; its pages are the reading's
  -- pages, so practice Prompts' Evidence points at them.
  source_document_id  uuid NOT NULL REFERENCES source_documents(id) DEFERRABLE INITIALLY DEFERRED,
  resources           jsonb NOT NULL DEFAULT '[]',    -- [{ title, url, kind? }]
  UNIQUE (course_id, position) DEFERRABLE INITIALLY DEFERRED,  -- the seed may reorder Topics
  UNIQUE (course_id, slug)
);

-- A Topic's practice Games: at most one per Game Mode. The Game is public and system-owned.
CREATE TABLE topic_games (
  topic_id  uuid NOT NULL REFERENCES course_topics(id) ON DELETE CASCADE,
  mode      text NOT NULL,
  game_id   uuid NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  PRIMARY KEY (topic_id, mode)
);

-- One row per (Player, Topic) once they've read it or finished a Run on one of its Games.
-- `modes` is the Player's record per Game Mode: { "<mode>": { "best": int, "passed": bool,
-- "runs": int } }, updated in the transaction that finishes each Run.
CREATE TABLE topic_progress (
  player_id      text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  topic_id       uuid NOT NULL REFERENCES course_topics(id) ON DELETE CASCADE,
  read_at        timestamptz,                         -- "mark as read" (optional; gates nothing)
  passed_at      timestamptz,                         -- first Pass of any of its Games
  passed_run_id  uuid REFERENCES runs(id) ON DELETE SET NULL,
  passed_mode    text,
  modes          jsonb NOT NULL DEFAULT '{}',
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, topic_id)
);
CREATE INDEX topic_progress_topic ON topic_progress (topic_id) WHERE passed_at IS NOT NULL;
