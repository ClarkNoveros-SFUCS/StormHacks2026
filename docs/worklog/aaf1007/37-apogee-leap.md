# #37 F24 Apogee and Leap screens (three.js)

Status: done
Branch: feat/37-apogee-leap (base feat/9-dive-run-ui, PR #49)
Updated: 2026-10-04 05:55

## Goal
Apogee (Dive rules in space, port of `inspo/krillion-space-variant/apogee.html` to React + three.js) and Leap (MCQ hopper on sky islands, three.js) Run and Reveal screens, wired into `app/runs/[runId]/mode-screens.tsx`. Spec: `overnight-decisions.md` §4, Q18, Q21; `docs/design/modes/apogee.md`, `leap.md`; `docs/architecture/run-and-scoring.md`.

## Done so far
- Apogee: `components/modes/apogee/` — `scene.ts` (the inspo's three.js scene as a class: sky dome, stars, Earth/clouds/atmosphere, pad, rocket + flame + particles, Kármán halo, ISS, GEO ring, Moon, Webb, Mars, asteroid belt, Jupiter, meteors, streaks, bloom), `ApogeeStage` (dynamic import, pause when hidden, dispose, queue), `AltitudeRuler`, `TierReveal`, `ApogeeRunScreen` (intro + LAUNCH countdown, glass console, FIRE, Hint, −3 s, timeout, tier reveal with CONTINUE), `ApogeeRevealScreen` (Mission Report panel/sheet, Explore the flight with ruler scrub, mission log, bands, flight log via ResultList), `altitude.ts` (+ tests), `apogee.css`, `fonts.ts`.
- Leap: `components/modes/leap/` — `scene.ts` (voxel islands, hopper with squash/stretch/arc/dust, crumble, wobble, fall, summit flag, parallax pixel clouds, sky dusk→night, framing via view offset), `LeapStage`, `LeapRunScreen` (intro/ready beat, question card, keys 1–4, 50/50, hearts, streak chip, pops, SUMMIT!/YOU FELL), `LeapRevealScreen` (Climb Report), `leap.css`.
- Shared: `runApi.answer` / `runApi.lifeline` (`lib/runs/client.ts`, announced on #37), optional `tiers` prop on `components/results/ResultList.tsx`, new `components/results/TopicPassBanner.tsx`.
- Dispatcher cases for apogee and leap. Docs: apogee.md, leap.md visual sections; FEATURES F24.
- Verified in the browser (port 4000): full Apogee Run → Mission Report; Leap Run that fell (YOU FELL → report) and one that summited (SUMMIT! → report with flag); 375 px layouts; no app console errors.
- Checks: tsc, lint, test (144), build all pass.

## Next steps
- None. PR open against feat/9-dive-run-ui.

## Decisions & gotchas
- **Altitude scale:** kept 1 km per point (number shown = score). Landmarks are real up to the ISS (Kármán 100, ISS 408); Geostationary 460, Moon 530, L2 590, Mars 650, Jupiter 700 are stylised (toasts/labels give real distances). CHECK with Anton.
- Apogee's in-Run accent is the inspo's flame orange `#ff6a2b` (theme), not `MODES.apogee.accent` violet. Apogee tier icons: bolt / bubble / star / sparkle.
- Leap hopper colours are fixed (yellow/cream/orange): the Run page has no player avatar id client-side; matching the profile avatar needs F26's stored avatar. Skipped.
- The "Topic passed!" banner only shows when a Reveal carries a `topic` object (F22 hasn't added it yet), so today it never renders.
- **Testing gotcha:** other agents run `next dev` with Anton's DEV_PLAYER_ID and creating a Run abandons that player's other Runs, so my Runs kept getting abandoned. I seeded the Graph Algorithms demo for a separate dev player (`npm run db:seed -- user_dev_f24_agent`, additive rows in the shared dev DB) and tested with `DEV_PLAYER_ID=user_dev_f24_agent` in my worktree `.env.local`. Same seed content as Anton's Graph Algorithms Apogee/Leap Games.
- Background Chrome tabs don't run rAF: in dev the scenes are on `window.__apogee` / `window.__leap`; call `.step(16)` to advance frames by hand.
- No prettier config in the repo: don't run prettier on existing files (it rewraps them to 80 columns).

## Files touched
- package.json, package-lock.json (three, @types/three)
- components/modes/apogee/*, components/modes/leap/*
- components/results/ResultList.tsx, components/results/TopicPassBanner.tsx
- lib/runs/client.ts, app/runs/[runId]/mode-screens.tsx
- docs/design/modes/apogee.md, docs/design/modes/leap.md, docs/FEATURES.md
