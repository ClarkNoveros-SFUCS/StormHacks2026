# #42 F29 Arena: three.js FPS study Mode (stretch)

Status: done
Branch: feat/42-arena (base `feat/37-apogee-leap`, PR #58)
Updated: 2026-10-04

## Goal
Make the reserved `arena` Mode playable: a three.js first-person room where the question floats on a
holo-board and 4 answer targets drift; shoot the right one. Reuses Leap's `multiple_choice`
generation. Spec: `overnight-decisions.md` Q22 + §14, `docs/design/modes/arena.md`,
`run-and-scoring.md` § Arena.

## Rules (decided)
- 10 questions, 20 s each. A hit = an answer (`POST /answer { optionId, position? }`).
- Right target: `max(25, round((100 + speed bonus ≤ 50) × streak multiplier) − 25 × wrong hits on it)`;
  Leap's multiplier (×1.5 at 3+, ×2 at 5+). Closes the question.
- Wrong target: −3 s on the question's clock, the target shatters (409 if hit again), streak resets,
  question stays open. If the penalty runs the clock out it closes as a timeout (`closed: true`).
- Timeout: 0 points, streak resets. No hearts, no lifeline. Run always ends `cleared` after Q10.
- Pass: ≥ 7 correct.

## Done so far
- Engine: `lib/modes/arena/{rules,generate}.ts`, `lib/runs/engines/arena.ts`, types, `runApi.hit`,
  `passedRun`/`PASS_BAR_TEXT`, `MODES.arena` available (engine `arena`), seed (`prompts_from: "leap"`).
- Tests: unit (scoring, pass bar, generator), DB (full Runs with a fake clock, Arena generation).
- UI: `components/modes/arena/` (scene, stage, Run screen, After-Action Report, theme css), Mode tile
  mini-scene, `sfx.laser/shatter/blast`, styleguide picker reads `MODES[mode].available`.
- Docs: design doc, CONTEXT (Arena, Hit), game-modes, run-and-scoring, data-model, design-system, FEATURES.
- Verified in the browser (own player `user_dev_arena_agent`): full Run with click-to-aim (wrong hit
  shatter, right hit explosion, timeouts, auto next round), keys 1–4, reload mid-question and between
  rounds, pointer-lock refusal fallback, Reveal with hit trails/Evidence, 375 px and 1280 px.

## Decisions & gotchas
- Test player: `user_dev_arena_agent` (own seed) so other agents' Runs aren't abandoned.
- A wrong hit resets the streak (the right hit after it starts a new streak of 1).
- −25 per wrong hit applies after the multiplier, floor 25.
- Next round starts by itself 6 s after a result (shoot / Enter / button skips; pauses while paused).
- Esc "pause" can't stop the server's question clock; it holds the between-round countdown and says so.
- Keys 1–4 shoot directly (accessibility + automation); WASD is movement, so letters don't shoot.
- Pointer lock is refused in iframes/automated tabs: the scene reports the refusal once and the
  screen falls back to click-to-aim with a notice.
- No `docs/design/mock/modes/arena/` mock (the live screen is the reference).
- `/runs/new` launch beat stays F09's shared ocean scene.

## Files touched
- lib/modes/{index,generators,rules}.ts, lib/modes/arena/*, lib/runs/{types,client,run-engine}.ts,
  lib/runs/engines/arena.ts, tests, scripts/seed.mts, db/seed/graph-algorithms-modes.json,
  components/modes/arena/*, components/ui/ModeTile.*, lib/ui/{modes,sfx}.ts,
  app/runs/[runId]/mode-screens.tsx, app/styleguide/StyleguideClient.tsx, route comments, docs.
