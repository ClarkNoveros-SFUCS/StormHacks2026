# #4 F04 Game generation (Gemini)

Status: done
Branch: feat/4-game-generation
Updated: 2026-10-04 02:00

## Goal
Turn a Module's chosen parsed Source Documents into a `ready` Game via one Gemini call per document, then code checks, Tier assignment and one insert transaction. Spec: `docs/architecture/game-generation-pipeline.md`.

## Done so far
- Claimed #4, branched `feat/4-game-generation` from `origin/main`.
- Plan written (below). No code yet.
- `.env.local` has `GEMINI_API_KEY` and `GEMINI_MODEL=gemini-3.8-flash`. Installed `@google/genai` ^2.27 and `zod` ^4.6.
- Fast-forwarded onto main after PR #23 (Game Modes docs, ADR-0004).
- Scope: F04 also does #21's (F13) backend boxes; posted on #21 and #4.
- Step 0 (code only): `db/migrations/20261004T0750_games_mode.sql`, `lib/modes/index.ts` (`MODES`, `ModeId`, `isModeId`), `data-model.md` shows the column. **Not applied to stormhacks-dev yet.** The user OK'd it, but the agent's permission classifier blocks writes to the shared DB, so the user runs `! npm run db:migrate` themselves.
- Step 1: `lib/games/validate.ts` (`validateDocument`, `dedupeAcrossDocuments`, types `ValidPrompt`/`ValidAnswer`/`Drop`) plus `validate.test.ts` (19 tests; the seed fixture drops nothing).
- Step 2: `lib/gemini/game-prompt.ts` (`GAME_SYSTEM_INSTRUCTION`, `gamePromptContents`, `GAME_RESPONSE_SCHEMA`) and `lib/gemini.ts` (`generateDocumentPrompts(title, pages)` → `{ response, usage, model }`, `GeminiError`). Retries 429/5xx 3× (2/5/12 s), then `GEMINI_FALLBACK_MODEL`.
- Step 4: `lib/games/generate-game.ts` (`generateGame(gameId, { db?, generate? })` → `{ status: ready|failed|skipped }`), `lib/games/queries.ts`, `lib/games/types.ts`, plus `generate-game.db.test.ts` (5 tests, fake Gemini).
- Step 5: routes `app/api/modules/[moduleId]/games/route.ts` (POST, GET) and `app/api/games/[gameId]/route.ts` (GET, DELETE). The API shape is posted on #8 and #4.
- Verified: 85 unit tests and 45 DB tests on both a local TimescaleDB (docker) and stormhacks-dev; `npm run build` OK; a real-deck end-to-end (SQL Basics PDF → real Gemini → local DB) gave a ready Game with 16 Prompts covering all kinds, 52 Answers and 61 keys. The `games.mode` migration is applied on stormhacks-dev (the user ran it).
- Spec updated: game-generation-pipeline.md (API, overload/fallback, required fields, extra rules, code layout) and setup/README.md.
- Step 3: `scripts/generate-check.ts` (`npm run generate:check -- <file>|--seed [--pages a-b] [--save f] [--from f]`). Tuned on the seed deck: 16 returned → 15 kept, all five kinds.

## Next steps
None for F04: approved and shipped in the PR that closes #4. Quality follow-ups are F14–F18 (#24–#28). The F13 run-engine assert and Mode UI are still open on #21.

## Decisions & gotchas
- **Gemini overload:** on 2026-10-04 around 01:00, 3.8-flash and 3.7-flash returned 503 "high demand" for minutes at a time; 3.6-flash and the Lite models answered. `.env.example` suggests `GEMINI_FALLBACK_MODEL=gemini-3.6-flash`.
- **Latency:** the 94-page deck took 43 s on 3.6 (fine). The 12-page seed deck took 80-125 s with ~10k thinking tokens (~$0.06-0.08 USD). A long deck may approach the 240 s timeout and `maxDuration` 300. Measure on a real deck. ThinkingLevel.LOW was tried: degenerate output (2 Prompts, no answers), so it was removed.
- **Optional fields get skipped:** Gemini left out tier/hint/explanation on single-answer kinds despite the instructions. Fix: `answers`, `tier`, `hint`, `explanation` are `required` in the schema; unused kinds send empty values, which validate.ts ignores.
- odd_one_out citing the wrong page: validation moves the Evidence to the first page naming the correct option (drops only if none does).
- **Model: `gemini-3.6-flash` main, `gemini-3.5-flash-lite` fallback** (changed from 3.8 on 2026-10-04: 3.8 failed with 503 on ~6 of 7 long requests; 3.6 failed 1 of 5). Real deck, CMPT 354 SQL Basics PDF, 94 pages: 3.6 took 43 s, ~$0.05, 16 → 15 kept, all kinds, quotes verified (1 cleared). Lite: 8 s, ~$0.01, 15 → 12 kept, but only 3 Open Prompts. The user's budget is ~$14 CAD.
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
- lib/games/generate-game.ts, generate-game.db.test.ts, queries.ts, types.ts; app/api/modules/[moduleId]/games/route.ts; app/api/games/[gameId]/route.ts; docs/architecture/game-generation-pipeline.md; docs/setup/README.md
- lib/gemini.ts, lib/gemini/game-prompt.ts, scripts/generate-check.ts, package.json (`generate:check`), .env.example
