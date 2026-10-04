# #42 F29 Arena: three.js FPS study Mode (stretch)

Status: in-progress
Branch: feat/42-arena (base `feat/37-apogee-leap`, PR #58)
Updated: 2026-10-04

## Goal
Make the reserved `arena` Mode playable: a three.js first-person room where the question floats on a
holo-board and 4 answer targets drift; shoot the right one. Reuses Leap's `multiple_choice`
generation. Spec: `overnight-decisions.md` Q22 + §14, brief from the orchestrator.

## Rules (decided)
- 10 questions, 20 s each. A hit = an answer (`POST /answer { optionId, position? }`).
- Right target: `(100 + speed bonus ≤ 50) × streak multiplier` (Leap's ×1.5 at 3+, ×2 at 5+), then
  −25 per wrong hit on that question, floor 25. Closes the question.
- Wrong target: −3 s on the question's clock, the target shatters, streak resets, question stays open.
  If the penalty runs the clock out the question closes as a timeout.
- Timeout: 0 points, streak resets. No hearts, no lifeline. Run always ends `cleared` after Q10.
- Pass: ≥ 7 correct.

## Done so far
- Worktree set up, issue claimed.

## Next steps
1. Engine + rules + tests.
2. Screen + Reveal.
3. Docs, FEATURES, PR.

## Decisions & gotchas
- Test player: `user_dev_arena_agent` (own seed) so other agents' Runs aren't abandoned.

## Files touched
- …
