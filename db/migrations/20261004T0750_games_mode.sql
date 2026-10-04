-- F13 (#21), shipped with F04 (#4): every Game has exactly one Game Mode, chosen at creation
-- and never changed (ADR-0004, docs/architecture/game-modes.md). Existing Games become Dive
-- Games. Widen the CHECK when a Mode is added, and add it to MODES in lib/modes/index.ts.
ALTER TABLE games ADD COLUMN mode text NOT NULL DEFAULT 'dive' CHECK (mode IN ('dive'));
