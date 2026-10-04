# #4 F04 Game generation (Gemini)

Status: in-progress
Branch: feat/4-game-generation
Updated: 2026-10-04 00:50

## Goal
Turn a Module's chosen parsed Source Documents into a `ready` Game via one Gemini call per document, then code checks, Tier assignment and one insert transaction. Spec: `docs/architecture/game-generation-pipeline.md`.

## Done so far
- Claimed #4, branched `feat/4-game-generation` from `origin/main`.
- Plan written (below). No code yet.
- `.env.local` has `GEMINI_API_KEY` and `GEMINI_MODEL=gemini-3.8-flash`. Installed `@google/genai` ^2.27 and `zod` ^4.6.
- Fast-forwarded onto main after PR #23 (Game Modes docs, ADR-0004).
- Scope: F04 also does #21's (F13) backend boxes; posted on #21 and #4.
- Step 0 (code only): `db/migrations/20261004T0750_games_mode.sql`, `lib/modes/index.ts` (`MODES`, `ModeId`, `isModeId`), `data-model.md` shows the column. **Not applied to stormhacks-dev yet** (shared DB; waiting for the user's OK).
- Step 1: `lib/games/validate.ts` (`validateDocument`, `dedupeAcrossDocuments`, types `ValidPrompt`/`ValidAnswer`/`Drop`) plus `validate.test.ts` (18 tests; the seed fixture drops nothing).

## Next steps
0. ~~F13 backend~~ (done in code; apply with `npm run db:migrate` once the user OKs it): migration `db/migrations/<ts>_games_mode.sql` (`ALTER TABLE games ADD COLUMN mode text NOT NULL DEFAULT 'dive' CHECK (mode IN ('dive'))`), apply it, update `data-model.md`; `lib/modes/index.ts` per `game-modes.md`.
1. ~~validate.ts~~ done. `lib/games/validate.ts` (pure, relative `.ts` imports, no `server-only`): per-Prompt zod `safeParse`, checks 1–6 per document, check 7 across documents. Keep the shared checks (1–3, 7) separate from Dive's (4–6 + Tiers), per `game-modes.md`. Output: kept Prompts with Tiers assigned plus a list of drop reasons. Test: `validate.test.ts`. The seed fixture (`db/seed/graph-algorithms.json`) must pass with zero drops, plus one failing case per check.
2. `lib/gemini/game-prompt.ts` (instructions + page wrapping) and `lib/gemini.ts` (`generateDocumentPrompts`: `responseMimeType: "application/json"`, `responseJsonSchema`, temperature 0.4, timeout, one retry on 429/5xx).
3. `scripts/generate-check.ts` + `npm run generate:check -- <file>`: extract → Gemini → validate, print kept/dropped and Evidence spot-checks. Run on real lecture slides and tune the prompt.
4. `lib/games/generate-game.ts`: read `game.mode`, assert 'dive'; claim `queued → generating`, load pages, parallel Gemini calls, validate, build rows (prompts/answers/answer_keys via `normalize()`), one transaction → `ready`; < 7 → `failed`. Generator injectable for tests. `generate-game.db.test.ts` with a fake generator.
5. Routes: `POST`/`GET /api/modules/[moduleId]/games` (POST body `{ title, mode?, sourceDocumentIds[] }`, mode defaults to 'dive'), `GET`/`DELETE /api/games/[gameId]` (DELETE clears `guess_events` by hand). Comment API shapes on #4 and #8 first.
6. Hand over for review. After approval: FEATURES.md F04 section, spec updates, worklog done, PR `Closes #4`.

## Decisions & gotchas
- Model: `gemini-3.8-flash` for testing and the demo (~$0.07 USD per document, estimated). The budget is ~$14 CAD.
- The F13 run-engine assert and the Mode picker UI stay on #21.
- Gemini SDK config fields (checked in 2.27 types): `responseMimeType` + `responseJsonSchema` (plain JSON Schema) or `responseSchema` (OpenAPI subset). JSON schema can come from `z.toJSONSchema` (zod 4); strip `$schema` and test it live.
- Keys that normalize to one character from a longer name are rejected (`A*` → `a` passed check 2 on any page with the word "a"); a real one-letter name like `C` is kept. A canonical rejected this way drops its Answer. This adds to the spec, so note it in game-generation-pipeline.md before the PR.
- An Evidence quote not found verbatim (whitespace- and case-insensitive) on its page is set to null and the Answer kept (`quotesCleared` counts them).
- Validate each Prompt separately so one bad Prompt never drops the document.
- Whole-word containment on normalized text for checks 2 and 5, the same as `scripts/seed.mts` `checkFixture`.
- odd_one_out `correct_option` must be exactly one of `options` (F06 compares exactly).
- More than 15 Open Answers: keep the first 15 (`assignOpenTiers` throws above 15).
- `generateGame` runs in `after()` and never throws. A crash or restart can leave a Game stuck in `generating`.

## Files touched
- docs/worklog/aaf1007/4-game-generation.md, package.json, package-lock.json
- db/migrations/20261004T0750_games_mode.sql, lib/modes/index.ts, docs/architecture/data-model.md
- lib/games/validate.ts, lib/games/validate.test.ts
