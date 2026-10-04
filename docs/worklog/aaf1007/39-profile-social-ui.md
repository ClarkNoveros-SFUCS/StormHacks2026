# #39 F26 Profile, Friends and Leaderboard pages

Status: done
Branch: feat/39-profile-social-ui (base `feat/32-landing-shell` = F19 PR #51, plus merged `feat/35-courses-backend` = F22 PR #48)
Updated: 2026-10-04 05:45

## Goal
The social pages on top of F21's API: `/profile` → `/u/[me]`, `/u/[username]` (banner, avatar, heatmap, bests, badges, friend button, edit dialog), `/friends` (friends, requests, search), `/leaderboard` (Daily, Weekly XP, Courses; Global/Friends). Spec: `docs/architecture/social.md`, decisions §6, §12 (Q8, Q11, Q12), §13 (Q17), §14.

## Done so far
- Merged F22 into the F19 base (conflicts in `docs/FEATURES.md` board rows and `docs/architecture/ui-map.md`, kept both sides); fixed `components/results/ResultList.tsx` `KIND_LABEL` for the new Prompt kinds so the merge typechecks.
- `components/social/`: banners (ocean/space/sky SVG scenes, CSS-animated), heatmap, badge grid + medallion + glyphs, friend button, stats card, rank emblem, Lumen empty state, backdrop, API client, format helpers (+ tests).
- `/profile`, `/u/[username]` (+ not-found), `/friends`, `/leaderboard` (Daily adapter waiting on F23).
- Checked under `next dev` on port 4300 with 5 committed `dev_test_*` players (runs, XP, Topic passes, badges, friendships), then deleted them all (players, runs, xp_events, badges, topic_progress, friendships) and refreshed both aggregates. Headless Chrome at 375 px: no horizontal overflow, no console errors on every page/tab. Desktop checked in Chrome. PATCH /api/me/profile verified and reverted on Anton's row.
- tsc, lint, test (209), build all pass.

## Next steps
- None for F26. F23: set `daily.gameId` in `app/leaderboard/page.tsx`.

## Decisions & gotchas
- F21 badge `icon` ids (anchor, moon, trench, …) aren't PixelIcon names: drawn in `components/social/BadgeGlyph.tsx`.
- Profile sidebar uses `StatsCard` (same 2×2 as F10's ProfileCard plus the Level bar) instead of ProfileCard itself, whose avatar and View profile button would repeat the header.
- Username availability in the edit dialog: `usernameProblem()` + exact match from `GET /api/players/search`; no new route.
- Banner ids `ocean|space|sky`; null derives one from the username (stable hash). F21's column already accepts them; no migration.
- Recent activity reads `xp_events` and names a Game only if `games.visibility = 'public'`.
- Daily tab: "arrives soon" until F23; adapter in `app/leaderboard/daily.ts`.
- `react-hooks/purity` forbids `Date.now()` in components: server clock comes from `serverNow()` / data functions.
- The shared Chrome window was flaky (other agents' tabs, "Cannot access a chrome-extension:// URL"), so the 375 px pass used headless Chrome over CDP (scratch script, not committed).

## Files touched
- app/profile/page.tsx, app/u/[username]/*, app/friends/*, app/leaderboard/*
- components/social/*
- components/results/ResultList.tsx (integration fix)
- docs/FEATURES.md (F26 row + section), docs/architecture/ui-map.md (F26 section; merge resolution)
