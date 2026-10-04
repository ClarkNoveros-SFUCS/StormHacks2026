# #27 F17 Overgenerate and select the best Prompts

Status: done
Branch: feat/27-overgenerate-select (base `origin/feat/26-verification-pass`, PR #60)
Updated: 2026-10-04 11:15

## Goal
Ask Gemini for ~25 Prompts per document, run the checks and F16's verification pass, then let a pure `selectPrompts` keep the best 15–20 (Answers per Open Prompt, kind balance, page coverage, near-duplicates, verification results). Measure with F14's scorecard (incl. latency and cost); keep it behind `GEMINI_OVERGENERATE` (default off) if it isn't worth it. Spec: `docs/architecture/game-generation-pipeline.md` § Overgenerate and select (F17).

## Done so far
- Claimed #27 (assignee + in-progress, comment); contract heads-up comment posted before pushing.
- `lib/games/select.ts` (`selectPrompts`, `quality`, `textSimilarity`, `answerOverlap`) + `select.test.ts` (13 tests).
- `applyVerdicts`/`verifyDocument` return `statuses` per kept Prompt (verified/trimmed/unverified) for the selector (+1 test).
- `game-prompt.ts`: `gameSystemInstruction(count, open)`, `gamePromptContentsFor(count)`, `GAME_OVERGENERATE_*` ("about 25, at least 12 of them open"); default prompt hash still `a6b826d6`, overgenerate prompt `f6987a82`.
- `ModeGenerator.overgenerate?` (Dive only, so Dive + Apogee), `overgenerateEnabled()` (`GEMINI_OVERGENERATE`, default off), `generateGame(…, { overgenerate })`: generate → checks → verify → select. DB tests for on/off.
- Scorecard: `scoreDocument(…, { select })`, `Scorecard.select`, `Selected` column (+2 tests); `generate:eval --overgenerate`, `generate:check --overgenerate`.
- Live runs: run 1 (prompt `bb7ea296`, 4 decks) and run 2 (shipped `f6987a82`, 3 course decks); run 2 committed as `eval/overgenerate/` (+ `verify/`).
- Spec § Overgenerate and select (F17) with measurements; flow, Gemini call, per-Mode table, F17 row, scorecard flags, code layout updated. FEATURES F17 ticked, `.env.example`.
- Checks: tsc OK, lint 0 errors (20 pre-existing warnings), npm test 172 OK, test:db 63 OK, build OK.

## Next steps
None. PR stacked on #60.

## Decisions & gotchas
- **Default off.** Course decks: 44 → 60 Prompts kept, Open 24 → 26, cited pages 33 → 47 (PDF/PPTX), Ans/Open and quotes unchanged; generation cost +17 % (run 2) / +29 % (run 1), verification +43 % (≈ $0.01/doc), time +6–15 %. A Dive Run draws 7 Prompts, so the gain is replay variety/coverage, not needed by default.
- Run 1 ("about 25, at least half open") padded with single-answer kinds: Open Prompts fell 24 → 18. Saying "at least 12 of them open" fixed it.
- Selection runs **after** the verification pass (brief's order), so the verifier judges ~25 Prompts and the selector can use its statuses.
- Leap/Blitz/Pairs don't overgenerate (no Open Answers to rank; Pairs/Blitz already ask for more than their minimum).
- Near-duplicates (content-word Dice ≥ 0.8, Answer-set Jaccard ≥ 0.8, same term in two cloze/definition Prompts) are never kept, even below 15. Jaccard (not shared/smaller) so "Name a graph algorithm" vs "Name an MST algorithm" isn't a duplicate.
- `--no-fallback` also unsets the verifier's default (lite) model; run 1's verification ran on 3.6-flash and 503'd on two decks. Re-verified with `--verify-model gemini-3.5-flash-lite`.
- Eval decks were copied into the session scratchpad and passed with `EVAL_DECKS_DIR`.
- Gemini spend for F17 ≈ $0.60 (run 1 $0.327, lite re-verify $0.037, run 2 $0.235); budget $0.80.

## Files touched
- lib/games/select.ts, select.test.ts, verify.ts, verify.test.ts, generate-game.ts, generate-game.db.test.ts, scorecard.ts, scorecard.test.ts
- lib/gemini/game-prompt.ts, lib/modes/generation.ts, lib/modes/dive/generate.ts
- scripts/deck-pages.ts, generate-eval.ts, generate-check.ts
- eval/overgenerate/*, .env.example
- docs/architecture/game-generation-pipeline.md, docs/FEATURES.md (F17 only), this worklog
