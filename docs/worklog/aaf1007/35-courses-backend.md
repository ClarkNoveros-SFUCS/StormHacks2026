# #35 F22 Courses backend and the seeded Python Basics course

Status: done
Branch: feat/35-courses-backend (base origin/feat/33-game-modes-engine; origin/feat/34-social-backend and origin/content/seed-content merged in)
Updated: 2026-10-04

## Goal
Public Games, Courses/Topics/Topic Games/Topic progress, the Python Basics seed, XP on every Run,
Topic passes and unlocks, public catalogue/reading API. Spec: docs/architecture/courses.md (decisions §5, Q10, Q24, Q27).

## Done so far
- Merged F21 into the F20 base (conflicts: CONTEXT.md intro, FEATURES board rows; kept both sides).
- Migration `20261004T1100_courses.sql` (applied to stormhacks-dev): games.visibility, system Player, courses,
  course_topics, topic_games, topic_progress.
- lib/courses/ (types, rules, progress, queries, http, seed); run engine: createRun on public Games + 403 on locked
  Topic, `play()`/`afterFinish()` (onRunFinished + recordTopicRun for every finished Run), Reveal `topic` block.
- lib/progress.ts counts public Games; lib/social publicGame → games.visibility (test helper updated).
- API: GET /api/courses, /api/courses/[slug], /api/courses/[slug]/topics/[topicSlug] (public), POST …/read.
- Seed: `npm run db:seed:courses` run on stormhacks-dev (6 Topics, 30 public Games); second run wrote nothing.
- `npm run social:backfill` run (0 pending).
- Tests: rules.test.ts, seed.test.ts (unit), courses.db.test.ts (public Game Run by non-owner, XP once per Run,
  locked → 403 then unlock, Topic pass once + Course finish, signed-out catalogue/reading, mark as read, seed idempotency).
- Docs: courses.md (new), data-model, CONTEXT (Public Game, Course, Topic, Practice Game), overview, ui-map, social, run-and-scoring.
- Checks: tsc, lint (0 errors), npm test 161, test:db 78, build, dev server curl of every route on :3400.

## Next steps
- None for F22. Follow-ups: F27 builds the pages; F23 adds the Daily step to `afterFinish()`.

## Decisions & gotchas
- Finish hook lives in run-engine.ts `play()` (every command that can finish a Run goes through it), not in
  saveRun, to avoid a circular import between engines/common.ts and the engine registry.
- Seed never deletes Games (Runs would cascade away). Ids are derived from content; changed content makes a new Game,
  the Topic points at it, and the old one is set private (retired). A Topic removed from the file is deleted.
- Locked Topics still show their reading (readings are public, Q24); only starting practice is locked (403).
- Per-Mode record (`best`, `passed`, `runs`) is stored in `topic_progress.modes` jsonb (Leap's pass depends on more
  than score, so it can't be derived from runs.score alone).
- Signed out, Topic `progress` is null (no lock state) rather than computing Topic 1 as unlocked.
- `TopicResource.source` follows the content file (`source`, not `kind`).

## Files touched
- db/migrations/20261004T1100_courses.sql, lib/courses/*, app/api/courses/**, scripts/seed-courses.mts, package.json,
  lib/runs/run-engine.ts, lib/runs/types.ts, lib/runs/engines/common.ts, lib/progress.ts, lib/social/profile.ts,
  lib/social/social.db.test.ts, docs (courses.md, data-model.md, overview.md, ui-map.md, social.md, run-and-scoring.md),
  CONTEXT.md, docs/FEATURES.md
