# #26 F16 Gemini verification pass for Answers

Status: done
Branch: feat/26-verification-pass
Updated: 2026-10-04 08:40

## Goal
A second Gemini call per Source Document after the Mode's checks: does each Answer's page support it, is each Prompt clear, is it a duplicate? Drop what fails, re-run check 4 and Tiers. Spec: `docs/architecture/game-generation-pipeline.md` § Verification pass (F16).

## Done so far
- Claimed #26, branched from `origin/feat/25-example-prompts` (F15, PR #54; includes F20 #46 and F14 #44); merged F15's final commits (new `eval/responses/` replay set).
- Contract heads-up comment on #26 (gemini.ts options arg, generateGame `verify` seam, env vars, `MIN_OPEN_ANSWERS` export).
- `lib/games/verify.ts` (pure: `verificationInput`, `applyVerdicts`, `verifyDocument` never throws) + `verify.test.ts` (fake verifier, 13 tests).
- `lib/gemini/verify.ts` (instructions, schema, `geminiVerifyCall`, `verificationEnabled`, `verifyModels`) + `verify.test.ts`.
- `lib/gemini.ts`: optional `{ models, timeoutMs }` 4th arg; `defaultModels()`.
- `generateGame`: per-document pass after `generator.validate`, `verify` seam (skipped when `generate` is a fake), logs.
- DB tests: verification drops reach the stored rows (Tiers re-ranked), failed verification keeps the Game ready.
- Scorecard: `scoreDocument(response, pages, verdicts?)`, `VerifyCard`, three verification columns; `generate:eval --verify / --verify-from / --verify-model`; `generate:check --verify` for any Mode.
- Saved verdicts: `eval/verify/` (for `eval/responses/`), `eval/planted/` (planted-errors response + verdicts).
- Spec § Verification pass (F16) with measurements, flow/F16 row/code layout/scorecard flags updated; FEATURES F16 ticked; `.env.example`.
- Checks: tsc OK, lint 0 errors (20 pre-existing warnings in docs/design/mock), npm test 156 OK, test:db 61 OK, build OK.

## Next steps
None. PR stacked on #54.

## Decisions & gotchas
- **Model: flash-lite** (`GEMINI_VERIFY_MODEL`, else `GEMINI_FALLBACK_MODEL`, then `GEMINI_MODEL`). 3.6-flash found nothing more on real decks, cost 2–3×, 11–31 s vs 4–7 s, 503 on 4 of 7 calls.
- Each Answer's `reason` is asked **before** `supports` in the schema: without it lite passed a wrong Leap option and a flipped Blitz statement.
- Verification runs for every Mode (cheap: Blitz's 38 statements ≈ $0.010, 8 s).
- Real decks: 0 removals over nine four-deck runs except one debatable Answer once: the pass is a safety net. Planted errors: 8–9 / 9 per run, no false positives.
- A Hint check (`hint_gives_away`) was tried and **removed**: lite described acronym give-aways and still said false. Follow-up: code rule in check 5.
- Verification drops count in `GenerateResult.dropped`; their reasons start with `verify: `.
- `generateGame` with a fake `generate` and no `verify` skips the pass (other branches' DB tests never call Gemini).
- Gemini spend for F16 ≈ $0.45 (all flash-lite except ≈ $0.05 of 3.6-flash comparison); budget $0.80.
- Scratch files (planted builder) lived in the session scratchpad; the planted response is committed with an `about` field.

## Files touched
- lib/games/verify.ts, lib/games/verify.test.ts, lib/gemini/verify.ts, lib/gemini/verify.test.ts
- lib/gemini.ts, lib/games/generate-game.ts, lib/games/generate-game.db.test.ts, lib/games/validate.ts (export)
- lib/games/scorecard.ts, lib/games/scorecard.test.ts, scripts/generate-eval.ts, scripts/generate-check.ts, scripts/deck-pages.ts
- eval/verify/*, eval/planted/*, .env.example
- docs/architecture/game-generation-pipeline.md, docs/FEATURES.md (F16 only), this worklog
