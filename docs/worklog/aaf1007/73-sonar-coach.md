# #73 F32 Sonar: AI study coach (LangGraph) over a per-concept learner model

Status: in-progress
Branch: feat/73-sonar-coach
Updated: 2026-10-04 08:40

## Goal
A coach agent (LangGraph + Gemini) that reads a deterministic per-concept learner model for Python Basics and tells the Player what to practise next and why. Spec: docs/architecture/sonar.md.

## Done so far
- Issue #73 created and claimed; worktree `.claude/worktrees/73-sonar-coach` (real `npm ci`, not a node_modules symlink, because Turbopack builds break on the symlink).
- Spec written: docs/architecture/sonar.md (v0 scope, model, agent graph, tools, API, UI, time plan, cut order).

## Next steps
1. Grill session with the user on the open decisions, then update the spec.
2. Concept graph sidecar db/seed/courses/python-basics.sonar.json, then scripts/sonar-tag.mts.
3. lib/sonar/model.ts, diagnose.ts, plan.ts + tests, then GET /api/sonar/model.
4. lib/sonar/agent.ts (LangGraph), then POST /api/sonar/chat.
5. app/sonar page, then the demo seed.

## Decisions & gotchas
- No migration and no Run-engine change in v0: the model is computed on read from guess_events.
- Tags are keyed by a hash of the Prompt text so the content-hashed seeded Games don't change.
- The agent can only recommend one of the plan's top 3 actions (checked in the tool).

## Files touched
- docs/architecture/sonar.md, docs/worklog/aaf1007/73-sonar-coach.md, docs/FEATURES.md
