# #19 Docs sync: align plan docs with what's built

Status: done
Branch: chore/19-docs-sync
Updated: 2026-10-03 21:20

## Goal
Bring the plan docs in line with the code on `main` after F01–F07 and F03 (ADR-0003) merged, and add two missing tests. No behaviour changes.

## Done so far
- Leftover Snowflake/Retry mentions removed: `ui-map.md` status pill, ADR-0002 marked "parsing superseded by ADR-0003", FEATURES.md F02 note and F08 checklist, `seed.mts` comment, F02 worklog.
- `run-and-scoring.md`: one-submission note no longer says "confirm before building"; lifecycle adds the createRun 409s and running score; new "edge cases" list; API table has `position`, `{ result, state }` / `{ hint, state }` and errors; types copied from `lib/runs/types.ts` (named as the source of truth); hinted-guess `tier` is the original Tier; Reveal fields (`stale`, `hintUsed`, `documentTitle` = filename, `progress.personalBest`); code-layout table matches the real file and function names.
- `data-model.md`: "every accepted guess" (rejected requests aren't logged); `player_game_daily_lookup` index.
- FEATURES.md: F06 notes no longer list type differences or say `Reveal.progress` is null; F04 note says `assignOpenTiers` exists; F04 Tier box and F05 seeded-test box ticked. The F08 checklist (claimed, #8) still says Retry: left for its owner, with a comment on #8.
- Tests: `lib/scoring/tiers.test.ts` (N = 4, N = 11, invariants for N = 4..15, rejects bad N); `lib/matching/match-guess.seed.db.test.ts` (spec examples, BFS/DFS on all 3 seeded Prompts, Aliases/diacritics/typos, and the current exact_only-on-Aliases behaviour).
- Vitest now ignores `.claude/**` and nested `node_modules`: `vitest.config.mts` `exclude`, and the `test` script's `--exclude` flags (the CLI list replaces the config's). A local Claude worktree under `.claude/worktrees/` was being swept in: its stale test copies and its `node_modules` (zod, tsconfig-paths) ran as part of `npm test` and `test:db`.
- Independent review by a second agent: fixed its findings (stale/`/hint`/`/timeout` wording, `getReveal` lock note, logging comment, the Vitest rationale).
- `npm test` 66/66 (6 files), `npm run test:db` 40/40 (4 files; one run stalled on Tiger Cloud latency, then passed on re-run), `npm run typecheck` and eslint clean.

## Next steps
None. Anton approved; the PR closes #19.

## Decisions & gotchas
- Out of scope, waiting on a team decision: Hint Tier display (RunState has no Tier; hinted `GuessResult.tier` is the original), `exact_only` per key vs per Answer, CONTEXT.md terms (Abandoned Run, Reveal, one-submission rule, kind-name mapping).
- `docs/design/design.md` is untracked locally (not on main); its StatusPill still had a RETRY button. Edited locally, not committed.
- After pulling PR #18, run `npm install`, or `extract.test.ts` fails with "Cannot find package 'mammoth'". Don't commit the lockfile churn it causes on macOS (`@emnapi/*`).

## Files touched
- docs/architecture/run-and-scoring.md, data-model.md, ui-map.md
- docs/adr/0002-snowflake-parse-gemini-generate-tiger-store.md
- docs/FEATURES.md, docs/worklog/aaf1007/2-seed-data.md, docs/worklog/aaf1007/19-docs-sync.md
- scripts/seed.mts (comment), package.json (test script), vitest.config.mts (exclude)
- lib/scoring/tiers.test.ts, lib/matching/match-guess.seed.db.test.ts
