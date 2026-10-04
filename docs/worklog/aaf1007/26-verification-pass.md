# #26 F16 Gemini verification pass for Answers

Status: in-progress
Branch: feat/26-verification-pass
Updated: 2026-10-04 07:45

## Goal
A second Gemini call per Source Document after the Mode's checks: does each Answer's quote/page support it, is each Prompt clear, is it a duplicate? Drop what fails, re-run check 4 and Tiers. Spec: `docs/architecture/game-generation-pipeline.md` § Improving output quality → § Verification pass (F16).

## Done so far
- Claimed #26, branched from `origin/feat/25-example-prompts` (F15 in flight; includes F20 #46 and F14 #44).
- Contract heads-up comment posted on #26 (gemini.ts options arg, generateGame `verify` seam, env vars, MIN_OPEN_ANSWERS export).
- Eval decks copied into `eval/decks/` (gitignored) from the paths in the F14 worklog.

## Next steps
1. `lib/gemini/verify.ts` (instructions, schema, contents, Gemini call), `lib/games/verify.ts` (pure: input, applyVerdicts, verifyDocument never throws) + tests with a fake verifier.
2. Wire into `generateGame` (per document after validate) with `GEMINI_VERIFY=off`.
3. Scorecard verification columns + `generate:eval --verify / --verify-from`, `generate:check --verify`.
4. Live: verify the 4 baseline responses with 3.6-flash and 3.5-flash-lite; pick a model; save verdicts; before/after in spec.

## Decisions & gotchas
- Budget ≤ $0.80.
- Don't edit F15's instruction text in `lib/gemini/game-prompt.ts`.

## Files touched
- (see git diff)
