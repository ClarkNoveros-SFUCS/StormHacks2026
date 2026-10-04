# #34 F21 Social backend: profiles, avatars, XP, streaks, heatmap, badges, friends, leaderboards

Status: done
Branch: feat/34-social-backend (base `chore/overnight-plan`, PR stacked on #43)
Updated: 2026-10-04 10:30 UTC

## Goal
Public Profiles, XP/levels/ocean ranks, streaks, activity heatmap, badges, friends and leaderboards, backend only.
Spec: `docs/worklog/aaf1007/overnight-decisions.md` §6, §8, §12 (Q8, Q11, Q12), §13 (Q17). Write-up: `docs/architecture/social.md`, ADR-0005.

## Done so far
- Migration `db/migrations/20261004T1015_social.sql`, **applied to `stormhacks-dev`** (dry-run in a rolled-back tx first). Contract posted on #34 before applying.
- `lib/social/*` (types, rules, badges, days, username, xp hooks, profile, activity/heatmap, friends, leaderboards, http wrapper).
- 13 API routes under `app/api/{me,profiles,players,friends,leaderboards}`.
- `scripts/social-backfill.mjs` (`npm run social:backfill`), run once: 0 finished Runs in the dev DB at the time, so nothing to award yet.
- Tests: 41 unit tests (`lib/social/*.test.ts`), 12 DB tests (`lib/social/social.db.test.ts`).
- Docs: ADR-0005, `docs/architecture/social.md`, `data-model.md`, `overview.md`, `CONTEXT.md` § Social, FEATURES F21.
- Checks: tsc, lint (0 issues in new files), `npm test` 126 passed, `npm run test:db` 57 passed, `npm run build` ok, dev server on :3300 → all routes 401 signed out, no errors.

## Next steps
- None for F21. Integration is on F20 (call `onRunFinished`), F22 (`games.visibility`, Topic hooks), F23 (Daily hooks), F26/F19 (UI).
- Signed-in smoke of the routes once F10's `DEV_PLAYER_ID` bypass lands (logic is covered by DB tests).

## Decisions & gotchas
- **Level formula:** decisions §6 says `50·n·(n+1)` but lists L2=100, L3=300, L4=600; used the listed values, i.e. Level n starts at `50·(n−1)·n`.
- **XP idempotency:** `unique (player_id, reason, ref)` is impossible on a hypertable (unique indexes must include `at`). Used a per-Player `pg_advisory_xact_lock(727002, hashtext(player_id))` + insert-if-absent, plus `unique (player_id, reason, ref, at)` as a safety net.
- **F20's RunSummary has no run id**, so the hook takes `{ runId, ...summary }`.
- **Public Games** stub: `to_jsonb(g)->>'visibility' = 'public' OR g.player_id = 'system'` (works before and after F22 adds the column).
- **Leaderboard position is `place`**, not `rank` (Rank = ocean title, also in the player summary).
- **Daily board** counting: `counting=first` (first finished Run of the day) since the Daily has one counted attempt; `best` is the default for Course Games.
- **Course leaderboard** counts `topic_passed` XP events (ref `<course>:<n>`), since F22's tables don't exist yet.
- **Badge ids:** `topic-<course>-<n>` (not `topic-<n>`) so several Courses don't collide; `course-<course>`.
- **Pairs Speedrun** = cleared with `stats.timeBonus ≥ 300` (≥ 60 s left over both Boards). **Perfect Leap** = not fallen and `correct === questions`.
- **Heatmap intensity** by day XP: 1 < 40, 2 < 100, 3 < 200, 4 ≥ 200. Weeks Sunday-first (GitHub style); weekly-XP weeks Monday-first (time_bucket's default origin).
- **Streak** reads `xp_events` (run_finished), not `runs`, so deleting a Game doesn't erase streak history.
- Extra XP event `topic_read` (+20) for Q27's "mark as read".
- Reserved usernames include `requests` and `search` (route siblings of `/api/friends/[username]`).
- Real-time aggregates hide uncommitted/unrefreshed rows for already-materialized days: the heatmap DB test commits and refreshes outside a tx (cleans up in afterAll).
- Compression policy on `guess_events` is safe: compression was already enabled in init, TimescaleDB 2.30 supports DML on compressed chunks.

## Files touched
- `db/migrations/20261004T1015_social.sql`, `scripts/social-backfill.mjs`, `package.json` (script)
- `lib/social/*`
- `app/api/me/{summary,profile,heatmap}`, `app/api/profiles/[username]`, `app/api/players/search`, `app/api/friends/**`, `app/api/leaderboards/**`
- `docs/adr/0005-social-layer.md`, `docs/architecture/{social,data-model,overview}.md`, `CONTEXT.md`, `docs/FEATURES.md`
