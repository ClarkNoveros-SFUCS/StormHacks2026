-- F20 (#33): Game Modes beyond Dive. Additive only: widened CHECKs and new nullable columns,
-- so code on main keeps working against the same database.
-- Spec: docs/architecture/game-modes.md, run-and-scoring.md, data-model.md.

-- Modes: Apogee, Leap, Pairs and Blitz, plus Arena reserved (not built yet). Keep in step
-- with MODES in lib/modes/index.ts.
ALTER TABLE games DROP CONSTRAINT games_mode_check;
ALTER TABLE games ADD CONSTRAINT games_mode_check
  CHECK (mode IN ('dive', 'apogee', 'leap', 'pairs', 'blitz', 'arena'));

-- New Prompt kinds. multiple_choice (Leap): `options` holds the 4 options, the one Answer row is
-- the correct option. true_false (Blitz): `is_true` is the statement's truth value, the one
-- Answer row is 'True' or 'False'. Both carry a tier like every single-answer kind (prompts_check).
ALTER TABLE prompts DROP CONSTRAINT prompts_kind_check;
ALTER TABLE prompts ADD CONSTRAINT prompts_kind_check
  CHECK (kind IN ('open', 'cloze', 'definition_to_term', 'ordered_recall', 'odd_one_out',
                  'multiple_choice', 'true_false'));
ALTER TABLE prompts ADD COLUMN is_true boolean;
ALTER TABLE prompts ADD CONSTRAINT prompts_is_true_check CHECK ((kind = 'true_false') = (is_true IS NOT NULL));

-- A Run is 7 Prompts in Dive, 10 in Leap, 12 pairs in Pairs and a deck of up to 120 statements
-- in Blitz, so positions are no longer capped at 7.
ALTER TABLE run_prompts DROP CONSTRAINT run_prompts_position_check;
ALTER TABLE run_prompts ADD CONSTRAINT run_prompts_position_check CHECK (position >= 1);

-- Per-Mode Run state the server owns (hearts, streaks, Board clocks, Blitz's clock, outcome).
-- Null for Dive and Apogee, which keep everything in runs and run_prompts.
ALTER TABLE runs ADD COLUMN mode_state jsonb;
