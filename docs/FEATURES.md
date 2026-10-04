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
| F08 | Modules list and Module page UI | Frontend | F01 (mock F03/F04) | #8 | done |
| F09 | Run screen and Reveal UI | Frontend | F06 (mock), F10 | #9 | done |
| F10 | Visual design system (site + Mode themes) | Frontend | design session | #10 | done |
| F11 | Game page UI | Frontend | F07 | #11 | done |
| F12 | Deploy and demo prep | Platform | everything | #12 | in-progress |
| F13 | Game Modes: `games.mode` and the Mode picker | Platform | F01 | #21 | done |
| F14 | Generation scorecard (eval on real decks) | Pipelines | F04 | #24 | done |
| F15 | Example Prompts in the generator instructions | Pipelines | F04 (F14 to measure) | #25 | done |
| F16 | Gemini verification pass for Answers | Pipelines | F04 (F14 to measure) | #26 | done |
| F17 | Overgenerate and select the best Prompts | Pipelines | F04, F14 | #27 | done |
| F18 | Open Prompt answer expansion with retrieval (pgvector, stretch) | Pipelines | F04, F14 | #28 | planned |
| F19 | Landing page and site-wide UI overhaul | Frontend | F10 | #32 | done |
| F20 | Game Modes engine and generation: Apogee, Leap, Pairs, Blitz | Platform | F04, F06 | #33 | done |
| F21 | Social backend: profiles, XP, streaks, heatmap, badges, friends, leaderboards | Platform | F01, F07 | #34 | done |
| F22 | Courses backend and the seeded Python Basics course | Platform | F20 | #35 | done |
| F23 | Daily Dive backend | Platform | F21, F22 | #36 | done |
| F24 | Apogee and Leap screens (three.js) | Frontend | F10, F20 | #37 | done |
| F25 | Pairs and Blitz screens | Frontend | F10, F20 | #38 | done |
| F26 | Profile, Friends and Leaderboard pages | Frontend | F10, F21 | #39 | done |
| F27 | Explore, Course and Topic pages | Frontend | F10, F22 | #40 | done |
| F28 | Daily Dive hub page | Frontend | F09, F23 | #41 | done |
| F29 | Arena: three.js FPS study Mode (stretch) | Frontend | F20, F24 | #42 | done |
| F30 | Split generation: parallel Open and other-kinds calls | Pipelines | F04, F14 (F17) | #64 | done |
| F31 | Faster Gemini fallback: fewer retries on 503, fall back on timeout | Pipelines | F04 | #66 | done |
| F32 | Sonar: AI study coach (LangGraph) over a per-concept learner model | Gameplay | F22 | #73 | done |
| F33 | Dive matches Krillion: continuous descent, catch and miss screens, intro pan | Frontend | F09 | #72 | done |
| F34 | Clerk sign-in and sign-up match the site style | Frontend | F10, F19 | #77 | done |
| F36 | Pop-up when a friend accepts your request | Platform | F21, F26 | #79 | done |

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
Spec: `docs/architecture/ui-map.md` · Design: `docs/design/design-system.md` §7 · Decisions: `overnight-decisions.md` §10, §13 (Q13), §14
- [x] `/modules`: list (TiltCards with a pixel banner per Module, file and Game counts, Mode badges, best result, last played; staggered entry), inline `+ New Module` create that opens the Module, empty state with the mascot
- [x] `/modules/[moduleId]` Files panel: animated drag-and-drop upload zone with per-file upload progress, status pills with polling, "Used by N Games", delete guard (tooltip naming the Games) and a confirm modal. No Retry (ADR-0003): failed files show their error and are deleted and uploaded again
- [x] Games panel: cards with the Mode's mini-scene, `ModeBadge`, status polling (~3 s while generating), **source-file chips**, the Mode's best result in its own words (Dive depth, Apogee km, points otherwise), Mastery meter, Play in the Mode's verb; failed Games show their error and can be deleted
- [x] New Game dialog: Mode tiles (Dive preselected; Apogee, Leap, Pairs, Blitz; Arena locked), the Mode's rules and Prompt kinds, title (defaults to "Module · Mode"), checkbox list of Ready files (≥ 1), a gentle hint when the material looks thin for Pairs/Blitz/Leap
- [x] Hover linking: chip ↔ file row (and the Game cards built from a file)
- [x] **File viewer:** parsed text of a file, page list with first headings, rendered markdown (headings, bullets, tables, code, speaker notes), search with highlights and jumps between matching pages, ←/→ between pages, deep link `?doc=<id>&page=<n>`; `GET /api/documents/[documentId]/pages`

Entry points: `app/modules/page.tsx`, `app/modules/[moduleId]/page.tsx`, `app/modules/files/[documentId]/page.tsx` (Evidence link that only knows the file: redirects to the Module page with the viewer open), `app/modules/actions.ts` (`createModule`), `app/modules/_components/` (`ModuleWorkspace`, `FilesPanel`, `GamesPanel`, `NewGameDialog`, `FileViewer`, `MarkdownView`, `ModuleBanner`, `DocIcon`, `Portal`), `app/modules/_lib/` (`queries.ts` server reads, `markdown.ts` safe parser, `mode-words.ts` `bestInWords`/`KIND_LABEL`/`thinMaterialHint`, `client.ts` `usePolling`/`uploadFile`), `GET /api/documents/[documentId]/pages`

Notes for others:
- **Evidence links (F09/F24/F25):** link to `/modules/files/<documentId>?page=<n>` (or `/modules/<moduleId>?doc=<documentId>&page=<n>`). `Evidence` in `lib/runs/types.ts` has no `documentId` yet: adding it is a small Run-lane contract change.
- **Pages API:** `GET /api/documents/[documentId]/pages` → `{ document: { id, filename, pageCount }, pages: { pageNumber, contentMd }[] }`, owner only (404 otherwise); empty `pages` until the file is parsed.
- **Markdown:** `app/modules/_lib/markdown.ts` + `_components/MarkdownView.tsx` render to React elements only (no HTML injection); reuse them for Topic readings (F27) if useful.
- **Overlays:** the layout's `PageTransition` animates `transform`, which traps `position: fixed` children; dialogs on these pages render through `_components/Portal.tsx`. F19: if you add a global page transition, F10's `Modal`/`Drawer` will need the same portal.
- **Layout:** `app/modules/layout.tsx` adds `SkyBackdrop` + `PageTransition`; drop the backdrop there if F19 moves it into the root layout. No nav link to `/modules` yet (F19 owns the header).
- **Play** goes to `/games/[id]` (F11). Next keeps recently visited pages mounted but hidden, so query visible elements only (`offsetParent !== null`) when targeting DOM by data attribute.

## F09 Run screen and Reveal UI (Dive)
Spec: `docs/design/modes/dive.md` §5–7, `docs/architecture/ui-map.md`, `docs/architecture/run-and-scoring.md` (direction: `overnight-decisions.md` §3, Q6; issue #9 latest comment)
- [x] `/runs/[runId]`: Mode dispatcher (`app/runs/[runId]/mode-screens.tsx`; Dive → its screen, Apogee/Leap/Pairs/Blitz → placeholder), owner only, finished → Reveal, abandoned → stop screen
- [x] Krillion layout: HUD plates (depth / squares / score), menu + mute tiles, depth ruler with `YOU ◀`, prompt card under the waterline, bottom dock (sonar timer, input + fuse, DIVE); real descent (10 m per point)
- [x] Countdown driven by the server deadline with the clock offset from `serverNow`; `start-prompt` only after the card has entered and after DESCEND (clock paused on the catch screen); `/timeout` at 0
- [x] Input for all five kinds: typed (open, cloze, definition), odd-one-out (one tap, keys 1–4), put-in-order (drag/▲▼ + LOCK IN, Enter)
- [x] Wrong typed guess: reject jolt, `−3s` floater, fuse cut, `<guess> · not in your notes`; one-try miss (`MISSED`, right answer lit); timeout (`TIME!`, shake, sad mascot)
- [x] Correct: the chip sinks past the tier lines with line flashes, camera descends, score slam, depth counts up, bubbles, Trench flash, then the catch screen (creature, tier, answer, `+pts · sink Xm`, verdict, `HINT` / `REPEAT ÷2` tags, `DESCEND ▼`, Enter, auto after ~6 s)
- [x] Hint button: reveal, Tier drop shown (`REEF → SHALLOWS`), used once; the `THIS PROMPT ▸` line moves up
- [x] Reconnect: reloading mid-Run resumes from the server state (clock, depth, squares); 409 resyncs; dropped connections retry
- [x] `/runs/[runId]/reveal` (Dive): results column over the sea at the final depth; `DIVE #N COMPLETE`, counting score + depth, PB banner, distribution of your own dives with YOU and PB (crowd prop for public Games), Dive Log, Mastery before → after (`gild`), The Bearing, The Catch (filters, search, rarest first, ✓ yours, Evidence links to `/modules/[moduleId]?doc=&page=`), `▼ DIVE AGAIN ▼` and `BACK TO GAME`
- [x] Start a Run: `/runs/new?game=<gameId>` launch beat (unlocks sound, creates the Run, opens it); `runApi.create` for other callers
- [x] Mobile: dock pinned to the bottom, card text scales, ruler narrows (checked at 375 px)

Entry points: `app/runs/[runId]/page.tsx`, `app/runs/[runId]/mode-screens.tsx` (`RunScreen`, `RevealScreen`), `app/runs/[runId]/reveal/page.tsx`, `app/runs/new/page.tsx` (`/runs/new?game=<id>`), `app/runs/queries.ts` (`getRunContext`, `getDiveHistory`), `app/runs/RunClosed.tsx`, `components/modes/dive/DiveRunScreen.tsx`, `components/modes/dive/DiveRevealScreen.tsx`, `lib/runs/client.ts` (`runApi`, `RunApiError`, `msUntil`)

Notes for others:
- **F24/F25:** add your Mode's screens in `app/runs/[runId]/mode-screens.tsx` (one `case` each in `RunScreen` and `RevealScreen`). Each gets the live `RunState` (or `Reveal`) plus `context` (`runId`, `gameId`, `gameTitle`, `moduleId`, `closed` Prompts) and, for Reveals, `history` (`number`, `scores` of your finished Runs on the Game). Use `runApi` from `lib/runs/client.ts`; it keeps the clock offset in a `Clock` object you pass in.
- **F11:** the Play button can link to `/runs/new?game=<gameId>` (launch beat with `▼ BEGIN DESCENT ▼`) or call `runApi.create(gameId)` then `router.push('/runs/' + runId)`. Recent Runs link to `/runs/<id>/reveal`. The Reveal's `BACK TO GAME` goes to `/games/<gameId>`.
- **F08:** Evidence links in the Reveal open `/modules/<moduleId>?doc=<documentId>&page=<n>`.
- **F23/F28:** `DiveRevealScreen` takes `crowd={{ values, caption }}` (replaces the personal curve) and `title` (e.g. `DAILY DIVE #12`). `DiveRunScreen` can be reused for the Daily.
- **Contract additions (#9 comment):** `Evidence.documentId` (every Mode's Reveal) and `DiveRunState.prompt.tier` (single-answer kinds only).
- **Component tweaks to F10 blocks:** `EvidenceLine { href? }`, `ResultList { evidenceHref? }`, `DistributionChart { best?, minValues?=3 }` (fewer values: caption only), `CatchScreen { tags?: { hint?, stale? } }`, `DiveReveal { mastery?, evidenceHref?, againPending?, notice? }`.
- **Known gaps:** the catch screen's auto-continue also counts down in a hidden tab; the menu doesn't pause the clock (it says so). Creating any Run abandons your other in-progress Runs (engine rule), so an open Run tab then shows the abandoned screen.

## F10 Visual design system (site + Mode themes)
Spec: `docs/design/design-system.md`, `docs/design/modes/dive.md`, `docs/architecture/ui-map.md` (direction: `docs/worklog/aaf1007/overnight-decisions.md` §1–3, §12–14) · mock: `docs/design/mock/index.html`
- [x] Docs rewritten for the two worlds: design system (site tokens/type/motion/interaction catalogue, Mode themes via `data-theme`, component inventory, sound, a11y, mobile), Dive (Krillion layout, real descent, catch screen, Reveal column), UI map (new routes + file viewer)
- [x] Mock updated: Dive with working descent through depth zones, ruler + YOU marker, sinking chip → catch screen → next prompt, Reveal over the sea; refreshed site shell screens
- [x] Fonts (Pixelify Sans, Mulish, VT323 via `next/font/google`) and tokens in `app/globals.css` (Tailwind 4 `@theme inline` + per-`[data-theme]` blocks: dive, apogee, leap, pairs, blitz), recipes and keyframes, reduced motion
- [x] `components/ui/` site kit: Logo, Button, Card/TiltCard, Panel, Chip, StatusPill, Meter/ProgressBar/XpBar, Odometer, StreakFlame, Badge, ModeTile/ModeBadge, Modal/Drawer, Tooltip, Tabs, Toast, PixelBurst/celebrate, Mascot, PixelAvatar (+16 avatars, AvatarPicker), ProfileCard, Heatmap, SkyBackdrop, PageTransition, PixelIcon/PixelSprite, SoundToggle, SiteHeader
- [x] `lib/motion/` (spring, tween, particles, reduced motion) and `lib/ui/sfx.ts` (synthesized WebAudio, mute in localStorage, unlocked on first gesture)
- [x] Dive building blocks: `components/round/`, `components/results/`, `components/modes/dive/` (OceanStage with camera, DepthRuler, DiveHud, TierLines + sinking chip, CatchScreen, DiveLogChart, DiveReveal, `TIER_UI`)
- [x] `/styleguide` (every component) and `/styleguide/dive` (fake 7-prompt Dive with descent + catch flow), both 404 in production
- [x] Dev auth bypass: `DEV_PLAYER_ID` honoured by `requirePlayer()`/`getApiPlayer()` only when `NODE_ENV === "development"`
- [x] Root layout header restyled minimally (full nav is F19)

Entry points: `app/globals.css`, `app/layout.tsx`, `components/ui/index.ts` (`import { Button, ProfileCard } from "@/components/ui"`), `components/round/`, `components/results/`, `components/modes/dive/`, `lib/motion/index.ts`, `lib/ui/sfx.ts`, `lib/ui/modes.ts` (`MODE_UI`), `app/styleguide/` (`/styleguide`, `/styleguide/dive`), `lib/auth.ts` (dev bypass)

Notes for others:
- **See it:** `npx next dev`, open `/styleguide` (every component, live) and `/styleguide/dive` (play a fake Dive; the "Cheat sheet" lists answers). Both 404 in production builds.
- **Two worlds.** Site pages use the `:root` tokens (night navy, Pixelify Sans headings via `font-display`, Mulish body, yellow `Button variant="primary"`). Mode screens wrap their root in `data-theme="<mode>"`: tokens, `font-display` (VT323 in Dive) and radii (0 in Dive) switch automatically. Use semantic utilities only: `bg-surface`, `bg-surface-2`, `border-border`, `text-muted`, `text-signal`, `text-accent`, `text-reward`, `bg-band-3`, `font-display`, `font-hud`, `rounded-md` (= `--r`). Raw font tokens are `--f-display/--f-body/--f-hud`.
- **Recipes** in globals.css: `.px-btn[data-variant]` (pixel button), `.px-frame` (stepped 2px border), `.card[data-interactive]`, `.label-line`, `.shine`, `.stagger` (+ `--i`), Dive: `.dv-px`, `.dv-panel`, `.dv-crt`, `.glow-signal`, `.glow-accent`. Keyframes: `rise-in pop-in page-in card-in card-gone score-slam crank-jolt reject-jolt shake edge-throb line-flash title-flicker dot-pulse gold-pulse gold-breathe banner-in gild btn-bob bob float shine-sweep flame-flicker ripple-in wave badge-flip sonar-sweep drift toast-in float-up drawer-right drawer-up mascot-* lantern zzz avatar-wave`.
- **Site kit API** (`@/components/ui`):
  - `Button { variant?: primary|secondary|ghost|danger; size?: sm|md|lg; href?; icon?; iconRight?; block?; sound?=true }` + button attrs
  - `Card { interactive?; as? }`, `TiltCard { max?=8; glare?=true }`, `Panel { title?; action? }`
  - `Chip { tone?: neutral|accent|signal|reward|violet|success|danger|caution|band-1..4|band-miss; icon?; size? }`, `StatusPill { status: uploading|parsing|generating|ready|failed; message? }`
  - `Meter { value 0–100; segments?=10; label? }`, `ProgressBar { value; max; tone?; label?; showValue?; height? }`, `XpBar { xp; levelStartXp; nextLevelXp; level }` (shine + sparks when xp grows)
  - `Odometer { value; format?; duration? }`, `StreakFlame { days; active?; size?; showCount? }`, `Badge { name; icon: PixelIconName; tone?: bronze|silver|gold|gem|accent; earned?; description?; size? }`
  - `ModeTile { mode: ModeUiId; selected?; locked?; onSelect? }`, `ModeBadge { mode }`, `ModeScene { mode }` (data: `MODE_UI` in `lib/ui/modes.ts`: dive, apogee, leap, pairs, blitz, arena)
  - `Modal { open; onClose; title?; footer? }`, `Drawer { …same; side?: right|bottom }` (focus trap, Escape, scroll lock), `Tooltip { label; side? }`, `Tabs { tabs: {id,label,count?}[]; value; onChange; label? }`
  - `useToast()({ title; body?; tone?: info|success|reward|danger; icon?; ms? })` (provider is in the root layout); `celebrate()` (confetti + level-up chime), `PixelBurst { fire: number }`, `burst(x,y,opts)`, `burstFrom(el,opts)`, `confettiRain()`
  - `Mascot { size?; say?; mood?: idle|happy|sad|wow|sleep; followCursor?; sleepAfterMs?; bubbleSide?; ref?: Ref<MascotHandle> }`, handle `react('happy'|'sad'|'wow')`, `say(text, ms?)`. Clicking it 5× is an easter egg.
  - `PixelAvatar { id; size?; bob?; imageUrl?; alt? }` (imageUrl = Clerk-photo toggle), `AvatarPicker { value; onChange }`, `AVATARS` (16), `avatarById`, `defaultAvatarFor(playerId)`
  - `ProfileCard { name; level; avatarId; imageUrl?; totalXp; rank; badges; streak; streakActive?; editHref? | onEdit?; profileHref }` (the Codedex-style card)
  - `Heatmap { days: {date:'YYYY-MM-DD'; count; xp?}[]; weeks?=52; endDate?; unit? }`
  - `SkyBackdrop { variant?: auto|day|dusk|night|ocean; parallax?; scrollDive?; sea?; intensity? }` — fixed at `-z-10`; the page colour lives on `<html>` only so it shows through `<body>`. Give content cards a surface.
  - `PageTransition`, `PixelIcon { name; size?; palette? }` (30 icons, `PIXEL_ICON_NAMES`), `PixelSprite { rows; palette; size? }`, `SoundToggle`, `SiteHeader` (hides itself on `/runs/*` and `/styleguide/dive`)
- **Motion/sound:** `spring({from,to,stiffness,damping,onUpdate,onRest})`, `tween(...)`, `useReducedMotion()` from `@/lib/motion`; `sfx.hover|click|toggle|pop|whoosh|reward|levelUp|error|correct(band)|wrong|ping|timeout|tick|count|sink|catch(band)` and `useSfxMuted()` from `@/lib/ui/sfx`. Everything no-ops under reduced motion / mute / before the first gesture.
- **Dive blocks (F09):** `round/`: `HudPlate {label; value; tone: signal|accent; align?}`, `ProgressSquares {total; current; results; caption?}`, `RoundCard {label; text; footer?; badge?; hint?; stamp?; state?: in|gone|shake|still}`, `SonarTimer {remainingMs; totalMs; paused?; sound?; size?}`, `Fuse {remainingMs; totalMs; cutMs?; cutKey?}`, `TypedInput {onSubmit; disabled?; placeholder?; correction?; rejectKey?; submitLabel?; below?}`, `OptionGrid {options; onPick; locked?; correct?; picked?}`, `OrderList {items; onChange; locked?; correctOrder?}`, `HintButton {from; to; used?; onUse}`, `ResultChip {text; band; points; stale?; hinted?}`. `results/`: `ResultHeader {title; score; secondary?; personalBest?; logo?}`, `DistributionChart {values; you; max?=700; caption}`, `BandTable {bands; activeIndex; title?}`, `ResultList {prompts: RevealPrompt[]; title?}`, `EvidenceLine {evidence}`. `modes/dive/`: `OceanStage {depth?; camera?: DiveCamera; sky?: day|dusk; showMascot?; ref?}` (handle `setDepth(m,{instant?})`, `mascot(kind)`, `bubbles(opts)`), `DepthRuler {camera; maxMetres?}`, `DiveHud {depth; score; current; total; results}`, `TierLines {thisPrompt?; sink?: Sink; onLanded?}`, `CatchScreen {tier; answer; points; sinkMetres; verdict?; onContinue; autoMs?=6000; cta?}`, `DiveLogChart {prompts}`, `DiveReveal {title; score; prompts; distribution: {values, caption}; personalBest?; onAgain; onBack; backLabel?; camera?}`, `tiers.ts` (`TIER_UI`, `formatDepth`, `depthZone`, `BEARING`, `bearingIndex`, `promptTier`), `depth.ts` (`DiveCamera`, px-per-metre mapping). `DivePlayground` shows how to wire them; F09 swaps its fake prompts for the Run API (call `start-prompt` only after DESCEND so the clock stays paused during the catch screen).
- **Dev auth bypass:** put `DEV_PLAYER_ID=<clerk user id>` in your **own worktree's** `.env.local` to render signed-in pages under `next dev` without Clerk. Ignored unless `NODE_ENV === "development"`. Clerk-only UI (`<Show>`, `UserButton`) still sees you as signed out.
- **Known gaps:** `HintButton` and `ResultList` use Dive's `TIER_UI` labels (add a labels prop before other Modes reuse them). OceanStage animation pauses in hidden tabs (the sinking chip has a 2.5 s timeout fallback). Light mode is deferred (dark only, decision Q5).

## F11 Game page UI
Spec: `docs/architecture/ui-map.md` (direction: overnight-decisions §2, §14; Mode words: `docs/design/modes/*.md`)
- [x] `/games/[gameId]`: source chips, Personal Best, Mastery percentage, per-Tier found counts, recent Runs, Play
- [x] Optional: accuracy-over-time chart (F07's continuous aggregate)
- [x] Also (latest issue comment): site frame with a themed hero band per Mode, the Mode's own stats panel and Play wording, `ModeBadge`, a sparkline/spread of your Run scores, public Games (Course/Daily) with the Topic lock (403 → "Pass the previous Topic first" + link), 409s, generating (polls) and failed states, Lumen comment, animated counters, Mastery gild, reduced motion, 375 px

Entry points: `app/games/[gameId]/` (`page.tsx`; `data.ts` `loadGamePage(playerId, gameId)` (server); `model.ts` client-safe `GamePageData`, `MODE_WORDS`/`wordsFor`, `modeRunStats`, `scoreBuckets`, `lumenLine`; `GamePage.tsx`, `GameHero.tsx` + `heroes.module.css`, `PlayButton.tsx`, `RecentRuns.tsx`, `ScoreHistory.tsx`, `AccuracyChart.tsx`), per-Mode stats panels `components/modes/{dive,apogee,leap,pairs,blitz}/GameStats.tsx` on the shared kit `components/modes/GameStatKit.tsx` (`StatPanel`, `StatNumber`, `MasteryStat`, `FoundRows`), tests `app/games/[gameId]/model.test.ts`

Notes for others:
- **Access:** the page needs sign-in (`requirePlayer`). It shows the Player's own Game in any status, or any `visibility = 'public'` Game; anything else is a 404. Public Games hide source chips; a Course practice Game shows its Course/Topic chip, the pass bar and passed/locked state, and its back link goes to `/explore/[course]/[topic]` (F27 builds those pages).
- **Play wording** (`MODE_WORDS` in `model.ts`): Dive `▼ BEGIN DESCENT ▼`, Apogee `LAUNCH`, Leap `JUMP IN`, Pairs `START MATCHING`, Blitz `GO`. Score words: Dive depth (`−1,200 m`), Apogee `km` (1 pt = 1 km), others `pts`; Leap/Pairs/Blitz Run endings (SUMMIT/FELL, ALL PAIRS/TIME, TIME/DECK CLEARED) show as chips on recent Runs.
- **Play** unlocks audio, plays the hero's take-off (camera sinks, rocket lifts, hopper jumps…), `POST /api/games/[id]/runs`, then `router.push('/runs/[runId]')` (F09 / F24 / F25 own that page). 403 shows "Pass the previous Topic first" with a link to the previous Topic; 409 shows the server's message and refreshes; 401 links to sign-in.
- **Mode screen agents (F24, F25):** refine your Mode's `GameStats.tsx` freely; props are plain numbers (Leap: `bestStreak`, `heartsLeft` on the best Run, `summits`; Pairs: `bestClearMs` = fastest sum of both Boards' `endedAt − startedAt` on cleared Runs, `clears`; Blitz: `bestCombo`, `bestCorrect`). They're folded from `runs.mode_state` in `modeRunStats`. Hero scenes live in `app/games/[gameId]/GameHero.tsx` (SVG + CSS, Dive reuses `OceanStage` at 0 m).
- **Gotcha:** `Odometer` only rolls digits and is `inline-flex`, so a space in its `format` output collapses and a non-breaking space renders as `0`. Pass units separately (`StatNumber unit="KM"`).
- Integration fix outside my lane: `components/results/ResultList.tsx` `KIND_LABEL` got `multiple_choice` and `true_false` (F10 + F20 together failed `tsc` without it).

## F12 Deploy and demo prep
Spec: `docs/architecture/overview.md` (open questions)
- [ ] Choose the deploy target; resolve the upload body-size limit if it's Vercel: **prep done** (`docs/deploy.md` §1 compares hosts and recommends a container host, which keeps 25 MB uploads and long `after()` work with no code change; the Vercel fallback is a 4 MB limit). **Needs human:** pick the host, create the project.
- [ ] Production env vars; migrations run against production: **prep done** (`docs/deploy.md` §2 lists every variable, §3 the migrate + seed order for a fresh Tiger service, §4 the Daily job, §5 refilling the Daily pool before ~2026-10-15/18). **Needs human:** create the production service, set the secrets, run the commands.
- [ ] Demo account with a polished Module and Game; a rehearsed demo script: **script done** (`docs/demo-script.md`, 3–4 min with fallbacks and answer cheat sheets). **Needs human:** create the demo account, seed it, rehearse.
- [x] README: what it is, how to run it, the sponsor tracks used

Entry points: `README.md`, `docs/deploy.md`, `docs/demo-script.md` · Notes for others: deployment itself is left for a human (no accounts, secrets or deploys were made). Never set `DEV_PLAYER_ID` on a deployed environment. `NEXT_PUBLIC_SITE_URL` must be set before the production build (it's inlined). Screenshots in the README are placeholders under `docs/img/`.

## F13 Game Modes: `games.mode` and the Mode picker
Spec: `docs/architecture/game-modes.md`, ADR-0004
- [x] Migration: `games.mode text NOT NULL DEFAULT 'dive' CHECK (mode IN ('dive'))`; `data-model.md` updated from "planned" to the real column (shipped with F04; applied to stormhacks-dev)
- [x] `lib/modes/index.ts` (`MODES`, `ModeId`); `POST /api/modules/[moduleId]/games` accepts `mode` (default `'dive'`) and validates it (shipped with F04)
- [x] Generation and the run engine read `game.mode` (generation since F04; F20 made both dispatch on it for five Modes)
- [x] New Game dialog: Mode tiles (Dive, Apogee, Leap, Pairs, Blitz + Arena locked "coming soon"); Game cards show the Mode badge (shipped with F08, #8)
- [x] The Game page shows the Mode (F11, #11: a themed hero scene per Mode)

Entry points: — · Notes for others: —

## F14 Generation scorecard (eval on real decks)
Spec: `docs/architecture/game-generation-pipeline.md` § Improving output quality · Issue #24 (do this first: F15–F17 are judged by it)
- [x] 3–4 real eval decks (PDF, PPTX, DOCX + the seed deck); Gemini responses saved with `--save` (`eval/decks.json`; responses in `eval/responses/`)
- [x] A scorecard per deck: Prompts returned/kept, kinds, Open Prompts, Answers per Open Prompt, quotes verified, Hints removed, drops by reason, seconds, cost
- [x] Replays saved responses (`--from`) for free code-only comparisons (the default for `npm run generate:eval`)
- [x] Baseline recorded in the spec (§ Scorecard (F14): 64 → 56 Prompts kept over 4 decks, ~5 Answers per Open Prompt, ≈ $0.20 per live run)

Entry points: `npm run generate:eval` (`scripts/generate-eval.ts`; `--live`, `--from <dir>`, `--save <dir>`, `--deck`, `--no-fallback`, `--drops`, `--json`), `eval/decks.json`, `eval/responses/`, `lib/games/scorecard.ts` (`scoreDocument`, `formatScorecardTable`, `dropCode`, `unwrapSaved`), `lib/gemini/pricing.ts` (`estimateCostUsd`, price constants), `scripts/deck-pages.ts` (shared deck loading); `generate:check` now prints the same scorecard row

Notes for others:
- **F15–F18:** run `npm run generate:eval -- --live --no-fallback --save eval/runs/<name>` after a prompt change (≈ $0.20, ~5 min) and compare with the baseline table in `game-generation-pipeline.md` § Scorecard. A checks-only change (validate.ts) needs no Gemini call: plain `npm run generate:eval` replays the committed responses. Gemini varies run to run, so a Prompt or two per deck is noise.
- **Course decks aren't in git.** Copy them into `eval/decks/` (gitignored) or set `EVAL_DECKS_DIR`; ask Anton for the files. Without them only the seed deck scores.
- **Baseline findings worth fixing first:** "Name a step in …" Open Prompts with sentence-long Answers (most drops), symbol Answers (`+ - * /`), odd_one_out whose correct option isn't in the deck, and Prompts about course logistics. Details in the spec.
- **3.6-flash latency is 60–100 s per deck**, and it answered 503 to the 94-page PDF on three of four attempts; the app's fallback model would have taken over.

## F15 Example Prompts in the generator instructions
Spec: `docs/architecture/game-generation-pipeline.md` § Improving output quality · Issue #25
- [x] 3–4 example Prompts from the seed fixture in `lib/gemini/game-prompt.ts` (an open, a cloze, an ordered_recall, an odd_one_out), labelled as examples of the format and quality, not content to reuse
- [x] "Bad → good" pairs for compound Open Prompts and give-away Hints, plus the F14 baseline's faults: step sentences as Open Answers, symbol Answers, odd-one-out options not in the deck, course-admin Prompts
- [x] F14 scorecard before/after (spec § Scorecard → F15)

Entry points: `GAME_PROMPT_EXAMPLES` and the EXAMPLES / BAD → GOOD sections of `GAME_SYSTEM_INSTRUCTION` in `lib/gemini/game-prompt.ts`; one example (+ a bad → good line) each in `lib/modes/{leap,blitz,pairs}/generate.ts`; tests `lib/gemini/game-prompt.test.ts`, `lib/modes/examples.test.ts`

Notes for others:
- **Examples must pass the checks.** `lib/modes/examples.test.ts` parses every one-line `{"kind":…}` example out of each Mode's instructions and runs it through that Mode's `validate` on the seed pages. If you edit an example (or a check), keep it passing: an example the checks would drop teaches Gemini to make drops.
- **The seed deck now scores optimistically:** the examples come from it, so Gemini can copy them on that deck. Judge prompt changes on the three course decks.
- **Before/after** (spec § Scorecard → F15): 56 → 64 / 60 Prompts kept over two live runs, quotes verified 95% → 97% / 98%, drops 8 P / 19 A → 0 / 1 and 4 / 3. "Name a step in …" Opens, admin Prompts and invented odd-one-out options are gone. Symbol cloze Answers (`%`, `_`) and acronym Hints remain (F16).
- Prompt version is now `a6b826d6`, and `eval/responses/` holds its run (F15 run 2), so a plain `npm run generate:eval` replays the current prompt. The F14 baseline is kept as tables in the spec. The examples add ~1,100 input tokens per call.

## F16 Gemini verification pass for Answers
Spec: `docs/architecture/game-generation-pipeline.md` § Verification pass (F16) · Issue #26
- [x] After the Mode's checks, one verification call per document: each kept Prompt with its Answers, quotes and the text of the cited pages; structured verdict per Answer (`supports`) and per Prompt (`clear`, `duplicate_of`). Every Mode: Leap's correct option, Blitz's truth value, Pairs' term, ordered_recall's order and odd_one_out's option are checked too
- [x] Drop unsupported Answers, then re-run check 4 (≥ 4 Open Answers) and Tier assignment; drop unclear Prompts and duplicates
- [x] If the verification call fails (e.g. overload), keep the unverified Prompts rather than failing the Game; log it. `GEMINI_VERIFY=off` turns the pass off (on by default)
- [x] Added time and cost measured (+4–8 s, ≈ +$0.006–0.010 per document with flash-lite, vs the estimated +20 s / +$0.02) and the F14 scorecard before/after (verification columns added)
- [x] Unit tests for the merge/drop logic with a fake verifier (+ DB tests through `generateGame`)

Entry points: `lib/games/verify.ts` (`verificationInput`, `applyVerdicts`, `verifyDocument`, types `VerifyCall`, `VerifyInput`), `lib/gemini/verify.ts` (`VERIFY_SYSTEM_INSTRUCTION`, `VERIFY_RESPONSE_SCHEMA`, `geminiVerifyCall`, `verificationEnabled`, `verifyModels`), `generateGame(gameId, { db, generate, verify })` and `verifyWithGemini` in `lib/games/generate-game.ts`; `generateDocumentPrompts(title, pages, request?, { models?, timeoutMs? })` in `lib/gemini.ts`; env `GEMINI_VERIFY`, `GEMINI_VERIFY_MODEL`; `npm run generate:eval -- --verify | --verify-from eval/verify [--verify-model m]`, `npm run generate:check -- … --verify` (any Mode); saved verdicts `eval/verify/`, planted-errors set `eval/planted/`

Notes for others:
- **It's a safety net, not a scorecard win.** On the F15 replay set (and the F14 baseline) it removed nothing: the generator's Answers are already right on these decks. On 9 hand-planted bad Prompts that pass every code check (mentioned-but-wrong Answers, wrong cloze/definition/odd-one-out Answers, rewordings, a slide-figure Prompt, a compound one) it removed 8–9 per run with no false positives on the 16 real ones; on planted Leap/Blitz errors 3/3 and 4/4. Details and per-run numbers in the spec.
- **Model:** the verifier uses `GEMINI_VERIFY_MODEL`, else `GEMINI_FALLBACK_MODEL` (flash-lite), then `GEMINI_MODEL`. 3.6-flash found nothing more on the real decks, cost 2–3× as much, took 11–31 s and was overloaded on 4 of 7 calls.
- **Tests:** `generateGame` with a fake `generate` and no `verify` skips the pass, so DB tests (yours too) never call Gemini. To test the pass, pass `verify: (t, pages, prompts) => verifyDocument(t, pages, prompts, fakeCall)`.
- **Daily Dive (F23)** wants "a second Gemini call verifies Answers": reuse `verifyDocument(title, pages, prompts, geminiVerifyCall)` on the fact-sheet pages.
- **Follow-ups:** give-away Hints (acronym letters/length) aren't caught: a Hint verdict was tried and dropped because lite never flagged them; a code rule in check 5 would. Lite varies run to run at temperature 0. Duplicates are judged within a document only.
- **F17:** the pass runs after the Mode's checks and before check 7 / `finalize`, so a selection step belongs after it (or before it, to verify fewer Prompts). If you change the generator prompt, re-run `npm run generate:eval -- --live --verify` and commit the new `eval/verify/` with the new `eval/responses/` (a replay notes when saved verdicts belong to other Prompts).

## F17 Overgenerate and select the best Prompts
Spec: `docs/architecture/game-generation-pipeline.md` § Overgenerate and select (F17) · Issue #27 · **Off by default** (`GEMINI_OVERGENERATE=on`)
- [x] Ask Gemini for ~25 Prompts per document instead of 15–20 (Dive and Apogee; "about 25, at least 12 of them open")
- [x] `selectPrompts` in code: score each kept Prompt (Open: more Answers is better; prefer kinds and pages not yet covered; penalize near-duplicate text or shared Answers with an already-chosen Prompt; verification status) and keep the best 15–20 per document. Order: generate → checks → F16 verification → select
- [x] Unit-tested; F14 scorecard before/after (watch latency, since output tokens grow)

Entry points: `selectPrompts`, `quality`, `textSimilarity`, `answerOverlap` in `lib/games/select.ts`; `overgenerateEnabled()` and the optional `ModeGenerator.overgenerate` hook in `lib/modes/generation.ts`; `diveOvergenerateRequest` in `lib/modes/dive/generate.ts`; `gameSystemInstruction(count, open)`, `GAME_OVERGENERATE_SYSTEM_INSTRUCTION` in `lib/gemini/game-prompt.ts`; `generateGame(gameId, { …, overgenerate })`; `applyVerdicts(...).statuses`; env `GEMINI_OVERGENERATE`; `npm run generate:eval -- --overgenerate`, `npm run generate:check -- … --overgenerate`; replay set `eval/overgenerate/`

Notes for others:
- **Why it's off:** on the three course decks (one live run each) it kept 44 → 60 Prompts, Open Prompts 24 → 26, and cited pages 33 → 47 on the PDF/PPTX, with Answers per Open Prompt and quotes unchanged, for +17 % generation cost (+29 % in run 1), +43 % verification cost (≈ $0.01 a document) and +6–15 % time. A Dive Run draws only 7 Prompts, so 14–16 per document is already enough; it mostly buys replay variety and coverage. Turn it on for long decks.
- **Ask for the Open count explicitly.** Run 1 asked for "about 25, at least half open" and Gemini padded with cloze/definition Prompts (Open Prompts fell 24 → 18). The shipped overgenerate prompt says "at least 12 of them open". The default prompt is untouched (`a6b826d6`).
- **Near-duplicates are never kept** (content-word Dice ≥ 0.8, Answer-set Jaccard ≥ 0.8, or the same term in two cloze/definition Prompts), even below 15. The selector found real ones on two decks; the verifier found none.
- **Leap/Blitz/Pairs don't overgenerate.** To add one, give its `ModeGenerator` an `overgenerate: { request, select }`; `generateGame` already calls it after verification.
- **`--no-fallback` also unsets the verifier's default model** (lite); pass `--verify-model gemini-3.5-flash-lite` with `--verify`, or verification runs on 3.6-flash (it 503'd twice in run 1).
- Gemini spend for F17 ≈ $0.60.

## F18 Open Prompt answer expansion with retrieval (pgvector, stretch)
Spec: `docs/architecture/game-generation-pipeline.md` § Improving output quality · Issue #28 · Stretch; Tiger Data sponsor angle
- [ ] Migration: pgvector (+ pgvectorscale) and `source_pages.embedding` (comment on the issue first: shared schema)
- [ ] Pages embedded at upload; failures never fail the upload
- [ ] Per Open Prompt: retrieve nearest pages → Gemini lists every supported Answer → merge, checks 1–3, re-rank, reassign Tiers
- [ ] F14 scorecard before/after (Answers per Open Prompt, rare Answers from new pages)
- [ ] README mentions the sponsor use (F12)

Entry points: — · Notes for others: —

## F19 Landing page and site-wide UI overhaul
Spec: `docs/worklog/aaf1007/overnight-decisions.md` §2, §9, §12 (Q4), §13 (Q17, Q24, Q25), §14 · `docs/design/design-system.md` · `docs/architecture/ui-map.md` · Issue #32
- [x] Landing (signed out): living pixel sky→ocean hero with parallax, Logo, CTAs (sign up / today's Daily), How it works, Game Modes showcase (hover mini-scenes), Explore teaser, Daily teaser (first Prompt only), Why it sticks, Social preview, footer
- [x] Site shell: nav (Explore · My Modules · Daily · Leaderboard; streak, XP/level chip, mute, avatar menu), mobile menu sheet, page transitions
- [x] Signed-in `/` redirects to `/home`; `/home` dashboard: greeting + mascot bubble, Jump back in, Continue progress, Daily card, profile card sidebar, friends activity (placeholder data where backends aren't merged yet)
- [x] Mascot with reactions, cursor-tilt cards, odometer numbers, confetti, synthesized UI sounds; reduced motion respected
- [x] Works at 375 px; no console errors
- [x] Also: Konami code (↑↑↓↓←→←→BA) opens Lumen's fishing mini-game; avatar picker on the home profile card saves via `PATCH /api/me/profile`

Entry points: `app/layout.tsx` (shell), `components/site/` (`SiteNav`, `UserMenu`, `SiteFooter`, `RouteTransition`, `BackdropPortal`, `KonamiFishing`, `PlayerAvatar`, `nav-data.ts` `getNavState()`, `nav-types.ts` `isFullBleed`/`profileHref`), `app/page.tsx` + `components/landing/` (`Landing`, `Hero`, `LandingWorld` scroll world + depth gauge, `Sections`, `Surface`, `world.ts` maths, `daily-teaser.ts` `getDailyTeaser()` stub, `Countdown`), `app/home/` (`page.tsx`, `data.ts` `recentGames`/`photoSettings`/`coursesAvailable`, `Greeting`, `MainCards`, `ProfileSidebar`, `Sidebar`, `CourseProgress`)

Notes for others:
- **Nav and footer** live in `components/site/` and hide themselves on Mode screens (`/runs/*`, `/styleguide/dive`; `FULL_BLEED` in `nav-types.ts`). Add a nav link in `SiteNav.tsx` `LINKS`. F10's `SiteHeader` is no longer used.
- **Signed-in state** comes from `getApiPlayer()` in the root layout (so `DEV_PLAYER_ID` works under `next dev`); the nav refetches `GET /api/me/summary` on every route change, so XP/streak update after a Run without a reload.
- **Fixed layers** (canvas backdrops, sheets) must render through `BackdropPortal` (into `<body>`): the header's `backdrop-filter` and transforms would otherwise trap `position: fixed`. `RouteTransition` removes its animation when it ends for the same reason. For a site page backdrop: `<BackdropPortal><SkyBackdrop … /></BackdropPortal>` (see `app/home/HomeBackdrop.tsx`).
- **F23/F28 (Daily):** replace `getDailyTeaser()` in `components/landing/daily-teaser.ts` (TODO there) with today's real puzzle; its example Answers are shown only while `isSample`. The home `DailyCard` (`app/home/MainCards.tsx`, TODO) should show "played · your result" once the backend exists. `dailyNumber(day)` (Daily #1 = 2026-10-04) and `msUntilNextDaily()` are reusable.
- **F22 (Courses):** `app/home/CourseProgress.tsx` fetches `/api/courses/python-basics` (TODO: point it at your real progress route and response) and is only rendered once a `courses` table exists (`coursesAvailable()` in `app/home/data.ts`).
- **F26:** profile links go to `/u/[username]` (or `/profile` without a username); the avatar menu links Profile, Friends, My Modules and Sign out. `lib/social/types.ts` `AVATARS` now equals the 16 drawn sprites (test `components/site/avatar-ids.test.ts`).
- Landing copy has no invented stats or testimonials: the example leaderboard, share card, evidence line and heatmap are labelled "Example".

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
Spec: `docs/architecture/courses.md` (decisions: overnight-decisions §5, Q10, Q24, Q27) · Issue #35
- [x] public Games (visibility) owned by a system Player; run engine allows public Games (`games.visibility`, player `'system'`; `createRun` on public Games, 403 on a locked Topic; Mastery/progress per Player; leaderboards use `visibility`)
- [x] courses, course_topics, topic_games, topic_progress; pass bars per Mode; unlock rule (`20261004T1100_courses.sql`, applied to stormhacks-dev; pass = F20's `passedRun`)
- [x] Python Basics: 6 Topics with readings (as Source Document pages), resources, hand-written practice Games for Dive, Apogee, Leap, Pairs, Blitz (content from `content/seed-content`, 30 public Games seeded on stormhacks-dev)
- [x] `npm run db:seed:courses` (idempotent); API routes; XP/badges on pass; tests
- [x] Also: XP for **every** finished Run (F21's `onRunFinished` wired into the run engine), Reveal `topic` block, "mark as read" (+20 XP), docs (courses.md, data-model, CONTEXT, overview, ui-map)

Entry points: `lib/courses/` (`types.ts` client-safe API shapes; `rules.ts` `lockedTopics`, `recordRun`; `progress.ts` `assertTopicUnlocked`, `recordTopicRun`, `topicReveal`; `queries.ts` `listCourses`, `getCourse`, `getTopic`, `markTopicRead`; `seed.ts`), `lib/runs/run-engine.ts` (`play()`/`afterFinish()`), routes `GET /api/courses`, `GET /api/courses/[slug]`, `GET /api/courses/[slug]/topics/[topicSlug]`, `POST …/read`, `npm run db:seed:courses [-- --check]`, migration `db/migrations/20261004T1100_courses.sql`, tests `lib/courses/*.test.ts`, `lib/courses/courses.db.test.ts`

Notes for others:
- **F27 (Explore UI, #40):** import types from `@/lib/courses/types`. `/explore` ← `GET /api/courses` → `{ courses: CourseSummary[] }` (`progress: { passed, total, finished, nextTopicSlug } | null`). `/explore/[course]` ← `GET /api/courses/[slug]` → `{ course }` with `topics[]: { number, slug, title, summary, minutes, modes, badgeId, progress: { locked, passed, passedAt, read, readAt } | null }`. `/explore/[course]/[topic]` ← `GET /api/courses/[slug]/topics/[topicSlug]` → `{ topic }` with `reading.pages[] { pageNumber, contentMd }` (markdown with ```python blocks), `resources[] { title, url, source }`, `games[] { mode, gameId, title, promptCount, passBar, me: { best, passed, runs } | null }` (MODES order), `prev`/`next`, `progress`. All three GETs are public: signed out every `progress`/`me` is null (show "Sign in to play"). Play = `POST /api/games/[gameId]/runs` → `{ runId }`, then the normal Run screens; **403 = Topic locked**. Mark as read = `POST …/read` → `{ progress, xp: XpAward }` (+20 once). The Reveal of a Topic Game has `topic: { courseSlug, topicSlug, topicNumber, topicTitle, passed, passedNow, passedBefore, nextTopicSlug, unlockedNext, courseFinished }`: `passedNow` → pixel burst + "+150 XP" + Topic Badge; `unlockedNext` → unlock animation for `nextTopicSlug`; `courseFinished` → Course Badge (+500). Badge names/icons: `badgeInfo(badgeId)`. Locked Topics still show their reading.
- **F23 (Daily Dive, #36):** make the Daily a public Game owned by `'system'`: put its Module/fact-sheet document/Game under the system Player with `visibility = 'public'` (copy the pattern in `lib/courses/seed.ts`: content-derived ids, `generatorFor('dive').validate` + `finalize`, insert rows, never delete Games). Any signed-in Player can then `createRun` it, Mastery/PB stay per Player, and `/api/leaderboards/games/[id]` works. XP for the Run is already awarded by the engine (`afterFinish()` in `lib/runs/run-engine.ts` calls `onRunFinished`); add the Daily step there (e.g. `recordDailyRun(tx, run, summary)` → `onDailyPlayed` for the counted attempt), after `recordTopicRun`. Don't call `onRunFinished` yourself.
- **Everyone:** every finished Run (any Mode, any Game) now gets Run XP and Badges in its finishing transaction. Commands that can finish a Run must go through `play()` in `run-engine.ts`. `RunError` can be 403. `Reveal` has a new `topic` field (null outside Courses). `npm run social:backfill` was run (nothing pending).
- Re-seeding after content edits is safe: changed Games are replaced by new ones and the old ones are retired (set private), so nobody's Runs are lost; Topic passes stay.

## F23 Daily Dive backend
Spec: `docs/architecture/daily-dive.md`, ADR-0006 (decisions: overnight-decisions §7, §8, Q9, Q23) · Issue #36
- [x] daily puzzles as public Dive Games + fact-sheet Source Document; one counted Run per Player per Vancouver day (`daily_puzzles`; system "Daily Dive" Module; Game private until live; `daily_results` `UNIQUE (player_id, day)`; Prompts in fixed fact-sheet order)
- [x] seed pool (≥ 7 hand-written, #1 on 2026-10-04 CS-themed) + `npm run daily:generate -- --days N` (Gemini + verification) (12 seeded on stormhacks-dev; 3 generated: #13–#15, ≈ $0.13)
- [x] TimescaleDB add_job assigns the day's puzzle at Vancouver midnight; lazy race-safe fallback (`assign_daily_puzzle` → `claim_daily_puzzle`, per-day advisory lock + `UNIQUE (day)` + `SKIP LOCKED`)
- [x] daily_results hypertable, score distribution (toolkit percentiles), per-Answer find rate, share text, leaderboard; API + tests (real-time caggs `daily_score_stats`, `daily_answer_rates`; Reveal `daily` + `crowd`; `daily-top-10` Badge once a day ends)

Entry points: `lib/daily/` (`types.ts` client-safe shapes; `days.ts` `nextVancouverMidnight`, `startOfVancouverDay`; `share.ts` `shareText`, `tierSquares`; `queries.ts` `getDailyPuzzle`, `dailyToday`, `startTodayRun`, `dailyLeaderboard`, `dailyArchive`; `record.ts` `recordDailyRun`, `dailyReveal`; `puzzle.ts`; `generate.ts`), routes `GET /api/daily/today`, `POST /api/daily/today/run`, `GET /api/daily/leaderboard`, `GET /api/daily/archive`, `npm run db:seed:daily [-- --check]`, `npm run daily:generate -- --days N [--dry-run] [--save f.json]`, migration `db/migrations/20261004T1200_daily_dive.sql` (applied to stormhacks-dev, job registered), tests `lib/daily/daily.test.ts`, `lib/daily/daily.db.test.ts`

Notes for others:
- **F28 (Daily hub, #41):** import from `@/lib/daily/types`. `GET /api/daily/today` → `{ daily: DailyToday }` = `{ number, day, theme, title, gameId, teaser, promptCount, players, nextAt, serverNow, me: { status: "not_played"|"in_progress"|"counted", runId, result: { runId, score, depth, finishedAt, tiers, shareText } | null, streak, dailyStreak } | null }` (404 = no puzzle today). Play button: `POST /api/daily/today/run` → `{ runId, resumed, counted, number, day }` then the normal `/runs/[runId]` screens (`counted: false` → show "practice"). Countdown: `nextAt` with offset `Date.parse(serverNow) − Date.now()` (flip clock). Board: `GET /api/daily/leaderboard?day=&scope=global|friends&limit=` → `{ daily, leaderboard }` (F21 `Leaderboard`, use `place`; friends 401 signed out). Archive: `GET /api/daily/archive` → `{ days: [{ number, day, theme, title, gameId, isToday, players, me: { counted, bestScore, runs } | null }] }`; past days play as practice via `POST /api/games/[gameId]/runs`. Share: copy `result.shareText` (or the Reveal's `daily.shareText`).
- **F19 (landing teaser):** `GET /api/daily/today` works signed out: show `number`, `title`, `teaser` (first Prompt text) and the countdown; "Try today's Daily Dive" → sign in, then `POST /api/daily/today/run`.
- **F09 (Reveal):** every Reveal now has optional `daily` and `crowd` (null outside the Daily). `crowd = { players, betterThanPct /* "better than X% of today's players", null if none */, medianScore, bucketSize /* 50 pts = 500 m */, histogram: { bucket /* lower bound, pts */, count }[], answerFindRates: { answerId, position, answer, pct }[] }`: draw the distribution curve from `histogram` and mark YOU at `score`; put "% of players found this" next to each Answer by `position` + `answer`. `daily = { number, day, title, counted, tiers, shareText }`: title `DIVE #N COMPLETE`, a copy-share button, and a "practice" tag when `counted` is false.
- **Run engine:** a Daily Game plays its 7 Prompts in a fixed order (not random); `afterFinish()` calls `recordDailyRun` after the Course step. Only Counted Runs get Daily XP (`onDailyPlayed`); `daily-top-10` is awarded in SQL when the next day is claimed.
- **Ops:** after merging, run `npm run db:migrate` (already applied on stormhacks-dev) and `npm run db:seed:daily` (already run). Set `NEXT_PUBLIC_SITE_URL` in production for the share link. Refill the pool before it runs dry (12 seed + 3 generated = until about 2026-10-18): `npm run daily:generate -- --days 14`.

## F24 Apogee and Leap screens (three.js)
Spec: `docs/worklog/aaf1007/overnight-decisions.md` §4, Q18, Q21 · `docs/design/modes/apogee.md`, `docs/design/modes/leap.md` · Issue #37
- [x] Apogee Run + Mission Report: port inspo/krillion-space-variant/apogee.html to React + three.js
- [x] Leap Run + results: three.js hopper on rising sky-island platforms, hearts, streak, 50/50
- [x] Both use the shared round/results blocks where they fit; reduced motion; mobile

Entry points: `components/modes/apogee/` (`ApogeeRunScreen`, `ApogeeRevealScreen`, `scene.ts`, `altitude.ts` with `LANDMARKS`/`APOGEE_TIERS`/`MISSION_BANDS`, `AltitudeRuler`, `TierReveal`), `components/modes/leap/` (`LeapRunScreen`, `LeapRevealScreen`, `scene.ts`), both wired in `app/runs/[runId]/mode-screens.tsx`; `runApi.answer` / `runApi.lifeline` in `lib/runs/client.ts`; `components/results/TopicPassBanner.tsx` (`revealTopic(reveal)`); `ResultList` takes an optional `tiers` map · Notes for others: three.js scenes are plain classes loaded by a dynamic import from a `*Stage` component (queue commands with `stage.run(fn)`); they pause while hidden, cap DPR at 2 and dispose on unmount. In `next dev` the live scene is on `window.__apogee` / `window.__leap` and `.step(ms)` advances a frame by hand (background tabs don't run rAF). Apogee shows 1 km per point; landmarks are real up to the ISS (408), stylised above. **F25:** `runApi.answer` already covers Blitz's `{ value }`. **F27:** the "Topic passed!" banner renders when a Reveal has `passed` and a `topic` object (`{ title, href? }`); give the F22 Reveal that field and it shows up on every Mode that uses the banner. **F29 (Arena):** `components/modes/leap/LeapStage.tsx` + `scene.ts` are the pattern to copy.

## F25 Pairs and Blitz screens
Spec: `docs/design/modes/pairs.md`, `docs/design/modes/blitz.md`, `docs/architecture/run-and-scoring.md` § Pairs / § Blitz, `docs/worklog/aaf1007/overnight-decisions.md` §4, Q19, Q20, §14 · Issue #38
- [x] Pairs two-column board with snap/flip animations, clock, results
- [x] Blitz neon arcade true/false with combo, beat pulse, results
- [x] Both wired into the Run/Reveal dispatcher (`app/runs/[runId]/mode-screens.tsx`); "Topic passed!" banner when the Reveal carries F22's `topic`
- [x] Keyboard-first, reduced motion, phone layouts (Pairs columns become term chips over a definition stack)

Entry points: `components/modes/pairs/` (`PairsRunScreen`, `PairsRevealScreen`, `pairs.module.css`), `components/modes/blitz/` (`BlitzRunScreen`, `BlitzRevealScreen`, `useBeat`, `beat.ts`, `blitz.module.css`), `components/modes/shared/` (`TopicPassBanner` + `revealTopic`, `MasteryBlock`), `[data-theme="pairs"]` / `[data-theme="blitz"]` in `app/globals.css`

Notes for others:
- **Try it:** `npx next dev` with `DEV_PLAYER_ID`, then `/runs/new?game=<id>` (or `POST /api/games/<id>/runs`) on a Pairs or Blitz Game, e.g. the seeded "Graph Algorithms (Week 9) · Pairs" / "· Blitz".
- **API helpers added:** `runApi.pair(runId, { termId, definitionId, board? }, clock)` and `runApi.blitzAnswer(runId, { value, position? }, clock)` in `lib/runs/client.ts` (Leap's `answer` is F24's to add).
- **Sound:** `sfx.audioNow()` and `sfx.drum(voice, at, freq?)` (`BeatVoice = kick | snare | hat | bass | blip`) in `lib/ui/sfx.ts` schedule beat hits on the audio clock; they respect mute. `useBeat({ active, bpm, layers, target })` writes the pulse to `--beat` on an element, if another Mode wants a beat.
- **Shared for F24/F27:** `TopicPassBanner` (reads `reveal.topic` structurally, so it works before and after F22 merges) and `MasteryBlock` are Mode-agnostic; Dive/Apogee/Leap Reveals can drop them in.
- **Known gaps:** leaving mid-Board doesn't pause the clock (same as Dive). Creating any Run abandons your other in-progress Runs (engine rule), so agents testing with the same dev player can abandon each other's Runs.

## F26 Profile, Friends and Leaderboard pages
Spec: `docs/architecture/social.md` (API), `docs/architecture/ui-map.md` § F26, decisions §6, §12 (Q8, Q11, Q12), §13 (Q17), §14 · Issue #39
- [x] Profile card (pixel avatar + Edit picker, Total XP, Rank, Badges, Day streak, View profile) used on /home and profile (home: F19's `ProfileSidebar`; profile: the same stats in `StatsCard`, without the redundant avatar/View profile)
- [x] /u/[username]: banner, avatar, level, heatmap, badges, bests, friend button
- [x] /friends (list, requests, search); /leaderboard tabs + Global/Friends
- [x] Also: `/profile` → `/u/[me]`; animated pixel banners (ocean, space, sky; default from the username); Edit profile dialog (display name, username with live availability, bio, avatar picker, photo toggle, banner); Course progress with Topic badges and recent activity on profiles; flip-card Badge grid with locked "how to earn"; podium with confetti, FLIP rows, pinned own row and weekly reset countdown; Lumen empty states; 375 px, keyboard, reduced motion

Entry points: `app/profile/page.tsx`, `app/u/[username]/` (`page.tsx`, `data.ts` `recentActivity`/`courseProgress`/`playerIdFor`, `ProfileHeader`, `EditProfile`, `Sections` `Bests`/`Courses`/`RecentActivity`, `not-found.tsx`), `app/friends/` (`page.tsx`, `FriendsClient`, `data.ts` `friendStreaks`), `app/leaderboard/` (`page.tsx`, `LeaderboardClient`, `Podium`, `daily.ts` adapter), `components/social/` (`ProfileBanner` + `banners.ts`, `ActivityHeatmap`, `BadgeGrid`/`Medallion`, `BadgeGlyph`, `FriendButton`, `StatsCard`, `RankEmblem`, `EmptyState`, `SocialBackdrop`, `api.ts` client for the social API, `format.ts` + tests)

Notes for others:
- **F23 (Daily):** the Daily Dive tab is wired but shows "arrives soon": set `daily.gameId` in `app/leaderboard/page.tsx` (TODO there) to today's Daily Game and `app/leaderboard/daily.ts` already calls `GET /api/leaderboards/games/[gameId]?day=&scope=&counting=first`.
- **Reuse:** `FriendButton` (Add / Requested / Accept+Decline / Friends ✓ with unfriend confirm), `ProfileBanner theme={bannerFor(banner, username)}`, `Medallion`/`BadgeGlyph` (draws F21's badge icon ids anchor, moon, trench, frog, stopwatch, coral, trident, scroll, diploma that `PixelIcon` lacks), `RankEmblem rank=…`, `EmptyState say title` (Lumen with a bubble that fits 375 px), `socialApi` in `components/social/api.ts`.
- Banner ids are `ocean`, `space`, `sky` (stored in `players.banner`; null = derived from the username). No migration.
- Username availability in the Edit dialog = `usernameProblem()` locally + exact match in `GET /api/players/search`; the PATCH still returns 409 if it races.
- Profiles show recent activity from `xp_events`, naming a Game only when it's public (Module Games show as "Finished a Leap Run").
- Integration fix: `components/results/ResultList.tsx` `KIND_LABEL` gained `multiple_choice` and `true_false` (F19 + F22 merge didn't typecheck without it).

## F27 Explore, Course and Topic pages
Spec: `docs/architecture/ui-map.md` § Explore, `docs/architecture/courses.md` (decisions: overnight-decisions §5, Q24, Q27, §14) · Issue #40
- [x] /explore catalogue (Python Basics + locked coming-soon cards), public
- [x] /explore/[course]: banner hero, numbered Topic timeline with accordions, sidebar progress/badges
- [x] /explore/[course]/[topic]: reading, resources, mark as read, Practice Mode tiles, pass bar, celebration + unlock animation
- [x] Also: `?passed=<topicSlug>` replays the unlock animation on the Course page; SEO metadata on all three pages; 375 px; reduced motion

Entry points: `app/explore/page.tsx` (catalogue), `app/explore/[courseSlug]/page.tsx` (Course page), `app/explore/[courseSlug]/[topicSlug]/page.tsx` (Topic page), `app/explore/layout.tsx` (SkyBackdrop + signed-out bar), `app/explore/_components/` (`art.tsx` pixel banners `PythonBanner`/`CourseArt`, `TopicTimeline`, `CourseSidebar`, `ReadingView`, `Markdown` (`CodeBlock`), `TopicClient` (`PracticePanel`, `MarkAsRead`, `TopicPassedBanner`), `CatalogueCards`, `ProgressRing`, `Parallax`, `SignInCta`/`useSignInPrompt`), `app/explore/_lib/` (`markdown.ts` tiny parser, `python-highlight.ts` tokenizer, `modes.ts` `passLabel`/`bestLabel`, `server.ts` cached data loaders), tests `app/explore/_lib/explore.test.ts`

Notes for others:
- **Reveal → unlock animation (F09, F24, F25):** when a Reveal has `topic.passedNow`, link its "Topic passed" banner / Back button to `/explore/${topic.courseSlug}?passed=${topic.topicSlug}`. The Course page then fills the line below that Topic, pops the next node open with a burst, and the mascot says "Topic N unlocked!" (or confetti + "You finished the whole course!" when `courseFinished`). It only animates if the Topic really is passed for the viewer, and strips `?passed` from the URL afterwards. For a plain "back to the Topic" link use `/explore/${courseSlug}/${topicSlug}`; the Topic page shows a "Topic passed!" banner (confetti once per session) whenever `passed_at` is set.
- **Play:** the Practice panel `POST`s `/api/games/[gameId]/runs` and `router.push('/runs/<runId>')` (F09's screens). Signed out it opens Clerk's sign-in modal (returning to the same page); 403 shows "Pass Topic N−1 first".
- **Pages read data directly** (`lib/courses/queries.ts` via `app/explore/_lib/server.ts`) with `getApiPlayer()` (null signed out), not via fetch. Per-Mode bests on the Course timeline come from one extra read-only query on `topic_progress.modes` (`topicRecords()`), so the Courses API contract is unchanged.
- **Markdown:** readings are rendered by a ~100-line parser (headings, paragraphs, ```python fences, lists, blockquotes, `code`, **bold**, links). A blockquote starting with `**Common mistakes**` becomes the orange callout. Single `*` is never emphasis (readings use `*`/`**` as Python operators in prose). New seed content should stick to that subset.
- **Coming-soon cards** (SQL Basics, Data Structures, Web Basics) are hard-coded in `app/explore/page.tsx` (decision §5 CHECK). A real second Course just needs seeding; give it a `banner` id (`sql`, `tree`, `web` already have art; anything else falls back to the jungle python).
- **Nav:** F19 should add "Explore" to the site nav. Signed out, `app/explore/layout.tsx` shows its own small bar (Logo + Sign in) because the root header only renders when signed in.
- Integration fix outside `app/explore`: `components/results/ResultList.tsx` `KIND_LABEL` gained `multiple_choice` and `true_false` (tsc failed after merging F20's Prompt kinds into F10; same fix as F09's branch).

## F28 Daily Dive hub page
Spec: `docs/architecture/ui-map.md` § `/daily` and § Reveal, `docs/architecture/daily-dive.md` (API), decisions §7, Q9, Q23, Q24, §14 · Issue #41
- [x] /daily: today's card, play or your result, flip-clock countdown, streak, leaderboard, share grid, archive (practice)
- [x] Dive Reveal shows the crowd distribution for public Games
- [x] Also: ocean-dawn hero with the day number in VT323 and Lumen commentary; Reveal Daily block (`DAILY #N COMPLETE`, counted/practice, share, "See today's leaderboard", practice replay) and "% found" per Answer; landing teaser and `/home` Daily card on real data; `/leaderboard` Daily tab live; 375 px, reduced motion

Entry points: `app/daily/` (`page.tsx` server reads from `lib/daily`, `DailyHub`, `TodayCard`, `DailyBoard`, `Archive`, `play.ts` `usePlay`), `components/daily/` (`DawnScene`, `FlipClock` + `flip-clock.module.css`, `ShareButton` + `copyText`, `TierSquares`, `format.ts` `crowdCaption`/`findRateLookup`/`histogramPoints`/`lumenLine`/`metres`/`dayLabel`/`clockParts` + tests), Reveal: `components/modes/dive/DiveRevealScreen.tsx`

Notes for others:
- **Reuse:** `<ShareButton text look="site"|"dive">`, `<TierSquares tiers size? animate?>` (server-safe), `<FlipClock target serverNow onDone?>`, `<DawnScene>{hero}</DawnScene>`.
- **Shared component additions (backwards compatible):** `DistributionChart` takes `weights?` (per value, e.g. players per bucket) and `subcaption?`; `DiveReveal` takes `afterHeader?`, `actions?` (replaces DIVE AGAIN) and `findRate?`; `ResultList` takes `findRate?: (position, answer?) => pct | null` ("% found" under each Answer).
- **F19 integration edits:** `getDailyTeaser(daily?)` in `components/landing/daily-teaser.ts` now takes F23's `DailyToday` (`app/page.tsx` and `app/home/page.tsx` pass `dailyToday(...)`, falling back to the sample on error); `SHARE_SQUARES` match F23's share text; the landing teaser shows the puzzle's title and theme; `DailyCard` in `app/home/MainCards.tsx` takes `daily` and shows Dive in / Resume / your depth + squares.
- **F26 integration edit:** `app/leaderboard/page.tsx` sets `daily.gameId` from `getDailyPuzzle(today)`.
- The dev DB's only real player is Anton, so Daily #1's counted result (315 pts, −3,150 m) is on his account from the F28 verification.

## F29 Arena: three.js FPS study Mode (stretch)
Spec: `docs/worklog/aaf1007/overnight-decisions.md` Q22, §14 · `docs/design/modes/arena.md` · `run-and-scoring.md` § Arena · Issue #42
- [x] Mode `arena` reusing multiple_choice; pointer-lock + WASD, click-to-aim on mobile; shoot the right target
- [x] Engine: `MODES.arena` available with its own engine; Leap's generator; rules (10 × 20 s, hit = answer, wrong hit −3 s / −25 and the question stays open, Leap's streak multiplier, pass ≥ 7); `POST answer { optionId }` takes Arena hits; unit + DB tests; seeded Arena Game
- [x] Screen: three.js neon training room, holo-board, 4 drifting targets, blaster with muzzle flash, tracer, sparks, explosion / shatter, HUD (timer, score, streak, n/10), pause on Esc, keys 1–4, touch tap-to-aim, WebGL fallback list
- [x] After-Action Report: score, accuracy, best streak, fastest hit, round log, every question with your hits, the right option, explanation and Evidence
- [x] Dispose on unmount, DPR ≤ 2, paused while hidden, reduced motion, mute; Arena Mode tile mini-scene

Entry points: `lib/modes/arena/rules.ts` (`arenaPoints`, `arenaSpeedBonus`, `accuracy`, `ARENA_*`, `passed`), `lib/modes/arena/generate.ts` (`arenaGenerator` = Leap's), `lib/runs/engines/arena.ts` (`arenaEngine`, `arenaHit`), types `ArenaRunState` / `ArenaHitBody|Result|Response` / `ArenaReveal` in `lib/runs/types.ts`, `runApi.hit` in `lib/runs/client.ts`; `components/modes/arena/` (`ArenaRunScreen`, `ArenaRevealScreen`, `ArenaStage`, `scene.ts`, `arena.css`) wired in `app/runs/[runId]/mode-screens.tsx`; `sfx.laser` / `sfx.shatter` / `sfx.blast` · Notes for others: Arena is now a normal available Mode (`isModeId('arena')` is true; the New Game dialog should list it unlocked by reading `MODES[mode].available`, as the styleguide picker now does). Its Games are generated exactly like Leap's, so `generate:check --mode leap` covers it. Wrong hits are `guess_events` rows with `is_correct = false` (several per Prompt possible), like Dive's wrong guesses. `RunSummary` for Arena is `{ outcome: 'cleared', stats { questions, correct, timeouts, wrongHits, bestStreak } }` (F21/F23: XP and badges can read it). In `next dev` the scene is on `window.__arena` (`.step(ms)` advances a frame); pointer lock is refused in iframes/automated tabs and the screen falls back to click-to-aim. The `/runs/new` launch beat is still the shared ocean scene (F09's), not an Arena-themed one.

## F30 Split generation: parallel Open and other-kinds calls
Spec: `docs/architecture/game-generation-pipeline.md` § Split generation (F30) · Issue #64 · **On by default** (`GEMINI_SPLIT=off` sends one call)
- [x] Shared mechanism: a Mode may give several requests per document (`ModeGenerator.split`); `generateGame` runs them in parallel and joins their `prompts` before the Mode's checks
- [x] Dive/Apogee split by kind: one call writes the Open Prompts, one writes cloze / definition_to_term / ordered_recall / odd_one_out. Both see every page. Also when overgenerating (F17)
- [x] Behind `GEMINI_SPLIT` (on/off), default decided by the measurement
- [x] `generate:eval` / `generate:check` run the split calls too (`--split`), record wall time and per-call usage
- [x] Unit/DB tests; F14 scorecard before/after (wall time, cost, Prompts kept, Open, Ans/Open, duplicates)

Entry points: `splitEnabled()`, `generationPlan()`, `generateSplit()`, `joinResponses()` and the optional `ModeGenerator.split` / `overgenerate.split` hooks in `lib/modes/generation.ts`; `diveSplitRequests(counts)`, `diveSplitRequest`, `diveOvergenerateSplitRequest` in `lib/modes/dive/generate.ts`; `gameOpenSystemInstruction`, `gameOtherSystemInstruction`, `gameResponseSchema(kinds)`, `GAME_SPLIT_COUNTS` in `lib/gemini/game-prompt.ts`; `generateGame(gameId, { …, split })`; env `GEMINI_SPLIT`; `npm run generate:eval -- --split`, `npm run generate:check -- … --split`; `generateTimed`, `requestsVersion` in `scripts/deck-pages.ts`; replay set `eval/split/` (and `eval/split/single/`)

Notes for others:
- **It's only ~8 % faster.** Measured on gemini-3.5-flash (3.6 was 503ing): 183 → 169 s over four decks. The Open call thinks as much as the whole single call; thinking dominates and doesn't shrink with fewer Prompts. It's on for quality: Open Prompts 27 → 35 (informal notes 3 → 9), same Ans/Open and quotes, for +40–50 % generation tokens.
- **Don't lower the thinking level** to go faster: `low` is 4× faster but returns 1–2 Open Prompts per deck. Decided to keep the default.
- **One failed call doesn't fail the document:** the other call's Prompts are kept and a warning is logged; the Game fails only if both fail or too few Prompts survive.
- **Tests:** a fake `generate` defaults to `split: false` (one call per document, like the verification pass); pass `split: true` to test the split. Fakes can tell the calls apart by `request.contents(...)`: `Write 8-10 "open" Prompts` vs `Write 7-10 non-"open" Prompts`.
- **Leap/Pairs/Blitz don't split yet.** Give a `ModeGenerator` a `split: GenerationRequest[]` (whose `prompts` arrays add up to one call's) and `generateGame` runs it.
- Fixed an order-dependent assertion in `generate-game.db.test.ts` (the seed fixture has two kinds of "BFS" Answer rows; the query had no order).
- Gemini spend for F30 ≈ $0.5 (estimated at 3.6-flash rates; 3.5-flash has no listed price, and the many 503 attempts on 3.6-flash weren't billed).

## F31 Faster Gemini fallback: fewer retries on 503, fall back on timeout
Spec: `docs/architecture/game-generation-pipeline.md` § Gemini call (Overload) · Issue #66
- [x] Per-model retry budget: on 429/5xx the first model gets 1 retry (2 s), then the next model; the last model keeps the full 2/5/12 s retries
- [x] A timed-out or aborted attempt goes straight to the next model (it fails only on the last one)
- [x] Per-attempt generation timeout 240 s → 150 s (slowest normal 3.6-flash call measured: ~120 s)
- [x] The retry/fallback loop is a pure, unit-tested function (fake attempts, fake sleep)
- [x] Spec § Gemini call (Overload) updated

Entry points: `withFallback(models, attempt, { sleep? })`, `failureKind(err)`, `RETRY_DELAYS_MS`, `EARLY_RETRY_DELAYS_MS` in `lib/gemini.ts` (used by `generateDocumentPrompts`, so generation and the verification call both get it); tests in `lib/gemini.test.ts`

Notes for others:
- **What it fixes:** when 3.6-flash is overloaded (it 503'd every full-size request for 30+ min on 2026-10-04), each call now reaches flash-lite after ~2 s of retrying instead of ~20 s. A stalled call used to **fail the Game** after 240 s, because the SDK's timeout throws `AbortError` (not `ApiError`) and the old `retryable()` didn't recognise it. Now it falls back after 150 s.
- **Verification** uses the same loop with its own model order (lite first) and 120 s timeout, so a stalled verifier also falls back to 3.6-flash now.
- The SDK's own retries (`httpOptions.retryOptions`) stay off; all retrying is in `withFallback`.
- Without `GEMINI_FALLBACK_MODEL` there's one model, and it keeps the full 2/5/12 s retries as before.

## F32 Sonar: AI study coach (LangGraph) over a per-concept learner model
Spec: `docs/architecture/sonar.md` · Issue #73
- [x] Python Basics concept graph (22 Concepts, 28 prerequisite edges) and Prompt tags (447 Prompts, Gemini-tagged, sidecar JSON)
- [x] Learner model: Mode-aware BKT with noisy-AND blame, root cause, ranked next actions (pure, tested)
- [x] Sonar agent (LangGraph + Gemini) with tools; briefing and chat API
- [x] `/sonar` page (mastery map), floating Sonar buddy (pixel dolphin) on every page except Run screens, speech bubbles, Ask Sonar buttons
- [x] Demo seed (allowlisted to one account and `demo_sonar_*` test players)

Entry points: `loadSonarModel(playerId)` in `lib/sonar/queries.ts` (the model); `runSonar({ playerId, message?, context })` in `lib/sonar/agent.ts`; `GET /api/sonar/model`, `POST /api/sonar/chat`, `GET /api/sonar/bubble?path=`; `openSonar({ message? })` in `lib/sonar/client.ts` opens the drawer from any client component; `components/sonar/AskSonarButton.tsx`; `npm run sonar:tag` (re-tag after editing the course), `npm run sonar:demo [-- demo_sonar_<x>]`.

Notes for others:
- **AI never during a Run.** Sonar runs between Runs only; the buddy hides on `/runs/[runId]`. The numbers come from deterministic code (`lib/sonar/{model,diagnose,plan}.ts`); Gemini only explains and picks among checked options.
- **No migration.** The model is computed on read by replaying `guess_events` (plus `run_prompts` timeouts) on the Course Module's Games, about 80 ms.
- **Changing Python Basics content:** run `npm run sonar:tag` afterwards. Tags are keyed by a hash of the Prompt text; an untagged Prompt falls back to its Topic's weakest Concept at half weight.
- **The coach is Claude Sonnet 5.5** (`ANTHROPIC_API_KEY`, `SONAR_MODEL`), traced in LangSmith. Gemini is the fallback, and is used alone without that key.
- **Agent memory** is an in-process `MemorySaver` (per Player, lost on restart).
- `npm run sonar:demo` **deletes** the target's Python Basics Runs, guesses and Topic progress before seeding.

## F33 Dive matches Krillion: continuous descent, catch and miss screens, intro pan
Spec: `docs/design/modes/dive.md` §5–6 · Issue #72 · Reference: a recorded Krillion daily dive (youtube.com/watch?v=YU2mpcddchs)
- [x] One continuous descent: the camera rides down with the answer chip (~3 s, Krillion's timing), the card scrolls away with the water, DEPTH counts live
- [x] Tier lines hang in the water below where you answered (+100/+250/+600/+1,000 m), light up as the chip passes, the chip stops on its own; nothing is drawn while you answer
- [x] Chip in its tier colour with the tier's creatures swimming round it and a bubble trail
- [x] Real-ocean depth facts on the screen edges (replaces the depth ruler on the Run)
- [x] Catch screen at Krillion's size and layout; the score counts up; fades out into the next card rising from the water
- [x] NOTHING LANDED screen after a timeout or one-try miss; wrong guesses read `“x”: no echo · try again`; hot clock glows on the top edge
- [x] Fresh Runs open in the sky over a bigger boat and pan down to the waterline; the playground gets a title shot
- [x] Same flow in `/styleguide/dive`; unit tests for the fall curve, world shift and camera follow

Entry points: `Descent`, `SKY_DEPTH`, `useSkyCarry` in `components/modes/dive/Descent.tsx`; `DepthMarks` in `components/modes/dive/DepthMarks.tsx`; `fallMs`, `fallCurve`, `worldShift`, `DiveCamera.follow` / `.min` in `components/modes/dive/depth.ts`; `CatchScreen tier="miss"`; `RoundCard` state `"rise"`; `DiveHud` `camera` prop

Notes for others:
- **No scoring or API change.** Tiers, points and the start-prompt clock are untouched; the clock still starts only after the next card has come up (`ENTER_MS` is now 1.1 s).
- `TierLines` and `DepthRuler` are no longer on the Run screen but stay exported.
- Krillion's "did you mean X? submit again to confirm" typo flow is **not** copied: it's matching logic (F05), not animation.

## F34 Clerk sign-in and sign-up match the site style
Issue #77
- [x] `appearance` on `ClerkProvider`: the :root palette, Pixelify for headings and buttons, Mulish body
- [x] Clerk elements reuse the site recipes: yellow `.px-btn` primary action, `.px-btn` social buttons, `.px-frame` card with a hard drop, 2px input border that turns signal-cyan on focus
- [x] `cssLayerName: "clerk"` and `@layer theme, base, clerk, components, utilities` so Tailwind preflight can't break Clerk and our classes win
- [x] Checked in a production build: `/sign-in` page and the nav's sign-in modal
- [ ] Application name in the Clerk dashboard set to SYLLABYSS (the title says "Sign in to StormHacks 2026" until then; dashboard only, needs human)

Entry points: `clerkAppearance` in `lib/ui/clerk-appearance.ts`; the `.cl-*` rules next to `.px-frame` in `app/globals.css`

Notes for others:
- Applies to every Clerk component (SignIn, SignUp, the modals from `SignInButton`/`SignUpButton`, UserButton, UserProfile). Style a new one by adding its element key to `elements`, or a `.cl-<element>` rule in globals.css.
- Colours are hex copies of the :root tokens: Clerk derives shades from them and can't read CSS variables. Change both if the palette changes.
- "Secured by Clerk" stays (removing it needs a paid Clerk plan).

## F36 Pop-up when a friend accepts your request
Issue #79
- [x] `friendships.requester_notified_at`; existing accepted requests count as already told
- [x] `takeAcceptedNotices(me)` marks and returns untold acceptances in one statement, so each pop-up shows once
- [x] `POST /api/friends/notices`
- [x] Signed-in pages check on load, every 30 s while visible, and when the tab comes back; the toast links to the friend's profile
- [x] `ToastInput.href` (additive): a toast can be a link
- [x] DB test: pending, accepter not told, once only, crossed requests

Entry points: `takeAcceptedNotices` in `lib/social/friends.ts`; `AcceptedNotice` in `lib/social/types.ts`; `POST /api/friends/notices`; `components/social/FriendNotices.tsx` (mounted in `app/layout.tsx`); `href` on `ToastInput` in `components/ui/Toast.tsx`

Notes for others:
- **Migration** `20261004T1400_friend_notices.sql` (already applied to the shared DB).
- Polling, not realtime: a notice can take up to 30 s to show.
- Crossed requests (B "adds" A after A asked B) notify A, the original requester.
## F35 Study notes: slide panel on the Reveal, study page per file, maths symbols in questions
Issue #75
- [x] Gemini rewrites each parsed page into tidy study notes (headings, lists, tables, bold terms, one-line Unicode formulas), on first view, stored in `source_pages.notes_md`
- [x] Reveal: an Evidence link opens its page in a side panel (quote callout, ←/→ pages, "Study the whole file →"), every Mode
- [x] Study page per file replaces the file viewer pop-up: whole file as continuous notes, sticky contents with scroll spy and progress (page picker on phones), ←/→, notes loaded lazily as pages near the screen, "Test yourself" links to the file's Games
- [x] Generated questions write maths with symbols (∪ ∩ ∅ Aᶜ A₁ ≤), every Mode; `npm run math:backfill` fixes old Games
- [x] Markdown tables keep `|` inside code spans in one cell; file ↔ Game hover glow removed on the Module page

Entry points: `GET /api/documents/[documentId]/pages/[pageNumber]/notes`; `writePageNotes` in `lib/gemini/notes.ts`; `loadPageNotes` in `app/modules/_lib/notes.ts`; `/modules/[moduleId]/study/[documentId]?page=N` (`StudyNotes.tsx`), `studyHref()` in `app/modules/_lib/files.ts`; `SlidePanelProvider` / `useSlidePanel` in `components/results/SlidePanel.tsx`; `MarkdownView variant="notes"`; `MATH_NOTATION_RULE` in `lib/gemini/math-notation.ts`; `npm run math:backfill -- (--player <id> | --module <id>) [--apply]`

Notes for others:
- **Migration** `20261004T1300_page_notes.sql` adds nullable `source_pages.notes_md`. `content_md` is unchanged and still feeds generation and Evidence quotes.
- Notes use the fast model first (GEMINI_FALLBACK_MODEL, ~1 s a page), then GEMINI_MODEL. Re-parsing a file resets its notes; `update source_pages set notes_md = null` regenerates them after a prompt change.
- The FileViewer modal is gone. Old `/modules/<id>?doc=&page=` and `/modules/files/<docId>?page=` links redirect to the study page; Evidence links point there too.
- New generator instructions in any Mode should keep `${MATH_NOTATION_RULE}` at the end. `math:backfill` only rewrites `prompts.text/hint/explanation`: options and answers are what matching uses.
