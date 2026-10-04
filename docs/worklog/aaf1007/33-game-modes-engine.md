# #33 F20 Game Modes engine and generation: Apogee, Leap, Pairs, Blitz

Status: done
Branch: feat/33-game-modes-engine (base chore/overnight-plan, stacked on PR #43)
Updated: 2026-10-04 04:30

## Goal
Make generation, schema and the run engine multi-Mode (decisions §4, §12–13 in
`docs/worklog/aaf1007/overnight-decisions.md`). Spec docs: `docs/architecture/game-modes.md`,
`run-and-scoring.md`, `game-generation-pipeline.md`, `data-model.md`.

## Done so far
- Migration `20261004T1000_game_modes_engine.sql` (applied to stormhacks-dev after the contract comment on #33):
  Mode CHECK widened (+ arena reserved), kinds `multiple_choice`/`true_false`, `prompts.is_true`,
  `run_prompts.position >= 1`, `runs.mode_state jsonb`.
- `lib/modes/`: registry (`MODES` with name/tagline/rules/kinds/available/accent/playVerb/engine/minPrompts/bands),
  per-Mode `rules.ts` (constants, scoring, `passed`), `rules.ts` (`passedRun`), `generation.ts` (ModeGenerator),
  `generators.ts`, per-Mode `generate.ts` (Leap MCQ, Pairs definitions, Blitz T/F; Dive's is an adapter), `apogee/index.ts`.
- Run engine split: `lib/runs/engines/{common,dive,leap,pairs,blitz}.ts`; `run-engine.ts` dispatches on `game.mode`.
  Dive code moved unchanged (all 13 old Dive DB tests pass; only their types were narrowed).
- Routes: `POST /api/runs/[runId]/answer`, `/pair`, `/lifeline`.
- Types: `lib/runs/types.ts` unions on `mode` (RunState, Reveal, RunSummary), `assertMode`, `ModeRunState`.
- `generate:check --mode <m>`; real Gemini runs on the seed deck for leap/pairs/blitz/apogee (~$0.17 total).
- Seed: `db/seed/graph-algorithms-modes.json` (Leap 14, Pairs 16, Blitz 38 hand-written; Apogee reuses Dive's),
  checked by each Mode's own generator checks; seeded for user_3KD852awCV88LswW9l5jkVyo4gB.
- Tests: `lib/modes/rules.test.ts`, `lib/modes/generate.test.ts`, `lib/runs/modes.db.test.ts` (full Run per Mode,
  fake clock), new Mode cases in `lib/games/generate-game.db.test.ts`.
- Docs: game-modes, run-and-scoring, game-generation-pipeline, data-model, CONTEXT.md, design stubs, FEATURES.

## Next steps
1. None for F20. Follow-ups: UI lanes build screens (F24/F25); F21/F22 use `RunSummary`/`passed`.

## Decisions & gotchas (made without Anton)
- New kinds carry a `tier` (prompts_check requires one for non-open kinds); generators ask Gemini for it, default `solid`.
- Leap/Pairs/Blitz states hide the question/Board/statement until `start-prompt` (stricter than Dive, so nothing can be studied off the clock).
- Leap: streak counts this answer (3rd in a row → ×1.5, 5th → ×2); points rounded; 50/50 stored as `run_prompts.hint_used` and `guess_events.hint_used`; a hidden option is a 400.
- Pairs: the Run score never drops below 0 (a mismatch at 0 costs only time); Board 2 always follows Board 1; card ids are sha256 hashes of runId:promptId:side; mismatches are logged against the term's Prompt with negative points; a timed-out Board ends at its deadline.
- Blitz: "×2 after 5 in a row" means the 6th consecutive correct onward scores 20; deck = up to 120 statements drawn at random, the Run ends early (`deck_cleared`) if all are answered; balance check keeps majority ≤ 1.5× minority.
- MCQ option distinctness uses case/space folding, not `normalize()` (which merged `O(V + E)` and `O(V * E)`).
- Dive's prompt and validator stay in `lib/gemini/game-prompt.ts` and `lib/games/validate.ts` (lane P's files); only `dedupeAcrossDocuments` became generic.
- Apogee: 1 point = 1 km is a guess (design stub marks it CHECK).

## Files touched
- db/migrations/20261004T1000_game_modes_engine.sql, db/seed/graph-algorithms-modes.json, scripts/seed.mts, scripts/generate-check.ts
- lib/modes/** (new), lib/runs/engines/** (new), lib/runs/run-engine.ts, lib/runs/types.ts, lib/runs/modes.db.test.ts, lib/runs/run-engine.db.test.ts (types only)
- lib/gemini.ts, lib/games/generate-game.ts, lib/games/validate.ts (generic dedupe), lib/games/generate-game.db.test.ts
- app/api/runs/[runId]/{answer,pair,lifeline}/route.ts (new), start-prompt/timeout comments, app/api/modules/[moduleId]/games/route.ts comment
- docs/architecture/{game-modes,run-and-scoring,game-generation-pipeline,data-model}.md, CONTEXT.md, docs/design/modes/{apogee,leap,pairs,blitz}.md, docs/FEATURES.md
