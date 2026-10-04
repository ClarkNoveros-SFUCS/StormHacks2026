# #27 F17 Overgenerate and select the best Prompts

Status: in-progress
Branch: feat/27-overgenerate-select (base `origin/feat/26-verification-pass`, PR #60)
Updated: 2026-10-04 10:00

## Goal
Ask Gemini for ~25 Prompts per document, run the checks and F16's verification pass, then let a pure `selectPrompts` keep the best 15–20 (Answers per Open Prompt, kind balance, page coverage, near-duplicates, verification results). Measure with F14's scorecard (incl. latency and cost); keep it behind `GEMINI_OVERGENERATE` (default off) if it isn't worth it. Spec: `docs/architecture/game-generation-pipeline.md` § Improving output quality.

## Done so far
- Claimed #27 (assignee + in-progress, comment). Branched from `origin/feat/26-verification-pass`.
- Eval decks copied to the session scratchpad (`EVAL_DECKS_DIR`), sha256 match.
- Baseline replay (`generate:eval -- --verify-from eval/verify`): 64 → 60 kept, 32/9/7/7/5 kinds, Ans/Open 5.1, quotes 98%, 334 s, $0.222 + verify 25 s, $0.032.

## Next steps
1. `lib/games/select.ts` + tests.
2. Overgenerate request (Dive), `GEMINI_OVERGENERATE`, wire into generateGame after verification.
3. Scorecard selection columns, `generate:eval --overgenerate`.
4. Live run, spec, FEATURES, PR.

## Decisions & gotchas
- Gemini budget ≤ $0.80 for F17.

## Files touched
- this worklog
