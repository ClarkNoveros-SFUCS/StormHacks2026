# Setup

## Every teammate (5 min)

1. `bash scripts/setup.sh`: GitHub CLI and login, for team coordination.
2. `npm install`
3. Get `.env.local` from whoever set up the services (shared privately, never committed; `.env*` is gitignored).
4. `npm run db:migrate` (once F01 has merged), then `npm run dev`.

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

1. https://dashboard.clerk.com → **Create application** (enable Email and Google sign-in).
2. Copy the two keys from **API keys** into `.env.local`.
3. `npm install @clerk/nextjs`. Next 16 uses `proxy.ts` instead of `middleware.ts`; read `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` and Clerk's Next.js quickstart, and use whichever file name the installed Clerk version documents for Next 16.
