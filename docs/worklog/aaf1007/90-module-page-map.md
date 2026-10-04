# #90 Module page map

Status: done
Branch: feat/90-module-page-map
Updated: 2026-10-04 11:05

## Goal
Step 1 of a Module map: on the Module page, show per-page performance across all the Module's Games, with the weakest pages and Read/Drill. Step 2 (AI concept map) is #84.

## Done so far
- `buildModuleMap` (pure scoring), `moduleMap` query, `ModuleMapPanel`, wired via `ModuleWorkspace` `map` prop.
- Checked in the browser on Graph Algorithms (106 answers, 64%).

## Next steps
1. User reviews; then maybe #84.

## Decisions & gotchas
- Score = (weighted right + 0.5) / (weighted n + 1), weight halves per week; Solid ≥ 0.75, Shaky ≥ 0.5.
- The dev server on :3000 runs the old `.claude/worktrees/73-sonar-coach` worktree; this checkout's server is on :3001.

## Files touched
- app/modules/_lib/{page-map.ts,page-map.test.ts,queries.ts}, app/modules/_components/{ModuleMapPanel,ModuleWorkspace}.tsx, app/modules/[moduleId]/page.tsx
