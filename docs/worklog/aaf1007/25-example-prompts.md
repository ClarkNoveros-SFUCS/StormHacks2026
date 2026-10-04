# #25 F15 Example Prompts in the generator instructions

Status: in-progress
Branch: feat/25-example-prompts
Updated: 2026-10-04 05:00

## Goal
Add worked example Prompts (from the seed fixture) and "bad → good" pairs for the faults the F14 baseline found to Dive's generator instructions (`lib/gemini/game-prompt.ts`), and measure it with the F14 scorecard. Spec: `docs/architecture/game-generation-pipeline.md` § Improving output quality.

## Done so far
- Branched from `origin/feat/33-game-modes-engine` (F20, PR #46) and merged `origin/feat/24-generation-scorecard` (F14, PR #44). Conflicts in `scripts/generate-check.ts` (kept F20's `--mode` and per-Mode checks; added F14's shared helpers, `SavedResponse` saves and a scorecard row for Dive-engine Modes) and the pipeline spec (both sentences/rows merged).
- Eval decks copied into `eval/decks/` (gitignored) from the paths in the F14 worklog. Baseline replay matches the spec exactly.

## Next steps
1. Examples + bad→good pairs in `lib/gemini/game-prompt.ts`; unit test that the examples pass `validateDocument` on the seed pages.
2. `npm run generate:eval -- --live --no-fallback`, compare with the baseline.

## Decisions & gotchas
- Gemini budget for F15: ≤ $0.80 (≤ 3 live runs of ~$0.20).

## Files touched
- scripts/generate-check.ts, docs/architecture/game-generation-pipeline.md (merge)
