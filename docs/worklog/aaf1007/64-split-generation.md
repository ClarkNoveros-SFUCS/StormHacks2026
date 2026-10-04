# #64 F30 Faster Game generation: split each document's Gemini call

Status: done
Branch: feat/64-split-generation (base `origin/feat/27-overgenerate-select`, PR #62; the generation code isn't on main yet)
Updated: 2026-10-04 08:00

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

## Measurements so far (2026-10-04)
- **3.6-flash was down** (503 "high demand" on every full-size request from ~07:00 to 07:35; tiny requests still answered). Two concurrent single-vs-split runs and a patient retry loop got only 2 of ~30 calls through. In the app those Games fall back to lite after the 2+5+12 s retries.
- **Measured on gemini-3.5-flash instead** (same profile: 7–12k thinking + 3–4k output per call), single and split at the same time, lite verification. Saved in `eval/runs/f30-35-single/` and `eval/runs/f30-35-split/` (gitignored).
  - Time: single 54/39/50/40 s (183 s) vs split 42/42/45/40 s (169 s): **−8 % only**.
  - Why: the Open call thinks as much as the whole single call (9.6–11k thinking tokens); only output halves. The other-kinds call takes 16–22 s. Total thinking +40 %, input ×2.
  - Quality: kept 63 → 67, **Open 27 → 35** (ML notes 3 → 9), Ans/Open 5.0 = 5.0, quotes 97 % → 96 %, verify removed 0 → 1 Prompt.
- Thinking-level experiment (throwaway script, single call): `low` 10–11 s but 1–2 Open Prompts; `medium` ≈ default (37–47 s). **User decision: keep the current thinking level; no low thinking.**

## Next steps
None. PR stacked on #62. Follow-up (separate issue): faster fallback on 503 and a shorter per-attempt timeout.

## Decisions & gotchas
- **Split by kind, not by pages:** Open Prompts need Answers from the whole deck (Ans/Open is the key metric), so both calls see every page and the schema's `kind` enum keeps each call to its kinds.
- **One failed call doesn't fail the Game:** the other call's Prompts go through the checks; the Game fails only if every call fails (or too few Prompts survive).
- **Fake `generate` defaults to no split** (like the verification pass), so existing DB tests see one call per document.
- **Default on** (user decision after the measurement): ~8 % faster and Open 27 → 35 are worth +40–50 % generation tokens.
- **Thinking level stays at the default** (user decision): `low` was 4× faster but lost Open Prompts.
- Replay set committed as `eval/split/` (split) and `eval/split/single/` (the concurrent single run), both 3.5-flash.
- Worked in a separate worktree (`../stormhacks2026-f30`) so the user's `overnight/demo` checkout stays untouched.

## Files touched
- lib/gemini/game-prompt.ts, lib/modes/generation.ts, lib/modes/dive/generate.ts, lib/games/generate-game.ts, lib/games/scorecard.ts
- lib/modes/split.test.ts, lib/games/generate-game.db.test.ts
- scripts/deck-pages.ts, scripts/generate-eval.ts, scripts/generate-check.ts
- eval/split/**, .env.example, docs/architecture/game-generation-pipeline.md, docs/FEATURES.md (F30 only)
- this worklog
