# Architecture overview

Start here. Read `CONTEXT.md` (repo root) first for vocabulary: every capitalised term below (Module, Game, Run, Prompt, Tier…) is defined there, and code should use the same words.

## What we're building

A solo, Krillion-style study game. A Player uploads course files into a **Module**, picks some of those files to generate a **Game**, then plays **Runs** of that Game: 7 timed Prompts where less obvious correct Answers score more. There is no multiplayer, no crowd data, and no leaderboard. Progress is measured against yourself (Personal Best, Mastery).

## Stack

| Concern | Choice | Notes |
|---|---|---|
| App | Next.js 16 (App Router), React 19, Tailwind 4 | Read `node_modules/next/dist/docs/` before writing Next code: v16 renamed `middleware.ts` to `proxy.ts`, among other changes. |
| Auth | Clerk | Clerk user id is the Player id. `proxy.ts` runs `clerkMiddleware()` only; each page and server action protects itself with `requirePlayer()`, and each route handler with `getApiPlayer()` (401 when null), both from `lib/auth.ts`. Clerk deprecated path-matching checks in the proxy. |
| File parsing | Node (`unpdf`, `jszip`, `mammoth`) | Turns uploaded PDF/PPTX/DOCX into per-page markdown in the server process; the file itself isn't kept (ADR-0003). |
| Prompt generation | Gemini API | Structured JSON output; reads parsed pages, writes Prompts/Answers/Aliases/Tiers/Hints. |
| App database | Tiger Data (Tiger Cloud, Postgres + TimescaleDB) | All app data. Guess history is a hypertable. MLH Tiger Data track. |

See `docs/adr/0002-snowflake-parse-gemini-generate-tiger-store.md` for why the work is split this way, and `docs/adr/0003-parse-uploads-in-node.md` for why parsing moved off Snowflake.

## System diagram

```
                ┌──────────────────────────── Next.js (server) ─────────────────────────────┐
 Browser ──────▶│ proxy.ts (Clerk)                                                          │
  (Clerk)       │                                                                            │
                │  Upload pipeline ──bytes──▶ Node extraction (pdf/pptx/docx) ──▶ pages ───┐ │
                │                                                                          │ │
                │  Game generation ──reads pages──▶ Gemini ──JSON──▶ checks ──▶ tiers ──┐  │ │
                │                                                                        ▼  ▼ │
                │  Run engine ──guess──▶ answer matching (SQL) ──▶ scoring ──▶  Tiger Data   │
                │                                                              (Postgres +   │
                │  Progress (Personal Best, Mastery) ◀──────── queries ─────── hypertable)  │
                └────────────────────────────────────────────────────────────────────────────┘
```

Nothing talks to Gemini during a Run. A Run touches only Tiger Data, so play stays fast and doesn't depend on an AI service being up.

## Feature pipelines (one doc each)

1. [`upload-pipeline.md`](./upload-pipeline.md): file → Node extraction → parsed pages stored in Tiger Data. Runs once per file.
2. [`game-generation-pipeline.md`](./game-generation-pipeline.md): chosen files' pages → Gemini → validation → Tier assignment → Game rows.
3. [`run-and-scoring.md`](./run-and-scoring.md): Run lifecycle, server-authoritative timer, Hints, Staleness, points.
4. [`answer-matching.md`](./answer-matching.md): how a typed guess becomes an Answer (or not).
5. [`data-model.md`](./data-model.md): tables, relationships, hypertable, progress queries.
6. [`ui-map.md`](./ui-map.md): pages and what each one shows. Visual design is planned separately.

## Rules every agent should keep

- **AI only at generation time.** Gemini runs when a Game is created, never during a Run. Hints are pre-generated.
- **Doc-only Answers.** Every Answer must have Evidence (a page in a Source Document). Off-syllabus guesses are not accepted.
- **Rarity is fixed.** It's set at generation and never changes from play (ADR-0001).
- **Games are immutable.** No regeneration and no adding files later. A change means a new Game.
- **The server owns the clock and the score.** The browser never receives Answers or Hints before they're earned or revealed.
- **Everything is private to its Player.** Every page and server action starts with `requirePlayer()`, every route handler with `getApiPlayer()` (`lib/auth.ts`), and every query filters by the returned id.

## Environment variables

How to get each value: `docs/setup/` (Tiger Data, Gemini, Clerk).

```
CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
DATABASE_URL                      # Tiger Cloud connection string (from the service config file)
GEMINI_API_KEY, GEMINI_MODEL
```

## Open questions

- **Deployment target.** Undecided. If it's Vercel, request bodies are capped at 4.5 MB, which is below our 25 MB file limit. Either upload the browser file straight to storage first or lower the limit. Running locally or on a container host has no such cap. Long background work (`after()`) is also bounded by the platform's `maxDuration`.
