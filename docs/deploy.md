# Deploying SYLLABYSS

This is prep for F12 (#12). Steps marked **needs human** need accounts, secrets or a production database, so an agent can't do them.

## 1. Pick a host

The app is a normal Node Next.js 16 server (`next build` + `next start`). Two parts of it constrain the host:

1. **Uploads are up to 25 MB.** `POST /api/modules/[moduleId]/documents` reads the whole file from a multipart body (`req.formData()`). `next.config.ts` raises `proxyClientMaxBodySize` to 26 MB, because `proxy.ts` (Clerk) buffers request bodies and silently truncates anything over the 10 MB default.
2. **Long background work.** Parsing and Game generation run in `after()` once the response has been sent. Generation is one or two Gemini calls per document and can take a minute or more. Both routes set `maxDuration = 300`.

| | Container host (Railway, Render, Fly.io, a VM) | Vercel |
|---|---|---|
| Upload size | 25 MB works as is | **Request bodies are capped at 4.5 MB** on Vercel Functions, so a 5–25 MB deck fails before the route runs |
| `after()` work | Runs in the long-lived Node process, with no time limit | Runs under `waitUntil`, bounded by the function's `maxDuration` (300 s here; check your plan's limit) |
| Code changes | None | Either lower the limit to 4 MB, or upload straight from the browser to object storage (e.g. Vercel Blob client uploads) and have the route fetch the file from there |
| Setup effort | A Dockerfile or buildpack: `npm ci && npm run build`, start `npm start`, `PORT` from the host | Lowest: connect the repo |
| Crash mid-generation | A restart leaves a Game `generating`. `failStale()` marks it failed after the stale timeout, and the Player makes it again | Same |

### Recommendation

**Use a container host** (Railway or Render, which build a Next.js app from the repo with no Dockerfile, or Fly.io with a small Dockerfile). The 25 MB upload limit and long `after()` generation keep working with **no code changes**, which matters for a demo built around uploading a real lecture deck.

If you have to use Vercel, the smallest safe change is to **lower the upload limit to 4 MB**: `MAX_UPLOAD_BYTES` in `lib/documents/parsed-pages.ts` (the server check, and its test) and the "up to 25 MB" text in `app/modules/_components/FilesPanel.tsx`. Most single-lecture PDFs fit. Direct-to-storage uploads are the proper fix, but too big a change during the hackathon. Either way, keep Fluid Compute on so `after()` gets its 300 s.

### Docker (Render)

The repo has a `Dockerfile` (Node 22, npm 11, `next build` then `next start` on `PORT`, default 3000). On Render: **New → Web Service**, branch `main`, Language **Docker**; no build or start command. Render passes the service's env vars to the build as build args, and the Dockerfile declares only the `NEXT_PUBLIC_*` ones, so set those before the first build. Secrets are read at runtime and never baked into the image. Starter (512 MB) is enough to start: the container idles at about 180 MB.

Test it locally (env values unquoted; `docker run --env-file` keeps quotes literally):

```bash
docker build -t syllabyss --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_... --build-arg NEXT_PUBLIC_SITE_URL=http://localhost:3000 .
docker run -p 3000:3000 --env-file prod.env syllabyss   # CLERK_SECRET_KEY, DATABASE_URL, GEMINI_*
```

Whatever the host, run it in the same cloud region as the Tiger Cloud service, because every page makes several queries.

- [ ] **needs human:** choose the host and create the project.

## 2. Production environment variables

Set these on the host (**needs human**: they're secrets). `NEXT_PUBLIC_*` values are inlined at **build** time, so set them before the first build and rebuild after changing them.

| Variable | Value in production | Notes |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_…` (or `pk_test_…` for a dev instance) | A Clerk **production** instance needs a domain you own plus DNS records. For a hackathon demo the dev instance's keys also work on a deployed URL, with a "development mode" badge and lower limits |
| `CLERK_SECRET_KEY` | `sk_live_…` / `sk_test_…` | |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` | |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` | |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/home` | Optional. Where Clerk lands after sign-in when there's no redirect |
| `DATABASE_URL` | The production Tiger Cloud service, `…?sslmode=require` | Use a **separate** service from `stormhacks-dev` (see §3) |
| `GEMINI_API_KEY` | A key with billing enabled | Free-tier rate limits will stall generation during a demo |
| `GEMINI_MODEL` | `gemini-3.6-flash` | |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.5-flash-lite` | Used when the main model is still 503 after retries |
| `GEMINI_VERIFY` | unset (on) | `off` skips the verification pass: faster and cheaper, but weaker Games |
| `GEMINI_VERIFY_MODEL` | unset | Defaults to the fallback model |
| `NEXT_PUBLIC_SITE_URL` | `https://<your domain>` | The link at the end of the Daily share text. Without it, shares point at `http://localhost:3000` |
| `NODE_ENV` | `production` (hosts set it) | |
| **`DEV_PLAYER_ID`** | **never set** | Dev-only auth bypass. `lib/auth.ts` honours it only when `NODE_ENV === 'development'`, but leave it unset anyway. If set under `next dev` it signs everyone in as that Player |
| `EVAL_DECKS_DIR` | unset | Only for `npm run generate:eval` |

Also in Clerk (**needs human**): add the production URL to the instance's allowed origins / redirect URLs, and turn on the sign-in methods you want (email + Google).

## 3. A fresh production database

Create a new Tiger Cloud service (**needs human**, `docs/setup/tiger-data.md`). It needs the `timescaledb` (preinstalled), `timescaledb_toolkit` (preinstalled on Tiger Cloud; `percentile_agg` in the Daily needs it) and `fuzzystrmatch` (created by the first migration) extensions. Then, from a checkout of the deployed commit, with `DATABASE_URL` pointing at the **production** service:

```bash
npm ci
npm run db:migrate -- --status   # everything pending on a fresh service
npm run db:migrate               # all of db/migrations/*.sql, in name order, one transaction each
npm run db:seed:courses          # the system Player, Python Basics (6 Topics, 30 public Games)
npm run db:seed:daily            # the Daily pool; Daily #1 = 2026-10-04 (Vancouver)
npm run db:seed:courses -- --check && npm run db:seed:daily -- --check   # verify
```

Optional, for the demo account only (after it has signed in once on the deployed site, so the Clerk user exists):

```bash
npm run db:seed -- <demo account's Clerk user id>   # "Graph Algorithms" Module + a ready Game per Mode
npm run social:backfill                              # idempotent; a no-op on a fresh DB
```

Order matters only in that `db:migrate` comes first. The seeds are idempotent and independent of each other.

Migrations are **additive only**. Never edit one that has been applied. Re-running `db:migrate` applies only new files (it records each in `schema_migrations` and takes an advisory lock so two people can't migrate at once).

- [ ] **needs human:** create the service, run the commands above against it.

## 4. The Daily Dive job

The Daily migration registers a TimescaleDB background job:

```sql
SELECT add_job('assign_daily_puzzle', INTERVAL '1 day',
  initial_start => <next Vancouver midnight>, fixed_schedule => true, timezone => 'America/Vancouver');
```

At Vancouver midnight it claims the next unused puzzle from the pool for the new day (`claim_daily_puzzle`, guarded by an advisory lock and `UNIQUE (day)`) and makes that Game public. If the job hasn't run yet when someone opens `/daily`, the app claims the puzzle itself. Nothing needs to run on the app host: no cron, no worker.

Check it on the production service:

```sql
SELECT job_id, proc_name, schedule_interval, next_start FROM timescaledb_information.jobs WHERE proc_name = 'assign_daily_puzzle';
SELECT * FROM timescaledb_information.job_stats WHERE job_id = <id>;           -- last run, success/failure
SELECT day, number FROM daily_puzzles WHERE day IS NOT NULL ORDER BY day DESC LIMIT 3;
```

If the pool is empty, the job logs a `WARNING` ("the Daily pool is empty") and `/daily` shows "no puzzle today".

## 5. Keep the Daily pool full

The pool on `stormhacks-dev` has 15 puzzles (the 12 hand-written ones in `db/seed/daily/pool.json` plus 3 generated), enough until about **2026-10-18**. A fresh production DB only gets the 12 seeded puzzles, which last until about 2026-10-15. Refill before then:

```bash
npm run daily:generate -- --days 14            # Gemini writes + verifies 14 more (≈ $0.04 each)
npm run daily:generate -- --days 14 --dry-run  # preview without writing
```

Each generated puzzle goes through the same checks and verification as a Game. The job uses them in order.

- [ ] **needs human:** run it against production before 2026-10-15 (fresh DB) / 2026-10-18 (dev DB).

## 6. After the first deploy

- [ ] Open `/` signed out: the landing, with today's Daily teaser.
- [ ] Sign up, then open `/home`, `/explore/python-basics`, `/daily`, `/leaderboard` and `/u/<you>`.
- [ ] Upload a small PDF (under 4 MB if on Vercel), generate a Dive Game, and play it.
- [ ] Copy a Daily share and check the link uses `NEXT_PUBLIC_SITE_URL`.
- [ ] `/styleguide` returns 404 in production (by design).
