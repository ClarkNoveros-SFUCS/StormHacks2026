# #5 F05 Answer matching

Status: in-review
Branch: feat/5-answer-matching
Updated: 2026-10-03

## Goal
Turn a typed guess into one of a Prompt's Answers (or not): `normalize()` plus `matchGuess()`. Spec: `docs/architecture/answer-matching.md`.

## Done so far
- `lib/matching/normalize.ts` and `normalize.test.ts` (spec table, every step, edge cases)
- `lib/matching/match-guess.ts`: `matchGuess(promptId, raw, db = sql)`, `MatchResult`, `typoBudget()`
- `lib/matching/match-guess.db.test.ts`: own fixture in a rolled-back transaction (F02 not merged yet)
- vitest 4 set up (vitest 5 needs @types/node ≥ 22; the repo pins ^20): `vitest.config.mts`, `test/server-only-stub.ts`, scripts `test` (unit) and `test:db` (integration)

## Next steps
1. User reviews the branch. No PR until they approve
2. When F02 merges, add one test in `match-guess.db.test.ts` against the seeded "Name a graph algorithm" Prompt (checklist box 3 says "F02's seeded Prompt"); the own-fixture tests already cover the same cases
3. In the PR: FEATURES.md F05 boxes, Status `done`, Entry points (`normalize`, `matchGuess`, `MatchResult`, `Db`) and Notes for others; this worklog → `Status: done`; `Closes #5`

## Verified
- `npm test`: 24 passed; `npm run test:db` against stormhacks-dev: 7 passed; `typecheck` and `lint` clean (typecheck needs `npx next typegen` first on a fresh clone for `LayoutProps`)

## Decisions & gotchas
- `matchGuess` takes an optional `db` (a transaction) so F06 can match inside its own transaction; the tests use it to roll back
- Guesses longer than 255 normalized chars skip the typo step: fuzzystrmatch errors above 255. A CASE guards over-long stored keys too
- The exact step includes `exact_only` keys; the typo step excludes them
- Ambiguous: ≥ 2 distinct answer_ids within budget → no match, `method: 'ambiguous'`
- `server-only` throws outside Next, so vitest aliases it to an empty stub

## Files touched
- lib/matching/normalize.ts, normalize.test.ts, match-guess.ts, match-guess.db.test.ts
- vitest.config.mts, test/server-only-stub.ts, package.json
