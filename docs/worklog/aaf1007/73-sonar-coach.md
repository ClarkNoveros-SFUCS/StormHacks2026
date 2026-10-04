# #73 F32 Sonar: AI study coach (LangGraph) over a per-concept learner model

Status: in-progress
Branch: feat/73-sonar-coach
Updated: 2026-10-04 09:10

## Goal
A coach agent (LangGraph + Gemini) that reads a deterministic per-concept learner model for Python Basics and tells the Player what to practise next and why. Spec: docs/architecture/sonar.md.

## Done so far
- Issue #73 created and claimed; worktree `.claude/worktrees/73-sonar-coach` (real `npm ci`, not a node_modules symlink, because Turbopack builds break on the symlink).
- Spec written: docs/architecture/sonar.md (v0 scope, model, agent graph, tools, API, UI, time plan, cut order).

- Grill session done; decisions recorded in docs/architecture/sonar.md § Decisions.
- LangGraph + Gemini spike passed (tools, MemorySaver, withFallbacks after bindTools, zod 4, thinkingBudget 0 for speed).
- Contracts committed: lib/sonar/{types,client,context-path,fixtures,queries(stub),tags}.ts, Concept ids and edges in db/seed/courses/python-basics.sonar.json, env vars (SONAR_MODEL, LANGSMITH_*).
- 4 agents launched in their own worktrees, branched from feat/73-sonar-coach: A model (feat/73-sonar-a), B agent (feat/73-sonar-b), C UI (feat/73-sonar-c), D demo, bubble and links (feat/73-sonar-d).

## Next steps
1. As each agent reports, merge its branch into feat/73-sonar-coach (order A, B, D, C), then run tsc, lint and vitest.
2. Seed the demo account with `npm run sonar:demo -- <playerId>`, then run the demo loop end to end in the browser.
3. Hand over to the user for review (CLAUDE.local.md: open the PR once checks pass).

## Decisions & gotchas
- No migration and no Run-engine change in v0: the model is computed on read from guess_events.
- Tags are keyed by a hash of the Prompt text so the content-hashed seeded Games don't change.
- The agent picks one of the planner's top 3, or its own Game ("Sonar's pick"); its own pick must pass checkPlayable on the server. On Modules it can propose a new Game, which the Player confirms before it's made.
- The deadline is unknown; I assumed about 2 h left and that deploy (F12) is covered.

## Files touched
- docs/architecture/sonar.md, docs/worklog/aaf1007/73-sonar-coach.md, docs/FEATURES.md
