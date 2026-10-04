# #25 F15 Example Prompts in the generator instructions

Status: done
Branch: feat/25-example-prompts
Updated: 2026-10-04 05:45

## Goal
Add worked example Prompts (from the seed fixture) and "bad → good" pairs for the faults the F14 baseline found to Dive's generator instructions (`lib/gemini/game-prompt.ts`), and measure it with the F14 scorecard. Spec: `docs/architecture/game-generation-pipeline.md` § Improving output quality.

## Done so far
- Branched from `origin/feat/33-game-modes-engine` (F20, PR #46) and merged `origin/feat/24-generation-scorecard` (F14, PR #44). Conflicts in `scripts/generate-check.ts` (kept F20's `--mode` and per-Mode checks; added F14's shared helpers, `SavedResponse` saves and a scorecard row for Dive-engine Modes) and the pipeline spec (both sentences/rows merged).
- Eval decks copied into `eval/decks/` (gitignored) from the paths in the F14 worklog. Baseline replay matches the spec exactly.
- `GAME_PROMPT_EXAMPLES` (open, cloze, ordered_recall, odd_one_out from the seed fixture) embedded as one-line JSON in an EXAMPLES section; BAD → GOOD section (steps as Open Answers, symbol Answers, compound Open Prompts, odd-one-out not in the deck, course admin, give-away Hints). Matching short rules added to GROUNDING, open, odd_one_out, ANSWERS.
- Leap, Blitz, Pairs: one example (+1 BAD/GOOD line) each and a course-admin skip line.
- Tests: `lib/gemini/game-prompt.test.ts`, `lib/modes/examples.test.ts` (every embedded example passes its Mode's checks on the seed pages).
- Live run 1 (prompt `ac43c27a`, saved to `eval/runs/f15-run1/`, gitignored): 64 → 64 kept (baseline 64 → 56), drops 0 / 1 (baseline 8 / 19), quotes 97% (95%). Seed deck copied the examples (expected).
- Reading run 1's Prompts: still some "covered in the material" / "sections 1 through 5" Prompts, a few "X or Y" Opens, and acronym Hints ("abbreviated as RMSE"). Added BAD → GOOD lines for those (prompt `a6b826d6`); live run 2 → `eval/runs/f15-run2/`.
- Run 2 (prompt `a6b826d6`, shipped): 64 → 60 kept, drops 4 / 3, quotes 98%. DOCX steps became ordered_recall; no admin Prompts; symbol Answers came back once as cloze (`%`, `_`). Both runs + baseline in the spec § Scorecard → F15. Run 2 copied into `eval/responses/` (new replay set).
- Checks pass; FEATURES F15 ticked; PR opened to `feat/33-game-modes-engine`.

## Next steps
None for F15. Follow-ups: a cloze-specific "no symbol Answers" line; acronym/near give-away Hints need F16's verification pass.

## Decisions & gotchas
- Gemini budget for F15: ≤ $0.80. Spend: run 1 ≈ $0.205 + run 2 ≈ $0.222 = **≈ $0.43** (503s not billed; each deck retried up to 8 times, 90-120 s apart). No third run.
- Examples are structured data (`GAME_PROMPT_EXAMPLES`) serialized into the instruction, so a test can run them through `validateDocument`. Leap/Blitz/Pairs examples are plain lines in the instruction; the test parses lines starting with `{"kind":`.
- The seed deck now scores optimistically (Gemini reuses the examples there); judge on the course decks.
- `generate:check --save` in a non-Dive Mode records Dive's prompt version (promptVersion hashes Dive's request only). Left as is.

## Files touched
- scripts/generate-check.ts, docs/architecture/game-generation-pipeline.md (merge)
- lib/gemini/game-prompt.ts, lib/gemini/game-prompt.test.ts, lib/modes/examples.test.ts
- lib/modes/leap/generate.ts, lib/modes/blitz/generate.ts, lib/modes/pairs/generate.ts
- docs/FEATURES.md (F15 only), eval/responses/*.json (replaced with run 2)
