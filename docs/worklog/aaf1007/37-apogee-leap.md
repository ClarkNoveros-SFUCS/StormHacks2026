# #37 F24 Apogee and Leap screens (three.js)

Status: in-progress
Branch: feat/37-apogee-leap (base feat/9-dive-run-ui, PR #49)
Updated: 2026-10-04 04:30

## Goal
Apogee (Dive rules in space, port of `inspo/krillion-space-variant/apogee.html` to React + three.js) and Leap (MCQ hopper on sky islands, three.js) Run and Reveal screens, wired into `app/runs/[runId]/mode-screens.tsx`. Spec: `overnight-decisions.md` §4, Q18, Q21; `docs/design/modes/apogee.md`, `leap.md`; `docs/architecture/run-and-scoring.md`.

## Done so far
- Claimed #37, branch created, `three` + `@types/three` installed.

## Next steps
1. `components/modes/apogee/`: altitude.ts (+test), scene.ts (three.js port), ApogeeStage, AltitudeRuler, ApogeeRunScreen, ApogeeRevealScreen.
2. `components/modes/leap/`: scene.ts, LeapStage, LeapRunScreen, LeapRevealScreen.
3. `runApi.answer` / `runApi.lifeline` in `lib/runs/client.ts` (additive; comment on the issue first).
4. Dispatcher lines, docs, checks, browser verification on port 4000, PR.

## Decisions & gotchas
- (filled in as I go)

## Files touched
- package.json, package-lock.json
