# #8 F08 Modules list and Module page UI (+ #21 Mode picker)

Status: done
Branch: feat/8-modules-ui (base `feat/10-design-system` #47, with `feat/33-game-modes-engine` #46 merged in)
Updated: 2026-10-04 (overnight)

## Goal
`/modules` (list, create, empty state) and `/modules/[moduleId]` (Files panel with upload, file viewer, Games panel, New Game dialog with the Mode picker) in the new site look. Spec: `docs/architecture/ui-map.md`, `docs/design/design-system.md`, `overnight-decisions.md` §10, §13, §14.

## Done so far
- Taken over from Clark (no prior F08 branch or PR found). #46 merged cleanly into the #47 base.
- `/modules`: TiltCards with a deterministic pixel banner per Module, counts with Odometers, Mode badges, best result, last played; inline create (server action `createModule`) that bursts and opens the Module; mascot empty state.
- Module page: drag-and-drop upload (XHR progress), polling documents (1.5 s) and Games (3 s) with toasts, mascot reactions and pixel bursts on transitions; delete guard tooltip + confirm modals; hover linking chip ↔ row ↔ cards.
- File viewer + `GET /api/documents/[documentId]/pages` (comment posted on #8 before push), safe markdown parser (React elements only) with tests; deep links `?doc=&page=` and `/modules/files/[documentId]`.
- New Game dialog with ModeTiles from `MODES` (Arena locked), rules + kinds summary, thin-material hint.
- Skeleton `loading.tsx` for both routes, Module `not-found.tsx`.
- Verified on :3600 with DEV_PLAYER_ID: seeded Graph Algorithms Module shows its file and the 5 Games (one per Mode); viewer shows all 12 pages incl. the summary table; search/jumps/arrows/Escape work; New Game dialog renders all tiles; uploaded `styled.docx` (parsed, 2 pages) and deleted it; 375 px has no horizontal page scroll. No Games generated (no Gemini spend).

## Next steps
- None for F08. Follow-ups: F09 adds `documentId` to `Evidence` to link into the viewer; F11 shows the Mode badge on the Game page (last F13 box); F19 adds the nav link to `/modules`.

## Decisions & gotchas
- Integration fix: `components/results/ResultList.tsx` (F10) needed labels for F20's `multiple_choice` / `true_false` kinds so the merged branch typechecks.
- `PageTransition` animates `transform`, which makes it the containing block of `position: fixed` children, so overlays render through `_components/Portal.tsx`.
- Next 16 keeps recently visited pages mounted but hidden; DOM lookups for bursts use visible elements only.
- Module best result = highest finished Run across its Games, shown in that Game's Mode's words (scores aren't comparable across Modes; this is the simplest honest pick).
- Apogee altitude = 1 km per point (design doc); Dive depth = 10 m per point.
- Thin-material hint thresholds (pages): Pairs < 8, Blitz < 10, Leap < 5, Dive/Apogee < 3. Guesses; never blocks.
- No module rename/delete (not in scope).
- Formatting: Prettier at 120 columns (no repo config; matches the codebase).

## Files touched
- `app/modules/**` (pages, layout, loading, not-found, actions, `_components/`, `_lib/`), `app/api/documents/[documentId]/pages/route.ts`, `components/results/ResultList.tsx` (2 labels), `docs/FEATURES.md` (F08, F13 item), `docs/architecture/ui-map.md`.
