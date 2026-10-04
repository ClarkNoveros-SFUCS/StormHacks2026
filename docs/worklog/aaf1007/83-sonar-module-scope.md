# #83 Sonar stays on custom Modules

Status: done
Branch: feat/83-sonar-module-scope
Updated: 2026-10-04 10:40

## Goal
On a custom Module page (or a Reveal/Game of a Module Game), Sonar recommended the Python Basics Hello World Leap and failed to propose a Game. Keep Sonar on the Module and let the LLM choose between a Read card (page in the file) and a Game card.

## Done so far
- `lib/sonar/module-scope.ts` resolves the Player's own (non-Course) Module from the page.
- Snapshot drops Python Basics data there; tools refuse planner ranks / other Modules' Games; new `suggest_reading` (up to 3 Read cards a turn, linking straight to the study page, so "can you direct me to these pages?" gets a card per page instead of "I can't link"); `propose_game` takes the Module from the page.
- Player messages tagged `[Page: …]`; drawer re-briefs on a new page under a divider.
- Verified end to end on the real CMPT 354 Module: Reveal and Module page both give Read SQLBasics p.89 + replay Apogee.

## Next steps
1. Follow-up #84: concept map for custom Modules.

## Decisions & gotchas
- Up to one Read and one Game card per turn (user's choice).
- Python Basics behaviour unchanged (user's choice).
- `daily.test.ts` fails locally only when `.env.local` sets NEXT_PUBLIC_SITE_URL (pre-existing).

## Files touched
- lib/sonar/{agent,tools,playable,page-context,mistakes,types,module-scope}.ts, agent.test.ts, module-scope.db.test.ts
- components/sonar/SonarBuddy.tsx
