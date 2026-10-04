# Setup

## Every teammate (5 min)

1. `bash scripts/setup.sh`: GitHub CLI and login, for team coordination.
2. Node 22.18 or newer (`node --version`; the `db:seed` script needs it), then `npm install`
3. Get `.env.local` from whoever set up the services (shared privately, never committed; `.env*` is gitignored).
4. `npm run db:migrate` (once F01 has merged), then `npm run dev`.
5. Optional demo data: `npm run db:seed -- <your Clerk user id>` (Clerk dashboard → Users) gives you a "Graph Algorithms" Module with a ready Game. Re-running it replaces that Module and everything inside it.

## Services (one person each, once for the team)

| Service | Used by | Guide | Env vars |
|---|---|---|---|
| Tiger Data (Postgres + TimescaleDB) | everything (F01+) | [`tiger-data.md`](./tiger-data.md) | `DATABASE_URL` |
| Snowflake (stage + `AI_PARSE_DOCUMENT`) | F03 upload pipeline | [`snowflake.md`](./snowflake.md) | `SNOWFLAKE_*` |
| Gemini API | F04 game generation | below | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| Clerk (auth) | F01 | below | `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |

### Gemini

1. Google AI Studio (https://aistudio.google.com) → **Get API key** → create a key.
2. `GEMINI_API_KEY=…`, plus `GEMINI_MODEL=` set to a current model that supports structured JSON output (pick from the models list in AI Studio).
3. `npm install @google/genai`. Server-only usage is described in `docs/architecture/game-generation-pipeline.md`.

### Clerk

The team shares one Clerk app, "StormHacks 2026" (`app_3KD2aK00S1UcQuDBmQNjW62B79Y`). The code is already wired up by F01: `@clerk/nextjs` v7, `proxy.ts`, `lib/auth.ts`, and `/sign-in` and `/sign-up` pages. Each teammate only needs the keys:

1. Ask the app's owner to invite you to the Clerk app, or get the two keys from them privately.
2. With access: `npm install -g clerk`, `clerk auth login`, then `clerk env pull` in the repo, which writes the keys to `.env.local`. Without access: paste the keys into `.env.local` (names in `.env.example`).
3. Check with `clerk doctor`. Without both keys, every page returns a 500 "Clerk keys are missing" error.
