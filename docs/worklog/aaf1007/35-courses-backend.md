# #35 F22 Courses backend and the seeded Python Basics course

Status: in-progress
Branch: feat/35-courses-backend (base origin/feat/33-game-modes-engine, origin/feat/34-social-backend merged in)
Updated: 2026-10-04 05:00

## Goal
Public Games, Courses/Topics/Topic Games/Topic progress, the Python Basics seed, XP on every Run,
Topic passes and unlocks, public catalogue/reading API. Spec: overnight-decisions §5, Q10, Q24, Q27;
docs/architecture/courses.md (new).

## Done so far
- Merged F21 into the F20 base; resolved CONTEXT.md intro and FEATURES board rows (both done).
- Migration `20261004T1100_courses.sql` (applied to stormhacks-dev): games.visibility, system Player, courses,
  course_topics, topic_games, topic_progress.
- lib/courses/types.ts, rules.ts, progress.ts; run engine: createRun on public Games + 403 on locked Topic,
  `play()`/`afterFinish()` wrapper (onRunFinished + recordTopicRun), Reveal `topic` block.
- lib/progress.ts: Mastery/progress counts allow public Games. lib/social publicGame → games.visibility.

## Next steps
1. lib/courses/queries.ts + API routes.
2. lib/courses/seed.ts + scripts/seed-courses.mts + `npm run db:seed:courses`.
3. Merge origin/content/seed-content once its worklog says done; run the seed; social:backfill.
4. Tests, docs, FEATURES, PR.

## Decisions & gotchas
- Finish hook lives in run-engine.ts `play()` (every command that can finish a Run goes through it), not in
  saveRun, to avoid a circular import between engines/common.ts and the engine registry.
- Seed never deletes Games (Runs would cascade away). Game ids are derived from the content hash; changed content
  makes a new Game, the Topic points at it, and the old one is set private (retired).
- Locked Topics still show their reading (readings are public, Q24); only practice is locked (403).

## Files touched
- db/migrations/20261004T1100_courses.sql, lib/courses/*, lib/runs/run-engine.ts, lib/runs/types.ts,
  lib/runs/engines/common.ts, lib/progress.ts, lib/social/profile.ts, lib/social/social.db.test.ts
