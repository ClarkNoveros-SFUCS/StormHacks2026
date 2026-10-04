# Features: the build checklist

The single board for **what to build, who can take it, and what's done**. Each feature is one GitHub issue, worked by one person on one branch.

- **Claim:** assign yourself to the feature's issue and add the `in-progress` label (`docs/agents/coordination.md`). The claim lives on GitHub, not in this file.
- **Ship:** once the user has reviewed the work and approved it (agents never open PRs on their own), in the PR that closes the issue, tick the feature's boxes here, set its Status to `done`, and fill in **Entry points** and **Notes for others**. Edit only your own feature's section, so PRs never conflict.
- **Unblock yourself:** most features depend only on F01. F02's seed data lets every gameplay and UI feature run without the upload and AI pipelines.

## Board

| ID | Feature | Lane | Depends on | Issue | Status |
|---|---|---|---|---|---|
| F01 | Foundation: auth, DB, migrations | Platform | — | #1 | done |
| F02 | Seed data: demo Module and Game | Platform | F01 | #2 | done |
| F03 | Upload pipeline (Snowflake) | Pipelines | F01 | #3 | planned |
| F04 | Game generation (Gemini) | Pipelines | F01 (F02 for test pages) | #4 | planned |
| F05 | Answer matching | Gameplay | F01 | #5 | done |
| F06 | Run engine and scoring API | Gameplay | F01, F05 | #6 | done |
| F07 | Progress: Personal Best and Mastery | Gameplay | F01 | #7 | done |
| F08 | Modules list and Module page UI | Frontend | F01 (mock F03/F04) | #8 | planned |
| F09 | Run screen and Reveal UI | Frontend | F06 (mock), F10 | #9 | planned |
| F10 | Visual design system (Krillion style) | Frontend | design session | #10 | planned |
| F11 | Game page UI | Frontend | F07 | #11 | planned |
| F12 | Deploy and demo prep | Platform | everything | #12 | planned |

Status values: `planned` · `done` · `blocked`. "In progress" is shown by the GitHub `in-progress` label.

### Suggested split for 4 people

| Person | Lane | Order |
|---|---|---|
| A | Platform | F01 → F02 → help F03 → F12 |
| B | Pipelines | F03 → F04 (start F04's prompt work early against F02 pages) |
| C | Gameplay | F05 → F06 → F07 |
| D | Frontend | F10 → F08 → F09 → F11 |

F01 goes first and should be small: get the schema merged within the first couple of hours so everyone can build on it.

---

## F01 Foundation: auth, DB, migrations
Spec: `docs/architecture/overview.md`, `docs/architecture/data-model.md` · **Setup:** `docs/setup/tiger-data.md`, `docs/setup/README.md` (Clerk)
- [x] Tiger Cloud service created (`stormhacks-dev`, follow `docs/setup/tiger-data.md`)
- [x] `DATABASE_URL` shared with the team privately (ask Anton)
- [x] Clerk installed; every route except `/` is protected (per resource, see Notes); signed-in `/` redirects to `/modules`
- [x] `lib/db.ts` (`postgres` client, server only) and `lib/auth.ts` (`requirePlayer()` / `getApiPlayer()` return the Clerk id and upsert `players`)
- [x] `scripts/migrate.mjs` plus the `schema_migrations` table; `npm run db:migrate`
- [x] Initial migration = the full schema from `data-model.md`, including the `guess_events` hypertable and `fuzzystrmatch`
- [x] `.env.example` listing every variable from `overview.md`
- [x] Applied cleanly to a Tiger Cloud service (`stormhacks-dev`, us-west-2, 1 CPU, TimescaleDB 2.30.2)

Entry points: `lib/db.ts` (`sql`), `lib/auth.ts` (`requirePlayer()`, `getApiPlayer()`), `proxy.ts`, `scripts/migrate.mjs` (`npm run db:migrate`, `-- --status`), `db/migrations/20261003T1830_init.sql`, `.env.example`, placeholder `app/modules/page.tsx`

Notes for others:
- **Auth is per resource, not in the proxy.** Clerk v7 deprecated `createRouteMatcher` checks in `proxy.ts`, so it only runs `clerkMiddleware()`. Start every page and server action with `const playerId = await requirePlayer()` (signed out → redirect to sign-in). Start every route handler with `const playerId = await getApiPlayer(); if (!playerId) return Response.json({ error: "Not signed in" }, { status: 401 });`. Don't use `requirePlayer()` in route handlers: Clerk would answer a signed-out `fetch` with a redirect to the sign-in page. Then filter every query by `playerId`.
- **Clerk v7 (Core 3):** `<SignedIn>`/`<SignedOut>` are gone; use `<Show when="signed-in">`. `<ClerkProvider>` sits inside `<body>`. The root layout shows a `<UserButton>` header when signed in (restyle freely, F10). Sign-in and sign-up live at `/sign-in` and `/sign-up` (scaffolded by `clerk init`). Getting keys: `docs/setup/README.md`.
- **DB:** `import { sql } from "@/lib/db"` and use tagged templates (parameterized). Transactions: `sql.begin(async (tx) => …)`.
- **Migrations:** add `db/migrations/<YYYYMMDDTHHMM>_<name>.sql`; each file runs in one transaction (many statements are fine; no `BEGIN`/`COMMIT` in the file). Never edit an applied file. Create continuous aggregates `WITH NO DATA` so they can run inside a transaction.
- **Deferred FKs:** the four FKs from the games branch into source documents and pages are `DEFERRABLE INITIALLY DEFERRED`, so deleting a Module or Player cascades cleanly. Deleting a file a Game uses still fails (`23503`), but only at commit inside a transaction, so F03 should check `game_sources` first and return 409. Details in `data-model.md`.
- `app/modules/page.tsx` is a placeholder for F08 to replace.

## F02 Seed data: demo Module and Game
Spec: `docs/architecture/data-model.md`
- [x] `npm run db:seed` creates, for a given Clerk user id, a "Graph Algorithms" Module, one parsed Source Document with ~10 pages, and one `ready` Game
- [x] The Game has ≥ 7 Prompts covering all five kinds, with Tiers, Hints, Evidence and `answer_keys` (use the original sample JSON's graph-algorithm content)
- [x] Idempotent: re-running replaces the demo data and nothing else

Entry points: `npm run db:seed -- <clerkUserId>` (or `SEED_PLAYER_ID=…`; `-- --check` validates the fixture without a DB), `scripts/seed.mts`, `db/seed/graph-algorithms.json`, `lib/scoring/tiers.ts` (`TIERS`, `Tier`, `TIER_POINTS`, `assignOpenTiers(n)`)

Notes for others:
- **What you get:** a 12-slide PPTX (one page per slide, `status 'parsed'`) and a `ready` Game with 12 Prompts: 3 open, 3 cloze, 2 definition_to_term, 2 ordered_recall, 2 odd_one_out. That's 30 Answers and 80 `answer_keys`. Every single-answer Prompt has a Tier, Hint and explanation. Get your Clerk user id from the Clerk dashboard → Users.
- **Needs Node ≥ 22.18** (`engines` in package.json). The script runs `.mts` directly with Node's type stripping, so no `tsx` is needed. On a fresh clone, run `npx next typegen` before `npm run typecheck`.
- **Re-seeding wipes the whole demo Module.** Its id is `md5('seed:graph-algorithms:' || playerId)` as a uuid. A re-run deletes that Module (cascade) plus its Games' `guess_events`, then inserts fresh rows, including anything you added inside it (for example Games while testing F04). Your other Modules, even one named "Graph Algorithms", are never touched. Game, Prompt and Answer ids change on every run, so don't hard-code them.
- **F04:** the fixture's `game.prompts` use the Gemini response shape and pass checks 1–7, so you can use them as known-good input for `validate.ts`. Open Prompt Answers are listed most obvious first, and `assignOpenTiers` gives them their Tiers and `rarity_rank`. ordered_recall and odd_one_out get one Answer each (`'correct order'` or the correct option), with `evidence_page_id` set on both the Prompt and that Answer and no `answer_keys`.
- **F05/F06:** "Name a graph algorithm" reproduces `answer-matching.md`'s worked examples. BFS and DFS are `exact_only`, and A* isn't an Answer.
- **F03:** the seeded document has `stage_path = NULL` (it never went to Snowflake), so the delete and retry routes must handle that.
- **postgres.js and jsonb:** pass arrays as `tx.json(arr)`. A pre-stringified value cast with `::jsonb` gets stored as a jsonb string.

## F03 Upload pipeline (Snowflake)
Spec: `docs/architecture/upload-pipeline.md` · **Setup:** `docs/setup/snowflake.md`
- [ ] Snowflake account, warehouse, stage, `STUDY_APP` role and key-pair service user created; parse check (step 5) passes in Snowsight
- [ ] `serverExternalPackages: ['snowflake-sdk']` in `next.config.ts`
- [ ] Snowflake stage created (SQL in the spec); `lib/snowflake.ts` with `putFile`, `parseStagedFile`, `removeStagedFile`
- [ ] `POST /api/modules/[moduleId]/documents`: validates type and size, inserts, responds 202, parses in `after()`
- [ ] `AI_PARSE_DOCUMENT` LAYOUT + page_split → `source_pages`; > 100 pages fails cleanly
- [ ] Status transitions `uploaded → parsing → parsed | failed`, with a user-facing error
- [ ] `POST /api/documents/[id]/retry`; `DELETE /api/documents/[id]` returns 409 while a Game uses the file
- [ ] Tested with a real PDF, a PPTX and a DOCX

Entry points: — · Notes for others: —

## F04 Game generation (Gemini)
Spec: `docs/architecture/game-generation-pipeline.md` · **Setup:** `docs/setup/README.md` (Gemini)
- [ ] Gemini API key created; `GEMINI_MODEL` picked and shared
- [ ] `POST /api/modules/[moduleId]/games` (title + parsed doc ids) responds 202 and generates in `after()`
- [ ] `lib/gemini.ts` uses structured JSON output with the spec's schema; one call per document, run in parallel
- [ ] zod validation plus checks 1–7 from the spec; failing items are dropped, not the whole Game
- [ ] Open Prompt Tier assignment in `lib/scoring/tiers.ts`, unit-tested with N = 4 and N = 11
- [ ] `answer_keys` written using F05's `normalize()`
- [ ] Fewer than 7 Prompts → `failed` with a readable error; otherwise `ready`
- [ ] Tested on real lecture slides; spot-check that Evidence quotes appear on their pages

Entry points: — · Notes for others: —

## F05 Answer matching
Spec: `docs/architecture/answer-matching.md`
- [x] `lib/matching/normalize.ts` with unit tests for every row of the spec's examples table
- [x] `lib/matching/match-guess.ts`: `matchGuess(promptId, raw)` with exact → typo (length budget) → ambiguity rule; `exact_only` respected
- [ ] Integration test against F02's seeded Prompt (BFS/DFS can't fuzzy-match each other). Covered for now by `match-guess.db.test.ts` with its own rolled-back fixture (same graph-algorithm Answers and cases); a seeded-Prompt test follows once F02 merges.

Entry points: `lib/matching/normalize.ts` (`normalize()`), `lib/matching/match-guess.ts` (`matchGuess(promptId, raw, db?)`, `MatchResult`, `Db`, `typoBudget()`), tests in `lib/matching/*.test.ts`, `vitest.config.mts`

Notes for others:
- **F04:** write every canonical name and Alias to `answer_keys` as `normalize(text)`, with `exact_only` copied from the Answer. Never normalize in SQL.
- **F06:** call `matchGuess(promptId, raw, tx)` inside your transaction. `{ matched: false }` with `method: 'ambiguous'` is a wrong guess like `'none'`; log `method` and `distance` to `guess_events`. An empty normalized guess returns `'none'`: don't charge the −3 s for it.
- Guesses over 255 normalized chars never typo-match (fuzzystrmatch limit); they still exact-match.
- **Tests:** vitest 4 (vitest 5 needs `@types/node` ≥ 22). `npm test` runs unit tests; `npm run test:db` runs `*.db.test.ts` against `DATABASE_URL` from `.env.local` (skipped without it). `server-only` is aliased to `test/server-only-stub.ts`, so server modules import fine. Pattern for DB tests: build data inside `sql.begin()` and throw to roll back (see `withFixture` in `match-guess.db.test.ts`).
- Fresh clone: run `npx next typegen` before `npm run typecheck`, or `LayoutProps` in `app/layout.tsx` fails.

## F06 Run engine and scoring API
Spec: `docs/architecture/run-and-scoring.md`
- [x] `lib/scoring/points.ts`: `openPoints`, `singlePoints` (Staleness halving with a minimum of 1; Hint drops a Tier, common → 5), unit-tested
- [x] `lib/runs/run-engine.ts`: create (7 random Prompts, abandon other in-progress Runs), startPrompt, guess, hint, timeout, advance, finish
- [x] Server-owned clock: deadline, −3 s per wrong typed guess, 500 ms grace, late requests close the Prompt as timeout first
- [x] Put-in-order and odd-one-out are one-shot
- [x] Every guess is written to `guess_events`
- [x] All `/api/runs/...` routes and `GET /reveal`, returning the spec's `RunState`/`GuessResult` types; Answers and Hints never leak early
- [x] Shared types exported from `lib/runs/types.ts` for the frontend

Entry points: `lib/runs/run-engine.ts` (`createRun`, `getRunState`, `startPrompt`, `guess`, `revealHint`, `timeoutPrompt`, `getReveal`, `RunError`), `lib/runs/types.ts` (client-safe API types), `lib/runs/http.ts` (`runRoute`), `lib/scoring/points.ts`, `lib/scoring/tiers.ts`, routes `app/api/games/[gameId]/runs` and `app/api/runs/[runId]/{,start-prompt,guess,hint,timeout,reveal}`

Notes for others:
- **F09 flow:** `POST /api/games/[gameId]/runs` → `{ runId }`; per Prompt: `POST start-prompt` (starts the 25 s clock; idempotent), then `guess` / `hint`, and `POST timeout` when your countdown hits 0. A new Prompt shows `startedAt: null` until you call `start-prompt`, so you can play a transition first. After position 7 the state is `finished` with `prompt: null`; then `GET reveal`.
- **Clock:** render from `deadlineAt` plus the offset `Date.parse(serverNow) − Date.now()`; every response carries a fresh `serverNow`. The server allows guesses 500 ms past the deadline and `/timeout` up to 250 ms early.
- **Differences from the spec's types:**
  - `GuessResult` adds `{ correct: false, timedOut: true }` (the guess arrived too late; the Prompt closed as a timeout) and `correctOrder` on a wrong put-in-order.
  - Send `position` with each guess: a guess for an already-closed Prompt then gets 409 instead of landing on the next one.
  - `RunState` adds `promptCount`, `hint` (once used, so reloads keep it) and `prompt: null` when the Run is over.
- **Errors:** `{ error }` with 400 (bad body, empty guess), 401, 404 (not yours or malformed id), 409 (wrong state: not started, already closed, Run finished or abandoned, no Hint, Reveal before finish).
- **F07:** `Reveal.progress` is `null`; fill it in `getReveal`. Abandoned Runs keep their `guess_events`, so they already count toward Mastery and Staleness.
- **F04:** `lib/scoring/tiers.ts` owns the Tier table; add Open Prompt Tier assignment there.
- **Engine functions** take `(tx, playerId, …, now)` and lock the run row; call them inside `sql.begin`. Tests drive them with a fake clock (`run-engine.db.test.ts`).
- The one-submission rule for put-in-order and odd-one-out is confirmed but not yet in `CONTEXT.md`.

## F07 Progress: Personal Best and Mastery
Spec: `docs/architecture/data-model.md` (Progress queries)
- [x] `lib/progress.ts`: `personalBest`, `mastery`, `masteryByTier`, `recentRuns` (plus `progressForGames` for F08's cards)
- [x] The Reveal includes "new Personal Best?" and Mastery before → after: `getReveal` fills `Reveal.progress` from `runProgress(playerId, runId, tx)`
- [x] Optional: the `player_game_daily` continuous aggregate and a query for the stats chart (`dailyStats`). The migration is applied to Tiger Cloud `stormhacks-dev`

Entry points: `lib/progress.ts` (`personalBest`, `mastery`, `masteryByTier`, `recentRuns`, `progressForGames`, `runProgress`, `dailyStats`; types `Mastery`, `RecentRun`, `GameProgress`, `RunProgress`, `DailyStat`, `Db`; `Tier` comes from `lib/scoring/tiers.ts`), `db/migrations/20261004T0316_player_game_daily.sql`, tests in `lib/progress.db.test.ts`

Notes for others:
- **All functions are server only and take `playerId` first.** Answers are counted only through Games the caller owns: another Player's `gameId` reads 0 of 0, and `runProgress` returns null. Pass real uuids; a malformed id makes Postgres throw `22P02`, so load or validate the Game/Run first.
- **Reveal (F06/F09):** `GET /api/runs/[runId]/reveal` now returns `progress: { personalBest, isNewPersonalBest, masteryBefore, masteryAfter }` (percentages; `personalBest` is as of that Run). `runProgress` takes an optional transaction as its last argument. Keep setting `finished_at` with `status = 'finished'`; Runs without it get `progress: null`.
- **F08:** `progressForGames(playerId, gameIds)` returns a `Map` of `{ personalBest, mastery }` for all cards in one query.
- **F11:** `personalBest`, `mastery` (`pct` 0–100, rounded down), `masteryByTier` (every Tier present), `recentRuns` (finished only, newest first; link each to its Reveal), `dailyStats` (oldest first; `day` is Vancouver midnight as an instant, so format it with `timeZone: "America/Vancouver"`; days without guesses are left out).
- **`player_game_daily`** is real-time (`materialized_only = false`), so a Run just played shows up immediately. Never refresh it by hand with a NULL end; see `data-model.md`.
- Definitions of new Personal Best and Mastery before → after: `run-and-scoring.md` § Reveal.

## F08 Modules list and Module page UI
Spec: `docs/architecture/ui-map.md`
- [ ] `/modules`: list, create, empty state
- [ ] `/modules/[moduleId]` Files panel: upload drop zone, status pills with polling, Retry, "Used by N Games", delete guard
- [ ] Games panel: cards with **source-file chips**, status polling, Personal Best, Mastery bar, Play
- [ ] New Game dialog: title + checkbox list of Ready files
- [ ] Hover linking: chip ↔ file highlight

Entry points: — · Notes for others: —

## F09 Run screen and Reveal UI
Spec: `docs/architecture/ui-map.md`, `docs/architecture/run-and-scoring.md`, `docs/design/`
- [ ] `/runs/[runId]`: countdown driven by the server deadline (clock offset), position and score, input for all five kinds
- [ ] Wrong-guess feedback (shake, −3 s), correct-answer pop (Tier, points, repeat-answer tag), timeout transition
- [ ] Hint button: reveal, Tier drop shown, used once
- [ ] `/runs/[runId]/reveal`: per-Prompt results, all Open Prompt Answers by Tier with page and quote, PB banner, Mastery change

Entry points: — · Notes for others: —

## F10 Visual design system (Krillion style)
Spec: `docs/design/` (written in the frontend design session)
- [ ] Design tokens (color, type, spacing) in Tailwind 4 theme
- [ ] Core components: buttons, cards, chips, pills, timer, score pop, Tier badges
- [ ] Motion and physics primitives used by F09

Entry points: — · Notes for others: —

## F11 Game page UI
Spec: `docs/architecture/ui-map.md`
- [ ] `/games/[gameId]`: source chips, Personal Best, Mastery percentage, per-Tier found counts, recent Runs, Play
- [ ] Optional: accuracy-over-time chart (F07's continuous aggregate)

Entry points: — · Notes for others: —

## F12 Deploy and demo prep
Spec: `docs/architecture/overview.md` (open questions)
- [ ] Choose the deploy target; resolve the upload body-size limit if it's Vercel
- [ ] Production env vars; migrations run against production
- [ ] Demo account with a polished Module and Game; a rehearsed demo script
- [ ] README: what it is, how to run it, the sponsor tracks used

Entry points: — · Notes for others: —
