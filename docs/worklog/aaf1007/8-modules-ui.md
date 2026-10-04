# #8 F08 Modules list and Module page UI (+ #21 Mode picker)

Status: in-progress
Branch: feat/8-modules-ui (base `feat/10-design-system` #47, with `feat/33-game-modes-engine` #46 merged in)
Updated: 2026-10-04 (overnight)

## Goal
`/modules` (list, create, empty state) and `/modules/[moduleId]` (Files panel with upload, file viewer, Games panel, New Game dialog with the Mode picker) in the new site look. Spec: `docs/architecture/ui-map.md`, `docs/design/design-system.md`, `overnight-decisions.md` §10, §13, §14.

## Done so far
- Taken over from Clark (no prior F08 branch found). Branch created, #46 merged cleanly.

## Next steps
1. Server queries (`app/modules/queries.ts`), create action, `/modules` page.
2. Module page: Files panel, upload, polling, delete guard; Games panel; New Game dialog.
3. `GET /api/documents/[documentId]/pages` + file viewer with markdown renderer.
4. Verify on port 3600 with DEV_PLAYER_ID; checks; docs; PR.

## Decisions & gotchas
- Dev server port 3600. Don't create Games with Gemini (no budget).

## Files touched
- …
