# #12 Deploy and demo prep (prep only)

Status: in-progress (prep merged via #68; now deploying to Render)
Branch: feat/12-dockerfile (from main)
Updated: 2026-10-04

## Goal
Get everything ready to deploy and demo without creating accounts, setting production secrets or deploying (overnight brief). Spec: `docs/architecture/overview.md` § Open questions, issue #12.

## Done so far
- `README.md` rewritten: what SYLLABYSS is (six Modes, Explore + Python Basics, Daily Dive, social), screenshot placeholders (`docs/img/*.png`, not created), stack, sponsor tracks (Tiger Data: hypertables, real-time continuous aggregates, the `add_job` Daily job, toolkit percentiles, compression policy, fuzzystrmatch; Gemini: generation + verification + Daily pool; Clerk), run locally (env table, migrate + seed commands), useful commands. The teammate setup pointer is kept at the top.
- `docs/deploy.md`: Vercel vs. container host (4.5 MB body cap, `after()`/`maxDuration`), recommendation (container host; Vercel fallback = 4 MB limit in `MAX_UPLOAD_BYTES` + FilesPanel text), every production env var (incl. `NEXT_PUBLIC_SITE_URL`, `GEMINI_FALLBACK_MODEL`, `GEMINI_VERIFY`, `DEV_PLAYER_ID` never set), Clerk production notes, fresh-DB migrate + seed order, the `assign_daily_puzzle` job and SQL to check it, refilling the Daily pool, a post-deploy checklist.
- `docs/demo-script.md`: a 3–4 minute path (landing → Daily → Topic 1 Leap pass → profile/leaderboard → upload + generate → Dive descent), with what to say, answer cheat sheets (Topic 1 Leap, Daily #1, the seeded Graph Algorithms Dive Game), and fallbacks (seeded or pre-generated Games when Gemini is slow).
- `docs/FEATURES.md` F12: README ticked. The other three items are "prep done, needs human". Board Status stays `planned`.

## Dockerfile (feat/12-dockerfile)
- `Dockerfile` + `.dockerignore`: three stages (deps, build, run), `node:22-slim`, runs as `node`. Only `NEXT_PUBLIC_*` are build args (Render injects env vars as build args); secrets stay runtime-only.
- Gotcha: `npm ci` with the image's npm 10 fails ("Missing: @emnapi/runtime@1.11.3 from lock file"): the lockfile is written by npm 11, which leaves out some optional wasm deps that npm 10 wants. Fix: the image installs npm 11.6.2 first. Regenerating the lockfile didn't help.
- Verified locally: image builds (1.36 GB), `/`, `/explore`, `/explore/python-basics`, `/daily`, `/sign-in` return 200, `/home` 307 (signed out), `/styleguide` 404; ~180 MB RAM idle.
- Host chosen by the user: Render (Starter $7), domain `syllabyss.tech` (.Tech prize track).

## Next steps (needs human)
1. Pick the host (recommended: Railway/Render/Fly.io) and create the project.
2. Create the production Tiger Cloud service; set env vars per `docs/deploy.md` §2; run §3.
3. Create the demo account, seed it, pre-generate a Game from the demo deck, rehearse `docs/demo-script.md` twice.
4. Take the six README screenshots into `docs/img/`.
5. Run `npm run daily:generate -- --days 14` against production before ~2026-10-15.

## Decisions & gotchas
- PR says "Part of #12", not "Closes #12", because deployment is left for a human.
- The docs describe the app as it is on `overnight/demo` (all feature PRs merged). This branch's base (`chore/overnight-plan`) doesn't have the code yet, so file paths in `docs/deploy.md` (e.g. `lib/documents/parsed-pages.ts`) exist only once those PRs merge.
- The "Unlock the next Topic ▶" link on the Topic-pass banner is an `overnight/demo` integration fix (see `overnight-demo.md`). The demo script says so.
- No code changed.

## Files touched
- README.md, docs/deploy.md, docs/demo-script.md, docs/FEATURES.md (F12 section only), this worklog
