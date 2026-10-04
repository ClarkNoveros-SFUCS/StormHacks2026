# Features: the build checklist

The single board for **what to build, who can take it, and what's done**. Each feature is one GitHub issue, worked by one person on one branch.

- **Claim:** assign yourself to the feature's issue and add the `in-progress` label (`docs/agents/coordination.md`). The claim lives on GitHub, not in this file.
- **Ship:** once the user has reviewed the work and approved it (agents never open PRs on their own), in the PR that closes the issue, tick the feature's boxes here, set its Status to `done`, and fill in **Entry points** and **Notes for others**. Edit only your own feature's section, so PRs never conflict.
- **Unblock yourself:** most features depend only on F01. F02's seed data lets every gameplay and UI feature run without the upload and AI pipelines.

## Board

| ID | Feature | Lane | Depends on | Issue | Status |
|---|---|---|---|---|---|
| F01 | Foundation: auth, DB, migrations | Platform | — | #1 | planned |
| F02 | Seed data: demo Module and Game | Platform | F01 | #2 | planned |
| F03 | Upload pipeline (Snowflake) | Pipelines | F01 | #3 | planned |
| F04 | Game generation (Gemini) | Pipelines | F01 (F02 for test pages) | #4 | planned |
| F05 | Answer matching | Gameplay | F01 | #5 | planned |
| F06 | Run engine and scoring API | Gameplay | F01, F05 | #6 | planned |
| F07 | Progress: Personal Best and Mastery | Gameplay | F01 | #7 | planned |
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
- [ ] Tiger Cloud service created and `DATABASE_URL` shared with the team (follow `docs/setup/tiger-data.md`)
- [ ] Clerk installed; `proxy.ts` protects every route except `/`; signed-in `/` redirects to `/modules`
- [ ] `lib/db.ts` (`postgres` client, server only) and `lib/auth.ts` (`requirePlayer()` returns the Clerk id and upserts `players`)
- [ ] `scripts/migrate.mjs` plus the `schema_migrations` table; `npm run db:migrate`
- [ ] Initial migration = the full schema from `data-model.md`, including the `guess_events` hypertable and `fuzzystrmatch`
- [ ] `.env.example` listing every variable from `overview.md`
- [ ] Applied cleanly to a Tiger Cloud service

Entry points: — · Notes for others: —

## F02 Seed data: demo Module and Game
Spec: `docs/architecture/data-model.md`
- [ ] `npm run db:seed` creates, for a given Clerk user id, a "Graph Algorithms" Module, one parsed Source Document with ~10 pages, and one `ready` Game
- [ ] The Game has ≥ 7 Prompts covering all five kinds, with Tiers, Hints, Evidence and `answer_keys` (use the original sample JSON's graph-algorithm content)
- [ ] Idempotent: re-running replaces the demo data and nothing else

Entry points: — · Notes for others: —

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
- [ ] `lib/matching/normalize.ts` with unit tests for every row of the spec's examples table
- [ ] `lib/matching/match-guess.ts`: `matchGuess(promptId, raw)` with exact → typo (length budget) → ambiguity rule; `exact_only` respected
- [ ] Integration test against F02's seeded Prompt (BFS/DFS can't fuzzy-match each other)

Entry points: — · Notes for others: —

## F06 Run engine and scoring API
Spec: `docs/architecture/run-and-scoring.md`
- [ ] `lib/scoring/points.ts`: `openPoints`, `singlePoints` (Staleness halving with a minimum of 1; Hint drops a Tier, common → 5), unit-tested
- [ ] `lib/runs/run-engine.ts`: create (7 random Prompts, abandon other in-progress Runs), startPrompt, guess, hint, timeout, advance, finish
- [ ] Server-owned clock: deadline, −3 s per wrong typed guess, 500 ms grace, late requests close the Prompt as timeout first
- [ ] Put-in-order and odd-one-out are one-shot
- [ ] Every guess is written to `guess_events`
- [ ] All `/api/runs/...` routes and `GET /reveal`, returning the spec's `RunState`/`GuessResult` types; Answers and Hints never leak early
- [ ] Shared types exported from `lib/runs/types.ts` for the frontend

Entry points: — · Notes for others: —

## F07 Progress: Personal Best and Mastery
Spec: `docs/architecture/data-model.md` (Progress queries)
- [ ] `lib/progress.ts`: `personalBest`, `mastery`, `masteryByTier`, `recentRuns`
- [ ] The Reveal includes "new Personal Best?" and Mastery before → after
- [ ] Optional: the `player_game_daily` continuous aggregate and a query for the stats chart

Entry points: — · Notes for others: —

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
