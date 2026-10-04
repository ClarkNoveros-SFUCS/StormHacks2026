# #38 F25 Pairs and Blitz screens

Status: done
Branch: feat/38-pairs-blitz (base `feat/9-dive-run-ui`, PR #49)
Updated: 2026-10-04 05:40

## Goal
Run and Reveal screens for the Pairs and Blitz Game Modes on the real per-Mode Run API, wired into F09's dispatcher (`app/runs/[runId]/mode-screens.tsx`). Spec: `docs/design/modes/pairs.md`, `docs/design/modes/blitz.md`, `docs/architecture/run-and-scoring.md` § Pairs / § Blitz, `overnight-decisions.md` §4, Q19, Q20, §14.

## Done so far
- `lib/runs/client.ts`: `runApi.pair`, `runApi.blitzAnswer` (contract comment on #38).
- `lib/ui/sfx.ts`: `sfx.audioNow()`, `sfx.drum(voice, at, freq?)`, `BeatVoice` (additive).
- `app/globals.css`: full `[data-theme="pairs"]` and `[data-theme="blitz"]` tokens.
- `components/modes/pairs/`: PairsRunScreen (intro → deal flip → pick/pair → snap + link line + sparkles + fly to tray / shake → BOARD CLEAR bonus count-up or Time! → Board 2 → Reveal), PairsRevealScreen (THE TABLE), `pairs.module.css`.
- `components/modes/blitz/`: BlitzRunScreen (GO → 3-2-1 on the beat → statements → flash / glitch → TIME! / DECK CLEARED → Reveal), BlitzRevealScreen (REPLAY with run strip and All/Missed filter), `useBeat` + pure `beat.ts` (+ tests), `blitz.module.css`.
- `components/modes/shared/`: `TopicPassBanner` (+ `revealTopic`), `MasteryBlock`.
- Dispatcher cases for pairs and blitz (Run and Reveal).
- Docs: `docs/design/modes/pairs.md`, `blitz.md` (Visuals, Reveal, keyboard), `design-system.md` note, FEATURES F25.
- Verified on port 4100 with DEV_PLAYER_ID: full Pairs Run (miss on Board 1, both Boards cleared, bonus count-up, Reveal 980 ALL PAIRS), full Blitz Run (2 deliberate misses, deck cleared, Reveal 600), phone width 375 via an iframe (no horizontal scroll), no console errors on the Reveals.
- Checks: `npx tsc --noEmit`, `npm run lint`, `npm test` (145), `npm run build` all pass.

## Next steps
- None. Follow-ups: when F22 (#48) merges, `reveal.topic` lights the Topic banner with no code change; F24's Leap `runApi.answer` will sit next to `blitzAnswer` (trivial merge).

## Decisions & gotchas
- Pairs Board start is an explicit "MATCH ▶" press (Enter works), so the 60 s never starts while you're away; Blitz has GO, then a 3-2-1 countdown on the beat before start-prompt.
- `reveal.topic` comes from F22 (#48), not in this base: read structurally (optional).
- Helper named `runApi.blitzAnswer` (not `answer`) so it can't collide with F24's Leap helper.
- CSS Modules scope keyframe names, so the module files carry local copies of shake/fade/pop keyframes rather than referencing globals.css ones. Inline `style.animation` can still use the global keyframes.
- Testing gotcha: every agent uses the same DEV_PLAYER_ID, and creating a Run abandons the player's other in-progress Runs, so parallel agents abandon each other's test Runs. Drive a full Run in one go.
- Background Chrome tabs freeze rAF; screenshots can show frozen particles. DOM checks are reliable.

## Files touched
- app/globals.css, app/runs/[runId]/mode-screens.tsx, lib/runs/client.ts, lib/ui/sfx.ts
- components/modes/pairs/*, components/modes/blitz/*, components/modes/shared/*
- docs/design/modes/pairs.md, docs/design/modes/blitz.md, docs/design/design-system.md, docs/FEATURES.md
- docs/worklog/aaf1007/38-pairs-blitz.md
