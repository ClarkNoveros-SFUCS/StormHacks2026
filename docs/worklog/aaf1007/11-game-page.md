# #11 F11 Game page UI

Status: in-progress
Branch: feat/11-game-page (base `feat/10-design-system`, PR #47; merged `origin/feat/35-courses-backend`, PR #48)
Updated: 2026-10-04

## Goal
`/games/[gameId]`: the site frame (title, ModeBadge, source chips, created date, a themed hero band per Mode) plus the Mode's own stats panel and Play wording, recent Runs, score sparkline/distribution, accuracy-over-time chart, Play with 403/409 handling, generating/failed states. Spec: `docs/architecture/ui-map.md` § Game page, `docs/design/modes/*.md`, overnight-decisions §2, §14.

## Done so far
- Branch created, F22 merged in (ui-map.md conflict resolved: kept F10's route tree + F22's Practice line; kept both Reveal notes).
- Issue claimed.

## Next steps
1. Server data: `app/games/[gameId]/data.ts` (owner or public Game, topic lock, runs, Mode stats).
2. Page + client pieces, per-Mode `components/modes/<mode>/GameStats.tsx`, heroes.
3. Verify on dev port 3900 with DEV_PLAYER_ID; checks; FEATURES; PR.

## Decisions & gotchas
- Play wording from the orchestrator brief (overrides MODE_UI verbs): Dive `▼ BEGIN DESCENT ▼`, Apogee `LAUNCH`, Leap `JUMP IN`, Pairs `START MATCHING`, Blitz `GO`.

## Files touched
- docs/architecture/ui-map.md (merge resolution)
