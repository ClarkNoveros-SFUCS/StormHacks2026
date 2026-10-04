# #64 F30 Faster Game generation: split each document's Gemini call

Status: in-progress
Branch: feat/64-split-generation (base `origin/feat/27-overgenerate-select`, PR #62; the generation code isn't on main yet)
Updated: 2026-10-04 07:05

## Goal
Games take 60–120 s to generate. Latency is decode-bound (each call writes ~8–11k thinking + ~4–5k output tokens; input size doesn't predict it), so split Dive's (and Apogee's) one Gemini call per document into parallel calls that each write part of the Prompts: one writes the Open Prompts, one every other kind. Both see every page. Behind `GEMINI_SPLIT`. Spec: `docs/architecture/game-generation-pipeline.md` § Split generation (F30).

## Done so far
- Issue #64 created and claimed; contract heads-up comment posted (additive `ModeGenerator.split?` / `overgenerate.split?`).
- `lib/gemini/game-prompt.ts`: `gameInstruction(task)` behind `gameSystemInstruction` (default prompt hash still `a6b826d6`), `gameOpenSystemInstruction` / `gameOtherSystemInstruction`, `gameResponseSchema(kinds)` (+ `GAME_OPEN_/GAME_OTHER_RESPONSE_SCHEMA`), `GAME_SPLIT_COUNTS` (8-10 open / 7-10 other) and `GAME_OVERGENERATE_SPLIT_COUNTS` (12-14 / 11-13).
- `lib/modes/generation.ts`: `splitEnabled()`, `generationPlan()`, `joinResponses()`, `generateSplit()`.
- `lib/modes/dive/generate.ts`: `diveSplitRequests(counts)`, `diveSplitRequest`, `diveOvergenerateSplitRequest`; hooked into `diveGenerator.split` and `.overgenerate.split`.
- `generateGame(…, { split })`: plan → `generateSplit` per document; partial failures logged, the rest kept.
- Scripts: `generateTimed` / `requestsVersion` in `scripts/deck-pages.ts`; `--split` on `generate:eval` and `generate:check`; `RunInfo.parts`.
- Tests: `lib/modes/split.test.ts` (12), 3 DB tests in `generate-game.db.test.ts`. tsc, lint (0 errors), npm test 184, generate-game DB 17 pass.

## Next steps
- Live eval: single vs split at the same time on the four eval decks (`eval/runs/f30-single`, `eval/split`), with lite verification.
- Decide the `GEMINI_SPLIT` default from it; spec section, FEATURES F30, `.env.example`.
- Full test:db + build, PR stacked on #62, merge into `overnight/demo`.

## Decisions & gotchas
- **Split by kind, not by pages:** Open Prompts need Answers from the whole deck (Ans/Open is the key metric), so both calls see every page and the schema's `kind` enum keeps each call to its kinds.
- **One failed call doesn't fail the Game:** the other call's Prompts go through the checks; the Game fails only if every call fails (or too few Prompts survive).
- **Fake `generate` defaults to no split** (like the verification pass), so existing DB tests see one call per document.
- Worked in a separate worktree (`../stormhacks2026-f30`) so the user's `overnight/demo` checkout stays untouched.

## Files touched
- lib/gemini/game-prompt.ts, lib/modes/generation.ts, lib/modes/dive/generate.ts, lib/games/generate-game.ts, lib/games/scorecard.ts
- lib/modes/split.test.ts, lib/games/generate-game.db.test.ts
- scripts/deck-pages.ts, scripts/generate-eval.ts, scripts/generate-check.ts
- this worklog
