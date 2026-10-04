# #1 F01 Foundation: auth, DB, migrations

Status: done
Branch: feat/1-foundation
Updated: 2026-10-03 19:35

## Goal
Clerk auth, the Postgres client, a migration runner and the initial schema, so every other feature can build on them. Spec: `docs/architecture/overview.md`, `docs/architecture/data-model.md`.

## Done so far
- Clerk v7 installed: `<ClerkProvider>` in `app/layout.tsx`, landing `/` with modal sign-in/up, and a signed-in `/` that redirects to `/modules`
- `proxy.ts` is `clerkMiddleware()` only. Protection is per resource, following Clerk's createRouteMatcher deprecation: `requirePlayer()` in pages and server actions, `getApiPlayer()` in route handlers (`lib/auth.ts`)
- `lib/db.ts`: a shared `postgres` client; SSL comes from `?sslmode=require` in the URL
- `scripts/migrate.mjs`: loads `.env.local`/`.env`, takes an advisory lock, runs one transaction per file, supports `--status`
- `db/migrations/20261003T1830_init.sql`: the full schema, plus FK indexes, the hypertable via `create_hypertable(by_range)` and compression settings
- Tested on local `timescale/timescaledb:latest-pg17` (TimescaleDB 2.30): applies and re-runs as a no-op; tested CHECKs, cascades, the used-file guard and the Mastery query
- `npm run build`, `typecheck` and `lint` pass
- Review agent pass done. No bugs found; the fixes for its findings are below:
  - Added `getApiPlayer()` for route handlers (401 when null). Clerk's `auth.protect()` redirects route handlers too.
  - Dropped the per-process `knownPlayers` cache: it went stale if the shared DB was reset.
  - Added the missing FK indexes.
  - `--status` is now read-only: no lock, and it doesn't create `schema_migrations`.
  - Fixed tiger-data.md, and documented "no BEGIN/COMMIT in migration files".
- Docs updated: data-model.md, overview.md, ui-map.md, setup/README.md and FEATURES.md (F01 section)

- Clerk linked via `clerk init --app app_3KD2aK00S1UcQuDBmQNjW62B79Y`: added `/sign-in` and `/sign-up` pages, the `/__clerk` matcher and a UserButton header. `clerk doctor` passes.
- Tiger Cloud service `stormhacks-dev` (us-west-2, 1 CPU / 4 GiB, Development, no pooler) created; init migration applied. Verified the hypertable, extensions and all 13 tables.

- Manual auth test passed: Anton signed up, landed on `/modules`, and a `players` row exists on Tiger Cloud. Anton approved the work; PR #13 marked ready.

## Next steps
1. Human: share `DATABASE_URL` with the team privately and tick that F01 box. Consider resetting the Tiger password, since it was pasted into an agent chat.
2. Next feature in the Platform lane: F02 seed data (#2).

## Decisions & gotchas
- `RESTRICT` (and even `NO ACTION`) on `game_sources.source_document_id` refuses deleting a Module or Player mid-cascade. Fixed by making the four cross-branch FKs `DEFERRABLE INITIALLY DEFERRED`.
- Multi-statement migration files need the simple protocol: `tx.unsafe(body).simple()`.
- Clerk keyless mode doesn't kick in automatically: with no keys, every page returns a 500.

## Files touched
- proxy.ts, lib/db.ts, lib/auth.ts, app/layout.tsx, app/page.tsx, app/modules/page.tsx
- scripts/migrate.mjs, db/migrations/20261003T1830_init.sql, .env.example, .gitignore, package.json
- docs/FEATURES.md, docs/architecture/{data-model,overview,ui-map}.md, docs/setup/README.md
