# #73 F32 Sonar: AI study coach (LangGraph) over a per-concept learner model

Status: done
Branch: feat/73-sonar-coach
Updated: 2026-10-04 09:45

## Goal
A coach agent (LangGraph + Gemini) that reads a deterministic per-concept learner model for Python Basics and tells the Player what to practise next and why. Spec: docs/architecture/sonar.md.

## Done so far
- Grill session; decisions in docs/architecture/sonar.md § Decisions.
- Contracts first (lib/sonar/{types,client,context-path,fixtures,tags}.ts, Concept ids and edges), then 4 parallel agents, merged A → B → D → C with no conflicts:
  - A: tags for 447 Prompts (`npm run sonar:tag`), Mode-aware BKT + noisy-AND (model.ts), root cause (diagnose.ts), planner (plan.ts), loadSonarModel, GET /api/sonar/model.
  - B: LangGraph observe → coach ⇄ tools, the tools (get_concept, get_mistakes, read_topic, read_source_page, recommend, propose_game), POST /api/sonar/chat.
  - C: pixel dolphin mascot, SonarBuddy drawer, ActionCard, /sonar map, nav link.
  - D: demo seed, bubble API, AskSonarButton on every Reveal, the Topic page and the Module page.
- Lead fixes after merge:
  - The root cause now counts every Concept a missed Prompt tested, not only the primary one.
  - The demo seed misses on range() boundaries. The Loops material has no comparison Prompts, so the honest story is that range() is the root cause of the for-loop misses.
  - Card text shows forgetting-adjusted mastery, the same number as the map.
- Seeded user_3KD852awCV88LswW9l5jkVyo4gB (antonflorendo7@gmail.com). Its earlier Python Basics history was reset by the seed.
- Checks: tsc clean, lint clean, 411/412 unit tests. The one failure is lib/daily/daily.test.ts, which assumes NEXT_PUBLIC_SITE_URL is unset; .env.local sets it. It's unrelated to this branch.

## Next steps
1. Browser walk-through of the demo: /sonar → open the drawer → briefing → Start the top pick → Reveal → Ask Sonar.
2. Expansion list in sonar.md § Expansion.

## Decisions & gotchas
- No migration and no Run-engine change: the model is computed on read from guess_events plus run_prompts timeouts.
- Tags are keyed by sha1 of the Prompt text, so the content-hashed seeded Games don't change.
- The agent picks one of the planner's top 3, or its own Game ("Sonar's pick", checked by checkPlayable). On Modules it can propose a new Game, which the Player confirms.
- The seed is allowlisted: one real account plus demo_sonar_* ids.
- The planner ranks on raw p; status and card text use pEff (after forgetting).

## Files touched
- lib/sonar/*, components/sonar/*, app/sonar/page.tsx, app/api/sonar/{model,chat,bubble}/route.ts, scripts/sonar-{tag,demo,chat-check}.mts, db/seed/courses/python-basics.sonar.json, app/layout.tsx, components/site/SiteNav.tsx, the six Mode Reveal screens, the Topic page, ModuleWorkspace, package.json, .env.example, docs.
