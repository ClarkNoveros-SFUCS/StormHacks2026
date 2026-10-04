# Game Modes

A **Game Mode** is the kind of game a Game is played as (`CONTEXT.md`). Every Game has exactly one, chosen in the New Game dialog and never changed (ADR-0004). There are six:

| Mode | Id | Plays like | Prompt kinds | Rules (`run-and-scoring.md`) | Min Prompts |
|---|---|---|---|---|---|
| **Dive** | `dive` | Krillion: type answers, rarer ones score more | open, cloze, definition_to_term, ordered_recall, odd_one_out | 7 × 25 s, −3 s per wrong guess, Tiers, Staleness, Hints | 7 |
| **Apogee** | `apogee` | Dive in space (score shown as altitude) | same as Dive | **Dive's rules and generator, shared, not copied** | 7 |
| **Leap** | `leap` | jump platform to platform by answering right | multiple_choice | 10 × 15 s, one try, 3 Hearts, streak multiplier, one 50/50 | 10 |
| **Pairs** | `pairs` | match terms to definitions | definition_to_term | 2 Boards × 6 pairs, 60 s per Board | 12 |
| **Blitz** | `blitz` | rapid true/false | true_false | one 60 s clock, Combo, −3 s per miss | 30 |
| **Arena** | `arena` | first-person shooter: shoot the target with the right answer | multiple_choice (**Leap's generator**) | 10 × 20 s, a hit is an answer, wrong hit −3 s and −25 (question stays open), streak multiplier | 10 |

This doc is the seam: what a Mode owns, what all Modes share, and how to add one.

## What a Mode owns vs. what's shared

| | Owned by each Mode | Shared by all Modes |
|---|---|---|
| Generation | the Gemini instructions and response schema, which Prompt kinds, Mode-specific checks (Dive's Tier assignment; Leap's 4-option shape; Pairs' one-term-per-pair; Blitz's true/false balance), the minimum Prompt count | reading `source_pages`, one Gemini call per Source Document, check 7 (duplicate Prompt text), the Evidence quote check, writing `prompts`/`answers`/`answer_keys`, the `failed` path |
| Play | Run rules (length, clocks, penalties, Hearts/Boards/Combo), scoring, the pass bar, the state and Reveal payloads, any extra routes (`answer`, `pair`, `lifeline`) | the Run lifecycle (create, start-prompt, timeout, finish), the server-owned clock and grace, `guess_events`, `runs.score`, the `RunSummary` shape |
| Progress | what "best" means and how it's shown | `runs.score` → Personal Best, found Answers → Mastery (every kind has ≥ 1 Answer row) |
| UI | theme (palette, scene, mascot, sounds, words), Game-page stats, Run and Reveal screens | the design system: shell, components, building blocks (`docs/design/design-system.md`) |

Prompt kinds are shared vocabulary: Pairs uses Dive's `definition_to_term`, and Arena reuses Leap's `multiple_choice` (and Leap's generator: `lib/modes/arena/generate.ts` only renames the not-enough message).

## Data

- `games.mode text NOT NULL DEFAULT 'dive' CHECK (mode IN ('dive','apogee','leap','pairs','blitz','arena'))` (widened by `20261004T1000_game_modes_engine.sql`). Keep it in step with `MODES`.
- `prompts.kind` adds `multiple_choice` (options in `prompts.options`, the correct option is the one Answer row) and `true_false` (`prompts.is_true`; the Answer row is `True`/`False`). Both carry a `tier` like every single-answer kind.
- `runs.mode_state jsonb`: the Mode's own Run state (Hearts, streak, Board clocks, Blitz's clock, outcome). Null for Dive and Apogee.
- `run_prompts`, `guess_events` don't need a mode column: a Run's Mode is its Game's Mode.
- `POST /api/modules/[moduleId]/games` takes `{ title, mode?, sourceDocumentIds[] }`. A missing `mode` defaults to `'dive'`; a Mode with `available: false` is a 400 (none today; Arena became available with F29).

## Code layout

```
lib/modes/index.ts               MODES (id, name, tagline, rules, kinds, available, accent, playVerb, engine, minPrompts, bands),
                                 ModeId, AvailableModeId, PromptKind, isModeId, isDiveFamily.   Pure, client-safe.
lib/modes/rules.ts               passedRun(summary), PASS_BAR_TEXT                               Pure, client-safe.
lib/modes/generation.ts          ModeGenerator, GenerationRequest, GeneratedPrompt, shared checks (quoteOnPage, …)
lib/modes/generators.ts          generatorFor(mode)  (Apogee → Dive's, Arena → Leap's)
lib/modes/<mode>/generate.ts     the Mode's Gemini instructions + schema + checks
lib/modes/<mode>/rules.ts        the Mode's constants, scoring and pass bar (pure; the UI can show the same numbers)
lib/modes/apogee/index.ts        re-exports Dive's generator and rules (Apogee shares them)
lib/runs/engines/common.ts       ModeEngine, Run row lock, RunError, logGuess, Evidence lookup, progress
lib/runs/engines/<engine>.ts     dive (Dive + Apogee), leap, pairs, blitz, arena: each Mode's state machine
lib/runs/run-engine.ts           the public commands; dispatches on game.mode
lib/runs/types.ts                client-safe API types: RunState / Reveal / RunSummary unions on `mode`
components/modes/<mode>/         theme.css, scene, Mascot, GameStats, RunScreen, RevealScreen  (UI lanes)
```

Dive's generator instructions and checks still live in `lib/gemini/game-prompt.ts` and `lib/games/validate.ts` (the generation-quality work F14–F17 tunes them there); `lib/modes/dive/generate.ts` plugs them into the per-Mode pipeline. Everything under `lib/modes/` that generation needs uses relative `.ts` imports so `scripts/generate-check.ts` and `scripts/seed.mts` can load it with plain Node.

The pages `/games/[id]`, `/runs/[id]` and `/runs/[id]/reveal` look up `game.mode` (or `state.mode`) and render that Mode's components inside `<div data-theme={mode}>`.

## Adding a Mode (checklist)

1. Add its terms to `CONTEXT.md`, and write an ADR if a rule is surprising.
2. Add it to `MODES` (with `engine` and `minPrompts`) and widen the `games.mode` CHECK in a migration (and `prompts.kind` if it brings a new kind).
3. Generation: `lib/modes/<mode>/generate.ts` exporting a `ModeGenerator`, registered in `generators.ts`; `npm run generate:check -- --seed --mode <mode>` to tune it.
4. Rules and scoring in `lib/modes/<mode>/rules.ts` with a `passed()`; add it to `passedRun`. Unit tests.
5. Engine: reuse one (`MODES[mode].engine`) or add `lib/runs/engines/<mode>.ts` implementing `ModeEngine`, plus its state/result/Reveal types in `lib/runs/types.ts` and any routes. DB tests that drive a full Run with a fake clock (`lib/runs/modes.db.test.ts`).
6. Seed: a Game in `db/seed/graph-algorithms-modes.json` (it must pass the Mode's own checks).
7. Design: a `docs/design/modes/<mode>.md` and a mock folder `docs/design/mock/modes/<mode>/`.
8. A row in `docs/FEATURES.md` for each piece.
