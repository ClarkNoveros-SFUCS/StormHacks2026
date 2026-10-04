# #9 F09 Run screen and Reveal UI (Dive)

Status: in-progress
Branch: feat/9-dive-run-ui (base `feat/10-design-system`, PR #47; merges `feat/33-game-modes-engine`, PR #46)
Updated: 2026-10-04 04:30

## Goal
`/runs/[runId]` (Mode dispatcher + the Dive Run screen wired to the real Run API) and `/runs/[runId]/reveal` (Krillion results column). Spec: `docs/design/modes/dive.md` §5–7, `docs/architecture/run-and-scoring.md`, `ui-map.md`, issue #9 latest comment.

## Done so far
- Branch set up, F20 merged cleanly, issue claimed.
- Contract change announced on #9: `Evidence.documentId`, `DiveRunState.prompt.tier` (single-answer kinds).

## Next steps
1. Contract changes in `lib/runs/types.ts`, `engines/common.ts`, `engines/dive.ts` (+ DB test expectation).
2. `lib/runs/client.ts` (fetch helpers), `app/runs/[runId]/{page,mode-screens}.tsx`, Dive screen, reveal page + extras query, `/runs/new?game=`.
3. Verify in the browser on port 3700, checks, FEATURES/docs, PR.

## Decisions & gotchas
- (filled in as I go)

## Files touched
- (filled in as I go)
