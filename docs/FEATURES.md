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
| F03 | Upload pipeline (Node extraction) | Pipelines | F01 | #3 | done |
| F04 | Game generation (Gemini) | Pipelines | F01 (F02 for test pages) | #4 | done |
| F05 | Answer matching | Gameplay | F01 | #5 | done |
| F06 | Run engine and scoring API | Gameplay | F01, F05 | #6 | done |
| F07 | Progress: Personal Best and Mastery | Gameplay | F01 | #7 | done |
| F08 | Modules list and Module page UI | Frontend | F01 (mock F03/F04) | #8 | planned |
| F09 | Run screen and Reveal UI | Frontend | F06 (mock), F10 | #9 | planned |
| F10 | Visual design system (site + Mode themes) | Frontend | design session | #10 | planned |
| F11 | Game page UI | Frontend | F07 | #11 | planned |
| F12 | Deploy and demo prep | Platform | everything | #12 | planned |
| F13 | Game Modes: `games.mode` and the Mode picker | Platform | F01 | #21 | planned |
| F14 | Generation scorecard (eval on real decks) | Pipelines | F04 | #24 | planned |
| F15 | Example Prompts in the generator instructions | Pipelines | F04 (F14 to measure) | #25 | planned |
| F16 | Gemini verification pass for Answers | Pipelines | F04 (F14 to measure) | #26 | planned |
| F17 | Overgenerate and select the best Prompts | Pipelines | F04, F14 | #27 | planned |
| F18 | Open Prompt answer expansion with retrieval (pgvector, stretch) | Pipelines | F04, F14 | #28 | planned |
| F19 | Landing page and site-wide UI overhaul | Frontend | F10 | #32 | planned |
| F20 | Game Modes engine and generation: Apogee, Leap, Pairs, Blitz | Platform | F04, F06 | #33 | done |
| F21 | Social backend: profiles, XP, streaks, heatmap, badges, friends, leaderboards | Platform | F01, F07 | #34 | done |
| F22 | Courses backend and the seeded Python Basics course | Platform | F20 | #35 | planned |
| F23 | Daily Dive backend | Platform | F21, F22 | #36 | planned |
| F24 | Apogee and Leap screens (three.js) | Frontend | F10, F20 | #37 | planned |
| F25 | Pairs and Blitz screens | Frontend | F10, F20 | #38 | planned |
| F26 | Profile, Friends and Leaderboard pages | Frontend | F10, F21 | #39 | planned |
| F27 | Explore, Course and Topic pages | Frontend | F10, F22 | #40 | planned |
| F28 | Daily Dive hub page | Frontend | F09, F23 | #41 | planned |
| F29 | Arena: three.js FPS study Mode (stretch) | Frontend | F20, F24 | #42 | planned |

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
- **postgres.js and jsonb:** pass arrays as `tx.json(arr)`. A pre-stringified value cast with `::jsonb` gets stored as a jsonb string.

## F03 Upload pipeline (Node extraction)
Spec: `docs/architecture/upload-pipeline.md` · Decision: `docs/adr/0003-parse-uploads-in-node.md` (Snowflake trial blocks `AI_PARSE_DOCUMENT`)
- [x] `lib/documents/extract/`: PDF (`unpdf`), PPTX (`jszip`), DOCX (`mammoth`) → one markdown string per page, unit-tested on fixtures
- [x] `serverExternalPackages: ['unpdf', 'mammoth']` and `proxyClientMaxBodySize: '26mb'` in `next.config.ts`
- [x] `POST /api/modules/[moduleId]/documents`: validates type and size, inserts, responds 202, parses in `after()`; `GET` lists the Module's files
- [x] Pages → `source_pages`; > 100 pages and text-less (scanned) files fail cleanly
- [x] Status transitions `uploaded → parsing → parsed | failed`, with a user-facing error
- [x] `DELETE /api/documents/[id]` returns 409 while a Game uses the file (no Retry: delete and re-upload)
- [x] `npm run parse:check -- <file>` parses a local file without the app
- [ ] Tested with a real PDF, a PPTX and a DOCX (real PDF done: MIT 6.100L lec 1, 57 slides; PPTX/DOCX only on generated fixtures)

Entry points: `POST`/`GET /api/modules/[moduleId]/documents` (multipart field `file`), `GET`/`DELETE /api/documents/[documentId]`, `lib/documents/extract/index.ts` (`extractPages(bytes, mimeType)`), `lib/documents/parse-document.ts` (`parseDocument`), `lib/documents/parsed-pages.ts` (`validateUpload`, `toParsedPages`, `MAX_PAGES`, `ALLOWED_TYPES`), `npm run parse:check -- <file> [--full]`

Notes for others:
- **No Snowflake** (ADR-0003): trial accounts block `AI_PARSE_DOCUMENT`. Parsing is local and takes well under a second; no env vars needed. `SNOWFLAKE_*` are gone from `.env.example`.
- **No Retry route:** the file isn't kept. A `failed` document shows `error` (already user-facing); the Player deletes it and uploads again. `stage_path` is always null.
- **F04:** `source_pages.content_md` is markdown: `#`/`##` headings, `- ` bullets, ` | ` between PDF table columns, markdown tables for PPTX/DOCX, `Speaker notes:` at the end of PPTX slides. Running headers/footers and slide numbers are stripped from PDFs. Text is NFC-normalized. DOCX "pages" are sections (split at page breaks, else ~3000 chars at headings).
- **F08:** poll `GET /api/modules/[id]/documents` (or re-render the server component) while any document is `uploaded`/`parsing`. Uploads up to 25 MB work because `next.config.ts` raises `proxyClientMaxBodySize` (proxy.ts truncates at 10 MB otherwise).
- **Limits:** scanned PDFs (no text layer) fail with a clear message; no `.ppt`/`.doc`; diagram-heavy slides come out jumbled.

## F04 Game generation (Gemini)
Spec: `docs/architecture/game-generation-pipeline.md` · **Setup:** `docs/setup/README.md` (Gemini)
- [x] Gemini API key created; `GEMINI_MODEL` picked and shared (`gemini-3.6-flash`, fallback `gemini-3.5-flash-lite`)
- [x] `POST /api/modules/[moduleId]/games` (title + parsed doc ids) responds 202 and generates in `after()`
- [x] `lib/gemini.ts` uses structured JSON output with the spec's schema; one call per document, run in parallel
- [x] zod validation plus checks 1–7 from the spec; failing items are dropped, not the whole Game
- [x] Open Prompt Tier assignment in `lib/scoring/tiers.ts`, unit-tested with N = 4 and N = 11 (built in F02 as `assignOpenTiers`; tests in `tiers.test.ts`, #19)
- [x] `answer_keys` written using F05's `normalize()`
- [x] Fewer than 7 Prompts → `failed` with a readable error; otherwise `ready`
- [x] Tested on real lecture slides; spot-check that Evidence quotes appear on their pages (CMPT 354 SQL Basics PDF, 94 pages → ready Game, 16 Prompts covering all five kinds; quotes are verified in code)

Entry points: `POST`/`GET /api/modules/[moduleId]/games`, `GET`/`DELETE /api/games/[gameId]`, `lib/games/generate-game.ts` (`generateGame(gameId, { db?, generate? })`), `lib/games/validate.ts` (`validateDocument`, `dedupeAcrossDocuments`), `lib/games/queries.ts` (`getPlayerGame`, `listModuleGames`), `lib/games/types.ts` (`GameSummary`, client-safe), `lib/gemini.ts` (`generateDocumentPrompts`), `lib/gemini/game-prompt.ts` (instructions + schema), `lib/modes/index.ts` (`MODES`), `npm run generate:check -- <file>|--seed`

Notes for others:
- **F08:** `POST` `{ title, mode?, sourceDocumentIds[] }` → 202 `{ game }`; poll `GET /api/modules/[id]/games` every ~3 s while any Game is `queued`/`generating` (both show as "Generating…"). `game.sources` gives the file chips; `game.error` is user-facing. 409 means a chosen file isn't Ready. A failed Game is deleted and made again (no retry). Full API: `game-generation-pipeline.md` § API.
- **Generation takes ~45 s** for a 94-page deck (one Gemini call per file, in parallel). A Game unfinished after 10 minutes is marked `failed` on the next read.
- **Gemini overload is the main risk:** 3.8-flash returned 503 on most long requests, hence 3.6-flash plus a Lite fallback (a weaker Game, but still a Game). Set `GEMINI_FALLBACK_MODEL` (`.env.example`).
- **Tune the prompt** with `npm run generate:check -- <file> --save out.json`, then `--from out.json` to re-check for free. Quality work is planned in F14–F18.
- **Tests:** `validate.test.ts` (unit, checks 1–7 and the seed fixture), `generate-game.db.test.ts` (DB, fake Gemini; needs the `games.mode` migration).

## F05 Answer matching
Spec: `docs/architecture/answer-matching.md`
- [x] `lib/matching/normalize.ts` with unit tests for every row of the spec's examples table
- [x] `lib/matching/match-guess.ts`: `matchGuess(promptId, raw)` with exact → typo (length budget) → ambiguity rule; `exact_only` respected
- [x] Integration test against F02's seeded Prompt (BFS/DFS can't fuzzy-match each other): `match-guess.seed.db.test.ts` builds the seed fixture's typed Prompts in a rolled-back transaction (#19)

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
- [x] Every accepted guess is written to `guess_events`
- [x] All `/api/runs/...` routes and `GET /reveal`, returning the spec's `RunState`/`GuessResult` types; Answers and Hints never leak early
- [x] Shared types exported from `lib/runs/types.ts` for the frontend

Entry points: `lib/runs/run-engine.ts` (`createRun`, `getRunState`, `startPrompt`, `guess`, `revealHint`, `timeoutPrompt`, `getReveal`, `RunError`), `lib/runs/types.ts` (client-safe API types), `lib/runs/http.ts` (`runRoute`), `lib/scoring/points.ts`, `lib/scoring/tiers.ts`, routes `app/api/games/[gameId]/runs` and `app/api/runs/[runId]/{,start-prompt,guess,hint,timeout,reveal}`

Notes for others:
- **F09 flow:** `POST /api/games/[gameId]/runs` → `{ runId }`; per Prompt: `POST start-prompt` (starts the 25 s clock; idempotent), then `guess` / `hint`, and `POST timeout` when your countdown hits 0. A new Prompt shows `startedAt: null` until you call `start-prompt`, so you can play a transition first. After position 7 the state is `finished` with `prompt: null`; then `GET reveal`.
- **Clock:** render from `deadlineAt` plus the offset `Date.parse(serverNow) − Date.now()`; every response carries a fresh `serverNow`. The server allows guesses 500 ms past the deadline and `/timeout` up to 250 ms early.
- **Types and edge cases:** `run-and-scoring.md` (API, edge cases, Reveal) now matches the code; `lib/runs/types.ts` is the source of truth. Send `position` with each guess: a guess for an already-closed Prompt then gets 409 instead of landing on the next one.
- **Errors:** `{ error }` with 400 (bad body, empty guess), 401, 404 (not yours or malformed id), 409 (wrong state: not started, already closed, Run finished or abandoned, no Hint, Reveal before finish).
- **Reveal progress:** F07 fills `Reveal.progress` in `getReveal`. Abandoned Runs keep their `guess_events`, so they count toward Mastery and Staleness.
- **F04:** `lib/scoring/tiers.ts` owns the Tier table and already has Open Prompt Tier assignment (`assignOpenTiers`, from F02).
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

## F09 Run screen and Reveal UI (Dive)
Spec: `docs/architecture/ui-map.md`, `docs/architecture/run-and-scoring.md`, `docs/design/modes/dive.md`
- [ ] `/runs/[runId]`: countdown driven by the server deadline (clock offset), position and score, input for all five kinds
- [ ] Wrong-guess feedback (shake, −3 s), correct-answer pop (Tier, points, repeat-answer tag), timeout transition
- [ ] Hint button: reveal, Tier drop shown, used once
- [ ] `/runs/[runId]/reveal`: per-Prompt results, all Open Prompt Answers by Tier with page and quote, PB banner, Mastery change

Entry points: — · Notes for others: —

## F10 Visual design system (site + Mode themes)
Spec: `docs/design/design-system.md` (being rewritten for the new direction: `docs/worklog/aaf1007/overnight-decisions.md` §1–3, §14) · reference: `docs/design/mock/` (open `index.html`)
- [ ] Fonts (VT323, Mulish) and the semantic tokens in the Tailwind 4 theme; per-Mode values under `[data-theme=…]`
- [ ] Shell components: PxButton, Panel, Tile, Chip, StatusPill, Meter, ModeTile, ModeBadge, Modal, Mascot
- [ ] Stage (scene + particles + overlays) with the ocean scene and house theme
- [ ] Round and results building blocks used by F09
- [ ] Motion keyframes and `lib/motion/` (spring, particles); sound events (`lib/ui/sfx.ts`)

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

## F13 Game Modes: `games.mode` and the Mode picker
Spec: `docs/architecture/game-modes.md`, ADR-0004
- [x] Migration: `games.mode text NOT NULL DEFAULT 'dive' CHECK (mode IN ('dive'))`; `data-model.md` updated from "planned" to the real column (shipped with F04; applied to stormhacks-dev)
- [x] `lib/modes/index.ts` (`MODES`, `ModeId`); `POST /api/modules/[moduleId]/games` accepts `mode` (default `'dive'`) and validates it (shipped with F04)
- [x] Generation and the run engine read `game.mode` (generation since F04; F20 made both dispatch on it for five Modes)
- [ ] New Game dialog: Mode tiles (Dive + locked "More modes soon"); Game cards and the Game page show the Mode badge

Entry points: — · Notes for others: —

## F14 Generation scorecard (eval on real decks)
Spec: `docs/architecture/game-generation-pipeline.md` § Improving output quality · Issue #24 (do this first: F15–F17 are judged by it)
- [ ] 3–4 real eval decks (PDF, PPTX, DOCX + the seed deck); Gemini responses saved with `--save`
- [ ] A scorecard per deck: Prompts returned/kept, kinds, Open Prompts, Answers per Open Prompt, quotes verified, Hints removed, drops by reason, seconds, cost
- [ ] Replays saved responses (`--from`) for free code-only comparisons
- [ ] Baseline recorded in the spec

Entry points: — · Notes for others: —

## F15 Example Prompts in the generator instructions
Spec: `docs/architecture/game-generation-pipeline.md` § Improving output quality · Issue #25
- [ ] 3–4 example Prompts from the seed fixture in `lib/gemini/game-prompt.ts`
- [ ] "Bad → good" pairs for compound Open Prompts and give-away Hints
- [ ] F14 scorecard before/after

Entry points: — · Notes for others: —

## F16 Gemini verification pass for Answers
Spec: `docs/architecture/game-generation-pipeline.md` § Improving output quality · Issue #26
- [ ] One verification call per document: per-Answer "does the quote support it?", per-Prompt clear/duplicate
- [ ] Drop unsupported Answers, re-run check 4 and Tier assignment; drop unclear Prompts and duplicates
- [ ] A failed verification call keeps the unverified Prompts (logged), never fails the Game
- [ ] Added time and cost measured; F14 scorecard before/after

Entry points: — · Notes for others: —

## F17 Overgenerate and select the best Prompts
Spec: `docs/architecture/game-generation-pipeline.md` § Improving output quality · Issue #27
- [ ] Ask for ~25 Prompts per document
- [ ] `selectPrompts`: score by Answers, kind and page coverage, near-duplicates; keep the best 15–20; unit-tested
- [ ] F14 scorecard before/after, including latency

Entry points: — · Notes for others: —

## F18 Open Prompt answer expansion with retrieval (pgvector, stretch)
Spec: `docs/architecture/game-generation-pipeline.md` § Improving output quality · Issue #28 · Stretch; Tiger Data sponsor angle
- [ ] Migration: pgvector (+ pgvectorscale) and `source_pages.embedding` (comment on the issue first: shared schema)
- [ ] Pages embedded at upload; failures never fail the upload
- [ ] Per Open Prompt: retrieve nearest pages → Gemini lists every supported Answer → merge, checks 1–3, re-rank, reassign Tiers
- [ ] F14 scorecard before/after (Answers per Open Prompt, rare Answers from new pages)
- [ ] README mentions the sponsor use (F12)

Entry points: — · Notes for others: —

## F19 Landing page and site-wide UI overhaul
Spec: `docs/worklog/aaf1007/overnight-decisions.md` · Issue #32 (checklist lives on the issue until this feature ships)
- [ ] See the issue checklist

Entry points: — · Notes for others: —

## F20 Game Modes engine and generation: Apogee, Leap, Pairs, Blitz
Spec: `docs/architecture/game-modes.md`, `run-and-scoring.md`, `game-generation-pipeline.md` (decisions: `docs/worklog/aaf1007/overnight-decisions.md` §4, §12–13) · Issue #33
- [x] Migration: widen `games.mode` CHECK to dive, apogee, leap, pairs, blitz (+ arena reserved); new Prompt kinds `multiple_choice` and `true_false` (additive) (`20261004T1000_game_modes_engine.sql`, applied to stormhacks-dev; also `prompts.is_true`, `runs.mode_state`, `run_prompts.position` ≥ 1)
- [x] `lib/modes/<mode>/` split: generate (instructions, schema, kinds, checks) and rules (Run length, clock, penalties, scoring, pass bar); Dive moved without behaviour change
- [x] Apogee = Dive rules; Leap (10 MCQ, 15 s, hearts, streak multiplier, 50/50); Pairs (2×6 boards, 60 s); Blitz (60 s true/false, combo)
- [x] Run engine dispatches on `game.mode`; API types extended per Mode; Answers never leak early
- [x] Unit + DB tests per Mode; `generate:check --mode <m>`; docs (game-modes.md, run-and-scoring.md, CONTEXT.md)

Entry points: `lib/modes/index.ts` (`MODES`), `lib/modes/rules.ts` (`passedRun`), `lib/runs/types.ts` (state/result/Reveal unions on `mode`), `lib/runs/run-engine.ts` (`answer`, `pair`, `applyLifeline`, `getRunSummary`), routes `POST /api/runs/[runId]/answer|pair|lifeline`, `npm run generate:check -- --seed --mode leap`, `npm run db:seed -- <playerId>` (now also seeds Apogee, Leap, Pairs and Blitz Games) · Notes for others: **UI lanes (F24, F25, F29):** build against `lib/runs/types.ts`; narrow with `switch (state.mode)` or `assertMode`. For Leap, Pairs and Blitz the question/Board/statement is `null` until `start-prompt` (show a "ready" beat), and the next one needs another `start-prompt` (Blitz deals the next statement in the answer response). Pairs card ids are opaque. Rule constants for HUDs are in `lib/modes/<mode>/rules.ts` (client-safe). **F21/F22:** every Reveal has `summary: RunSummary` and `passed`; server code can call `getRunSummary(tx, playerId, runId)`. `GameSummary.mode` can now be any of the five. Design stubs: `docs/design/modes/{apogee,leap,pairs,blitz}.md`.

## F21 Social backend: profiles, XP, streaks, heatmap, badges, friends, leaderboards
Spec: `docs/architecture/social.md`, ADR-0005, decisions §6, §8, §12 (Q8, Q11, Q12), §13 (Q17) · Issue #34
- [x] players: username, display_name, image_url, avatar (pixel id), use_photo (plus bio, banner)
- [x] xp_events hypertable, levels, ocean ranks, streak (Vancouver days)
- [x] player_activity_daily continuous aggregate + gapfilled heatmap query
- [x] badges, friendships (request/accept/decline/remove), username search
- [x] leaderboards (Daily today, Weekly XP, Course) Global/Friends via continuous aggregates
- [x] API routes + tests
- [x] Also: `player_xp_weekly` continuous aggregate, compression policy on `guess_events` (> 30 days), XP backfill (`npm run social:backfill`), ADR-0005, `CONTEXT.md` § Social

Entry points: `lib/social/` (`xp.ts` hooks `onRunFinished`, `onTopicPassed`, `onTopicRead`, `onCourseFinished`, `onDailyPlayed`, `awardBadge`; `profile.ts` `ensureProfile`, `profileFor`, `myProfile`, `profileCard`, `updateProfile`, `publicGame`; `activity.ts` `heatmap`; `friends.ts`; `leaderboards.ts` `weeklyXp`, `gameLeaderboard`, `courseLeaderboard`; client-safe `types.ts`, `rules.ts`, `badges.ts`), API under `app/api/me/*`, `app/api/profiles/[username]`, `app/api/players/search`, `app/api/friends/*`, `app/api/leaderboards/*`, migration `db/migrations/20261004T1015_social.sql` (applied to `stormhacks-dev`), `scripts/social-backfill.mjs`, tests `lib/social/*.test.ts` and `lib/social/social.db.test.ts`

Notes for others:
- **F20 (Runs):** inside the transaction that sets `status = 'finished'`, call `await onRunFinished(playerId, { runId, ...summary }, tx)` where `summary` is your `RunSummary` (`{ mode, score, finishedAt, outcome, stats }`). Never for abandoned Runs. It awards `floor(score/5)` XP (5..200) once per Run and evaluates First Dive, Trench Diver (rare-tier `guess_events` in the Run), Perfect Leap (`outcome !== "fell"`, `stats.correct === stats.questions`), Pairs Speedrun (`outcome === "cleared"`, `stats.timeBonus >= 300`), Level and Streak Badges. Returns `XpAward { xpAwarded, totalXp, levelBefore, levelAfter, leveledUp, newBadges, streak }`: put it in the Reveal if you want "+XP" / level-up moments. Safe to call twice.
- **F22 (Courses):** `onTopicPassed(playerId, { course: "python-basics", topicNumber: n }, tx)` (+150, badge `topic-python-basics-<n>`), `onTopicRead(...)` (+20, Q27), `onCourseFinished(playerId, "python-basics", tx)` (+500, badge `course-python-basics`). Public Games: add `games.visibility`; until then `publicGame()` in `lib/social/profile.ts` treats Games owned by player `'system'` as public, and already honours `visibility = 'public'` once the column exists (via `to_jsonb(g)`), so no change is required here. The Course board counts `topic_passed` events by ref `<course>:<n>`.
- **F23 (Daily):** for the counted Daily Run call `onRunFinished` first, then `onDailyPlayed(playerId, day, tx)` (+50 + 5 × Streak, bonus ≤ 50, once per day). Today's board: `GET /api/leaderboards/games/[dailyGameId]?day=YYYY-MM-DD&counting=first` (one counted attempt = the first finished Run that day). Award `daily-top-10` with `awardBadge(playerId, "daily-top-10", day, tx)`.
- **F26 / F19 (UI):** API table and shapes in `docs/architecture/social.md` § API; import types from `@/lib/social/types` (and `levelFor`, `badgeInfo`, `badgeCatalogue` from `rules.ts`/`badges.ts`, both client-safe). Home card: `GET /api/me/summary` → `ProfileCard`. Profile page: `GET /api/profiles/[username]` → `{ profile }` (`/profile` can use `GET /api/me/profile`, which adds `usePhoto`/`clerkImageUrl` for the Edit dialog; `PATCH` it with `{ username?, displayName?, avatar?, usePhoto?, bio?, banner? }`, 409 = username taken). Avatar ids: `AVATARS` (16, default `anglerfish`). Heatmap: `days[i]` → column `floor(i/7)`, row `i%7` (Sunday first), `level` 0–4. Leaderboard rows use **`place`** (position) because `player.rank` is the ocean Rank; `me` is your row even outside the top N.
- **Pages** that render the signed-in Player outside the API can call `ensureProfile(playerId, await currentUser())` (`lib/auth.ts` is untouched; social routes already call it).
- `xp_events` has no FK (event log); idempotency is `(player_id, reason, ref)` under a per-Player advisory lock, because a hypertable's unique index must include `at`.
- Both new continuous aggregates are real-time; never refresh them with a NULL end (see `data-model.md`). Runs finished before the hook existed: `npm run social:backfill`.

## F22 Courses backend and the seeded Python Basics course
Spec: `docs/worklog/aaf1007/overnight-decisions.md` · Issue #35 (checklist lives on the issue until this feature ships)
- [ ] See the issue checklist

Entry points: — · Notes for others: —

## F23 Daily Dive backend
Spec: `docs/worklog/aaf1007/overnight-decisions.md` · Issue #36 (checklist lives on the issue until this feature ships)
- [ ] See the issue checklist

Entry points: — · Notes for others: —

## F24 Apogee and Leap screens (three.js)
Spec: `docs/worklog/aaf1007/overnight-decisions.md` · Issue #37 (checklist lives on the issue until this feature ships)
- [ ] See the issue checklist

Entry points: — · Notes for others: —

## F25 Pairs and Blitz screens
Spec: `docs/worklog/aaf1007/overnight-decisions.md` · Issue #38 (checklist lives on the issue until this feature ships)
- [ ] See the issue checklist

Entry points: — · Notes for others: —

## F26 Profile, Friends and Leaderboard pages
Spec: `docs/worklog/aaf1007/overnight-decisions.md` · Issue #39 (checklist lives on the issue until this feature ships)
- [ ] See the issue checklist

Entry points: — · Notes for others: —

## F27 Explore, Course and Topic pages
Spec: `docs/worklog/aaf1007/overnight-decisions.md` · Issue #40 (checklist lives on the issue until this feature ships)
- [ ] See the issue checklist

Entry points: — · Notes for others: —

## F28 Daily Dive hub page
Spec: `docs/worklog/aaf1007/overnight-decisions.md` · Issue #41 (checklist lives on the issue until this feature ships)
- [ ] See the issue checklist

Entry points: — · Notes for others: —

## F29 Arena: three.js FPS study Mode (stretch)
Spec: `docs/worklog/aaf1007/overnight-decisions.md` · Issue #42 (checklist lives on the issue until this feature ships)
- [ ] See the issue checklist

Entry points: — · Notes for others: —
