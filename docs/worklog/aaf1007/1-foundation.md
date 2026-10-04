# #1 F01 Foundation: auth, DB, migrations

Status: in-progress
Branch: feat/1-foundation
Updated: 2026-10-03 19:10

## Goal
Clerk auth, the Postgres client, a migration runner and the initial schema, so every other feature can build on them. Spec: `docs/architecture/overview.md`, `docs/architecture/data-model.md`.

## Done so far
- Clerk v7 installed: `<ClerkProvider>` in `app/layout.tsx`, landing `/` with modal sign-in/up, and a signed-in `/` that redirects to `/modules`
- `proxy.ts` is `clerkMiddleware()` only. Protection lives in `requirePlayer()` (`lib/auth.ts`), following Clerk's createRouteMatcher deprecation
- `lib/db.ts`: a shared `postgres` client; SSL comes from `?sslmode=require` in the URL
- `scripts/migrate.mjs`: loads `.env.local`/`.env`, takes an advisory lock, runs one transaction per file, supports `--status`
- `db/migrations/20261003T1830_init.sql`: the full schema, plus FK indexes, the hypertable via `create_hypertable(by_range)` and compression settings
- Tested on local `timescale/timescaledb:latest-pg17` (TimescaleDB 2.30): applies and re-runs as a no-op; tested CHECKs, cascades, the used-file guard and the Mastery query
- `npm run build`, `typecheck` and `lint` pass
- Docs updated: data-model.md, overview.md, ui-map.md, setup/README.md and FEATURES.md (F01 section)

## Next steps
1. Human: create the Tiger Cloud service (`docs/setup/tiger-data.md`), put `DATABASE_URL` in `.env.local`, run `npm run db:migrate`, then check `select hypertable_name from timescaledb_information.hypertables;` returns `guess_events`. Tick the two Tiger boxes in FEATURES.md.
2. Human: create a Clerk dev app and add both keys to `.env.local`. Then in `npm run dev`: `/` shows Sign in; signing in lands on `/modules` showing the Player id, and a `players` row exists.
3. Set FEATURES.md F01 Status to `done`, set this worklog to `Status: done`, mark the PR ready, and merge.

## Decisions & gotchas
- `RESTRICT` (and even `NO ACTION`) on `game_sources.source_document_id` refuses deleting a Module or Player mid-cascade. Fixed by making the four cross-branch FKs `DEFERRABLE INITIALLY DEFERRED`.
- Multi-statement migration files need the simple protocol: `tx.unsafe(body).simple()`.
- Clerk keyless mode doesn't kick in automatically: with no keys, every page returns a 500.

## Files touched
- proxy.ts, lib/db.ts, lib/auth.ts, app/layout.tsx, app/page.tsx, app/modules/page.tsx
- scripts/migrate.mjs, db/migrations/20261003T1830_init.sql, .env.example, .gitignore, package.json
- docs/FEATURES.md, docs/architecture/{data-model,overview,ui-map}.md, docs/setup/README.md
