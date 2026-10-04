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
| F10 | Visual design system (site + Mode themes) | Frontend | design session | #10 | done |
| F11 | Game page UI | Frontend | F07 | #11 | planned |
| F12 | Deploy and demo prep | Platform | everything | #12 | planned |
| F13 | Game Modes: `games.mode` and the Mode picker | Platform | F01 | #21 | planned |
| F14 | Generation scorecard (eval on real decks) | Pipelines | F04 | #24 | planned |
| F15 | Example Prompts in the generator instructions | Pipelines | F04 (F14 to measure) | #25 | planned |
| F16 | Gemini verification pass for Answers | Pipelines | F04 (F14 to measure) | #26 | planned |
| F17 | Overgenerate and select the best Prompts | Pipelines | F04, F14 | #27 | planned |
| F18 | Open Prompt answer expansion with retrieval (pgvector, stretch) | Pipelines | F04, F14 | #28 | planned |
| F19 | Landing page and site-wide UI overhaul | Frontend | F10 | #32 | done |
| F20 | Game Modes engine and generation: Apogee, Leap, Pairs, Blitz | Platform | F04, F06 | #33 | done |
| F21 | Social backend: profiles, XP, streaks, heatmap, badges, friends, leaderboards | Platform | F01, F07 | #34 | done |
| F22 | Courses backend and the seeded Python Basics course | Platform | F20 | #35 | done |
| F23 | Daily Dive backend | Platform | F21, F22 | #36 | planned |
| F24 | Apogee and Leap screens (three.js) | Frontend | F10, F20 | #37 | planned |
| F25 | Pairs and Blitz screens | Frontend | F10, F20 | #38 | planned |
| F26 | Profile, Friends and Leaderboard pages | Frontend | F10, F21 | #39 | done |
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
