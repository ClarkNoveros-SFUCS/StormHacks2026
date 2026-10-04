# SYLLABYSS

**Turn your notes into games. Rarer answers sink deeper.**

SYLLABYSS (StormHacks 2026) turns your own course files into study games. Upload your slides, notes or readings into a **Module**, pick some files, and Gemini builds a **Game** from them. Each answer comes from your files and links back to the page it came from. Obvious answers score a little. The rare ones buried deep in your notes score a lot, and your diver sinks further for each one.

> **Teammates, first time here?** Run `bash scripts/setup.sh` once, then start your agent as usual. Service setup: `docs/setup/` · How we work together: `docs/agents/coordination.md` · What's built: `docs/FEATURES.md` · Vocabulary: `CONTEXT.md` · Deploying: `docs/deploy.md` · Demo: `docs/demo-script.md`

<!-- Screenshots: replace each placeholder with a PNG in docs/img/ before submitting. -->
| | |
|---|---|
| ![Landing page: pixel sky turning into ocean](docs/img/landing.png) *Landing* | ![A Dive Run mid-descent](docs/img/dive-run.png) *Dive: the descent* |
| ![The Daily Dive hub with the flip-clock countdown](docs/img/daily.png) *Daily Dive* | ![A Python Basics Topic with its practice Games](docs/img/explore-topic.png) *Explore: Python Basics* |
| ![Profile card and activity heatmap](docs/img/profile.png) *Profile and heatmap* | ![Leap Run: hopping up sky islands](docs/img/leap.png) *Leap* |

## What you can do

- **Sonar, your study buddy.** A pixel dolphin that knows where you stand in Python Basics. It turns every guess you've made into a mastery score per Concept, finds the root cause behind your misses (often a Topic you already "passed"), and tells you which Game to play next, with a Start button. Ask it why you keep missing loops and it quotes your own wrong answers and the reading.
- **Six Game Modes from the same notes**
  - **Dive** (the original, Krillion-style): 7 timed Prompts, 25 s each. Type any correct answer. Rarer answers score more, and the diver sinks past the Shallows, Reef, Abyss and Trench, with a catch screen for each find.
  - **Apogee**: Dive's rules, but you launch a rocket and measure your score in km, from the Troposphere to Deep Space.
  - **Leap**: 10 multiple-choice questions, 15 s each, 3 hearts. Climb sky islands, build streak multipliers, and use one 50/50 per Run.
  - **Pairs**: match terms to definitions on 2 boards of 6, against the clock.
  - **Blitz**: 60 seconds of rapid true/false on a neon grid, with combos.
  - **Arena**: a three.js first-person room. The question floats on a board, four answer targets drift in front of you, and you shoot the right one (pointer lock + WASD, tap to aim on mobile).
- **Evidence everywhere.** Each Answer cites a page of your file, and the Reveal links into a file viewer that shows the parsed text page by page.
- **Explore + Python Basics.** A public, hand-written beginner course with 6 Topics. Each Topic has a reading, resources and a practice Game in every Mode. Pass any one of them to unlock the next Topic (+150 XP and a Topic Badge).
- **Daily Dive.** One shared puzzle per day, published at Vancouver midnight. Your first attempt counts. You get a share grid of tier squares, today's score distribution, "% of players found this" on every answer, and a daily leaderboard.
- **Social.** XP, levels and ocean ranks (Plankton → Leviathan), day streaks, Badges, a 52-week activity heatmap, pixel avatars, friends, and Global/Friends leaderboards (Daily, Weekly XP, Course).
- **A living site.** Pixel sky-and-ocean backdrops, Lumen the anglerfish mascot, tilt cards, odometers, confetti, and synthesized WebAudio sounds (mutable). Reduced motion is respected.

## How Sonar works

![Sonar pipeline: guesses → learner model (deterministic) → Sonar agent (LLM) → buddy, bubbles and /sonar map → a new Run](docs/img/sonar-pipeline.png)

Two halves: deterministic code decides **what is true**, and an LLM decides **how to say it**. Full spec: [`docs/architecture/sonar.md`](docs/architecture/sonar.md).

- **The learner model** replays your `guess_events` on Python Basics. Each Prompt is tagged with 1–3 of 22 Concepts (tagged once, offline), and each guess updates a Bayesian Knowledge Tracing score per Concept.
- **The Mode sets the guess rate.** A right answer in Blitz (true/false) is a coin flip, so it counts for little (guess rate 0.5). A four-option Leap or Arena question is 0.25, and a typed Dive answer is 0.05, so it counts for a lot.
- **Noisy-AND blame.** A Prompt about two Concepts is only answered right if you know both. When you miss it, the weaker Concept takes more of the blame.
- **Root cause.** If a weak prerequisite holds at least 40% of the blame on your last 10 misses, that's the root cause: "your for-loop misses come from `range()`". Mastery also fades over time (it halves every 72 hours unseen).
- **The agent loop.** A LangGraph graph: `observe` (no LLM) loads the model, the page you're on and your recent mistakes; then the LLM coach replies, calling tools (`get_concept`, `get_mistakes`, `read_topic`, `read_source_page`, `recommend`, `propose_game`) until it's done.
- **Guardrails.** Every number comes from the model, never from the LLM. Sonar recommends the planner's top 3, or its own pick only if the server confirms you can play it (no locked Topics). A new Game it proposes waits for you to confirm. And no AI runs during a Run: the buddy hides while you play.

**Try it:** [`docs/sonar-use-cases.md`](docs/sonar-use-cases.md) has what Sonar can do, how the feedback loop works, and 10 use cases to test step by step (where you stand, root cause, "why am I getting this wrong?", closing the loop with a Run, Module pages, guardrails).

## Stack

| Concern | Choice |
|---|---|
| App | Next.js 16 (App Router, `proxy.ts`), React 19, Tailwind 4, three.js (Apogee, Leap, Arena) |
| Auth | Clerk (the Clerk user id is the Player id) |
| Database | Tiger Data: Tiger Cloud Postgres + TimescaleDB (+ toolkit, fuzzystrmatch) |
| AI | Gemini API (`@google/genai`), structured JSON output |
| Sonar agent | LangGraph JS (`@langchain/langgraph`) + Claude Sonnet 5.5 (Gemini fallback), optional LangSmith tracing |
| File parsing | Node: `unpdf` (PDF), `jszip` (PPTX), `mammoth` (DOCX). Files are parsed in-process and not stored (ADR-0003) |
| Tests | Vitest (unit, plus DB tests against a real Tiger service) |

Architecture: `docs/architecture/overview.md`. Every pipeline has its own doc in `docs/architecture/`.

## Sponsor tracks used

### Tiger Data (MLH Tiger Data track)
All app data is in one Tiger Cloud service, and the time-series features do real work:
- **Hypertables:** `guess_events` (every guess in every Run), `xp_events` (the XP ledger), `daily_results` and `daily_answer_finds` (the Daily Dive).
- **Real-time continuous aggregates** (`materialized_only = false`, refreshed by policies): `player_game_daily` (accuracy per day on the Game page), `player_activity_daily` (the profile heatmap, read with `time_bucket_gapfill` so empty days come back as 0), `player_xp_weekly` (the Weekly XP leaderboard), `daily_score_stats` and `daily_answer_rates` (today's Daily distribution and per-answer find rates).
- **TimescaleDB job via `add_job`:** `assign_daily_puzzle` runs at Vancouver midnight (`fixed_schedule`, `timezone => 'America/Vancouver'`) and publishes the day's puzzle. A race-safe lazy claim covers the case where the job hasn't run yet.
- **Toolkit hyperfunctions:** `percentile_agg` in the Daily aggregate, read with `approx_percentile` / `approx_percentile_rank` for the median and "better than X% of today's players".
- **Compression policy:** `guess_events` chunks older than 30 days are compressed.
- **Sonar's learner model** replays the `guess_events` hypertable (plus timeouts) to compute each Player's mastery per Concept on read.
- Answer matching also runs in SQL, with `fuzzystrmatch` (`levenshtein_less_equal`) for typo tolerance.

### Gemini (Google)
- **Generation:** one structured-output call per source document builds the Game in the chosen Mode (Prompts, Answers with aliases and Evidence quotes, Tiers, Hints). If the main model is overloaded it falls back to a lighter one.
- **Verification:** a second, cheap call per document drops Answers that their page doesn't support, plus unclear Prompts and duplicates (F16, on by default).
- **Daily pool:** `npm run daily:generate` writes and verifies new Daily puzzles.
- Gemini is never called during a Run. Play only touches the database.

### Clerk
Sign-in and sign-up (Clerk's hosted components at `/sign-in` and `/sign-up`), `clerkMiddleware()` in `proxy.ts`, and the Player id used everywhere. The profile can show your Clerk photo instead of a pixel avatar.

## Run it locally

Needs **Node 22.18+** (the seed scripts run `.mts` files directly).

```bash
npm install
cp .env.example .env.local      # then fill it in (below)
npm run db:migrate              # applies db/migrations/*.sql in order
npm run db:seed -- <clerkUserId>   # demo "Graph Algorithms" Module with a ready Game in every Mode
npm run db:seed:courses         # the Python Basics course (idempotent)
npm run db:seed:daily           # the Daily Dive puzzle pool (idempotent)
npm run social:backfill         # XP for Runs finished before the XP ledger existed (idempotent)
npm run dev                     # http://localhost:3000
```

Your Clerk user id is in the Clerk dashboard → Users (it looks like `user_…`). Sign in once first so the id exists.

### Environment variables (`.env.local`)

| Variable | Required | What it is |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | yes | Clerk keys (`clerk env pull`, or the dashboard → API keys). Without them every page is a 500. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | yes | `/sign-in`, `/sign-up` |
| `DATABASE_URL` | yes | Tiger Cloud connection string (`docs/setup/tiger-data.md`) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | yes | Gemini key and model (`gemini-3.6-flash`) |
| `GEMINI_FALLBACK_MODEL` | no | Used when the main model is overloaded (`gemini-3.5-flash-lite`) |
| `GEMINI_VERIFY`, `GEMINI_VERIFY_MODEL` | no | `GEMINI_VERIFY=off` skips the verification pass. Its model defaults to the fallback model |
| `NEXT_PUBLIC_SITE_URL` | no locally | The public URL in Daily share text (falls back to `http://localhost:3000`) |
| `DEV_PLAYER_ID` | no | **Dev only:** under `next dev`, treats every request as this Clerk user id. Ignored in production builds. Never set it on a deployed environment |
| `ANTHROPIC_API_KEY` | for Claude | Sonar's coach is Claude Sonnet 5.5. Without this key, Sonar uses Gemini |
| `SONAR_MODEL` | no | The coach model. Default `claude-sonnet-5-5`; `anthropic/…` goes through the LangSmith LLM Gateway with `LANGSMITH_API_KEY` (beta); any other name is a Gemini model. Gemini is always the fallback |
| `LANGSMITH_API_KEY`, `LANGSMITH_TRACING`, `LANGSMITH_PROJECT` | no | LangSmith tracing of every Sonar turn (`observe → coach → tools`) |
| `EVAL_DECKS_DIR` | no | Folder of eval decks for `npm run generate:eval` |

### Useful commands

| Command | What it does |
|---|---|
| `npm test` / `npm run test:db` | Unit tests / DB tests (DB tests need `DATABASE_URL`) |
| `npx tsc --noEmit`, `npm run lint`, `npm run build` | Typecheck, lint, production build |
| `npm run generate:check -- --seed --mode leap` | One Gemini generation on the seed deck (about $0.05) |
| `npm run daily:generate -- --days 14` | Add 14 Daily puzzles to the pool with Gemini |
| `npm run db:migrate -- --status` | Show applied and pending migrations |
| `npm run sonar:demo` | Seed the Sonar demo history (Python Basics guesses) for the demo account. **Deletes** that Player's Python Basics Runs first |
| `npm run sonar:tag` | Re-tag Python Basics Prompts with Concepts (Gemini), after the course content changes |

## How we built it with parallel agents

Several of us built this at once, each with our own AI coding agent. The agents never talk directly. They coordinate through shared state in GitHub and the repo:

- **GitHub Issues are the claim board.** An issue labelled `in-progress` with an assignee means "someone is building this". An agent that finds its feature already claimed stops instead of duplicating it. Cross-agent messages (a schema or API change) are comments on the issue, posted before the change merges.
- **`scripts/agent-sync.sh` runs at the start of every session** (a Claude Code `SessionStart` hook). It reports what merged into `main`, the feature board, who claimed what, open PRs, and your own unfinished work.
- **`docs/FEATURES.md` is the board of what's built**, with entry points and notes for the next person. It's updated in the same PR as the feature.
- **`docs/worklog/<github-login>/` holds resumable notes**, one folder per person so they never conflict. Any agent on any machine can pick up where the last one stopped.
- **Humans stay in the loop.** By default agents hand work over for review before opening a PR, never merge, and never add AI attribution.

Walkthrough with a diagram: [`docs/multi-agent-workflow.md`](docs/multi-agent-workflow.md). The exact rules agents follow: [`docs/agents/coordination.md`](docs/agents/coordination.md).

## Deploying

See [`docs/deploy.md`](docs/deploy.md): which host to use, the upload body-size limit, every production env var, migration and seed order for a fresh database, the Daily job, and keeping the Daily pool full.

## Team

Built at StormHacks 2026. Credits: Tiger Data, Google Gemini, Clerk.
