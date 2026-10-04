# #39 F26 Profile, Friends and Leaderboard pages

Status: in-progress
Branch: feat/39-profile-social-ui (base `feat/32-landing-shell` = F19 PR #51, plus merged `feat/35-courses-backend` = F22 PR #48)
Updated: 2026-10-04 04:30

## Goal
The social pages on top of F21's API: `/profile` → `/u/[me]`, `/u/[username]` (banner, avatar, heatmap, bests, badges, friend button, edit dialog), `/friends` (friends, requests, search), `/leaderboard` (Daily, Weekly XP, Courses; Global/Friends). Spec: `docs/architecture/social.md`, decisions §6, §12 (Q8, Q11, Q12), §13 (Q17), §14.

## Done so far
- Branch set up; merged F22 (conflicts in `docs/FEATURES.md` board rows and `docs/architecture/ui-map.md` resolved by keeping both sides).

## Next steps
1. `components/social/` shared bits (banner, friend button, badge icon map, empty state).
2. `/u/[username]` + `/profile`, then `/friends`, then `/leaderboard`.
3. Dev server on port 4300 with test players `dev_test_*`; checks; FEATURES.md; PR.

## Decisions & gotchas
- F21 badge `icon` ids (anchor, moon, trench, …) aren't PixelIcon names: mapped in `components/social/badge-icons.ts`.
- Username availability in the edit dialog uses `usernameProblem()` (client-safe) plus `GET /api/players/search?q=` exact match, so no new API route.
- Daily Dive board waits on F23: adapter in `app/leaderboard/daily.ts` (TODO), shows "arrives soon".

## Files touched
- docs/FEATURES.md, docs/architecture/ui-map.md (merge only so far)
