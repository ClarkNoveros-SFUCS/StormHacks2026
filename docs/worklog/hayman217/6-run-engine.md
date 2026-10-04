# #6 F06 Run engine and scoring API

Status: done
Branch: feat/6-run-engine (based on feat/5-answer-matching; rebase onto main after PR #14 merges)
Updated: 2026-10-03

## Goal
Server-owned Run state machine, scoring and the `/api/runs` routes. Spec: `docs/architecture/run-and-scoring.md`.

## Done so far
- `lib/scoring/tiers.ts` (`Tier`, `TIER_POINTS`, `TIER_BELOW`, `HINTED_COMMON_POINTS`) and `points.ts` (`openPoints`, `singlePoints`), unit-tested
- `lib/runs/types.ts`: `RunState`, `GuessBody`, `GuessResult`, `GuessResponse`, `HintResponse`, `Reveal`, `RevealPrompt`, `Evidence` (client-safe)
- `lib/runs/shuffle.ts`: seeded shuffles (stable per run + position), unit-tested
- `lib/runs/run-engine.ts`: `createRun`, `getRunState`, `startPrompt`, `guess`, `revealHint`, `timeoutPrompt`, `getReveal`, `RunError`
- `lib/runs/http.ts` (`runRoute`: auth → transaction → server clock → RunError status) and 7 route handlers
- `lib/runs/run-engine.db.test.ts`: 13 integration tests with a fake clock, rolled back
- Verified: `npm test` 36 passed; `npm run test:db` 20 passed (3 runs in a row); typecheck and lint clean; all 7 routes return 401 signed out on the dev server, no server errors

## Next steps
1. User reviews. No PR until they approve
2. After PR #14 merges: `git rebase origin/main` (drops the F05 commits from this branch's diff)
3. Signed-in smoke test through the UI once F09 exists (or with a Clerk session in the browser)
4. In the PR: FEATURES.md F06 boxes, Status `done`, Entry points and Notes; worklog `Status: done`; `Closes #6`

## Decisions & gotchas
- One submission for put-in-order and odd-one-out: confirmed by the user (spec asked to confirm)
- `Reveal.progress` is `null` until F07 fills it (user agreed)
- Engine functions take `(tx, playerId, …, now)`: every call locks the run row (`FOR UPDATE`), then `settle()` closes an expired Prompt (deadline + 500 ms grace) before acting
- A late `start-prompt` that closes an expired Prompt does not start the next one's clock in the same call
- A wrong typed guess whose −3 s pushes the deadline into the past closes the Prompt as `timeout` immediately
- Empty (normalized) guess → 400, no penalty, not logged
- Guess body may carry `position`; a mismatch → 409, so a double submit can't land on the next Prompt
- `GuessResult` has an extra variant `{ correct: false, timedOut: true }` for guesses that arrive too late, and one-shot wrong results carry `correctOrder` for put-in-order
- `RunState` adds `promptCount`, `hint` (only once used) and allows `prompt: null` when the Run is over
- Staleness isn't stored; the Reveal derives `stale` as `points < TIER_POINTS[answer.tier]`
- Named `revealHint`, not `useHint`: the React hooks lint rule flags `use*` calls in callbacks
- Tests reorder `run_prompts` after `createRun` so they can walk Prompts in a known order

## Files touched
- lib/scoring/tiers.ts, points.ts, points.test.ts
- lib/runs/types.ts, shuffle.ts, shuffle.test.ts, run-engine.ts, run-engine.db.test.ts, http.ts
- app/api/games/[gameId]/runs/route.ts, app/api/runs/[runId]/{route.ts, start-prompt, guess, hint, timeout, reveal}
