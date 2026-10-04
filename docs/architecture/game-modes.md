# Game Modes

A **Game Mode** is the kind of game a Game is played as (`CONTEXT.md`). Every Game has exactly one, chosen in the New Game dialog and never changed (ADR-0004). The first and, for now, only Mode is **Dive**, the Krillion-style game. Everything in `game-generation-pipeline.md` and `run-and-scoring.md` describes Dive.

This doc is the seam: what a Mode owns, what all Modes share, and how to add one.

## What a Mode owns vs. what's shared

| | Owned by each Mode | Shared by all Modes |
|---|---|---|
| Generation | the Gemini prompt, the response schema, which Prompt kinds, Mode-specific checks (e.g. Dive's Tier assignment) | reading `source_pages`, the common checks (Evidence exists, alias hygiene, dedupe), writing `prompts`/`answers`/`answer_keys` |
| Play | Run rules (length, timer, penalties, one-try kinds), scoring, the Reveal payload | the Run lifecycle (create, start-prompt, guess, finish), the server-owned clock, `guess_events`, answer matching (`lib/matching/`) |
| Progress | what "best" means and how it's shown | `runs.score` → Personal Best, found Answers → Mastery |
| UI | theme (palette, scene, mascot, sounds, words), Game-page stats, Run and Reveal screens | the design system: shell, components, round and results building blocks (`docs/design/design-system.md`) |

Prompt kinds (open, cloze, definition, put-in-order, odd-one-out) are shared vocabulary. Two similar Modes can use the same kinds, the same matching and the same input components, and differ only in rules, scoring and theme.

## Data

```sql
ALTER TABLE games ADD COLUMN mode text NOT NULL DEFAULT 'dive' CHECK (mode IN ('dive'));
```

- It goes in a new timestamped migration, and existing Games become Dive Games.
- Widen the `CHECK` when a Mode is added.
- `runs`, `run_prompts` and `guess_events` don't need the column: a Run's Mode is its Game's Mode.
- `POST /api/modules/[moduleId]/games` takes `{ title, mode, sourceDocumentIds[] }`. A missing `mode` defaults to `'dive'`, so existing callers keep working.

## Code layout

Today's code *is* Dive. Don't move it until a second Mode exists. Until then:

- `lib/modes/index.ts`: `export const MODES = { dive: { id: 'dive', name: 'Dive', available: true } } as const; export type ModeId = keyof typeof MODES;`, the one list of Modes, used for validation and the New Game dialog.
- Generation and the run engine read `game.mode` and, for now, assert it's `'dive'`.

When a second Mode is added, split by Mode:

```
lib/modes/<mode>/generate.ts     prompt + schema + Mode-specific checks  (Dive's: F04's generator prompt, lib/scoring/tiers.ts)
lib/modes/<mode>/rules.ts        Run rules + scoring                       (Dive's: today's lib/scoring/points.ts, parts of lib/runs/run-engine.ts)
components/modes/<mode>/         theme.css, scene, Mascot, GameStats, RunScreen, RevealScreen
```

The pages `/games/[id]`, `/runs/[id]` and `/runs/[id]/reveal` look up `game.mode` and render that Mode's components inside `<div data-theme={mode}>`.

## Adding a Mode (checklist)

1. Add its terms to `CONTEXT.md`, and write an ADR if a rule is surprising.
2. Add it to `MODES`, widen the `games.mode` CHECK in a migration, and add it to the New Game dialog. It replaces or sits next to the locked "More modes soon" tile.
3. Generation: its prompt, schema, kinds and checks.
4. Rules and scoring, plus tests.
5. Design: a `docs/design/modes/<mode>.md` and a mock folder `docs/design/mock/modes/<mode>/`, built from the design system's blocks.
6. A row in `docs/FEATURES.md` for each piece.
