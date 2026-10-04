# #41 F28 Daily Dive hub page

Status: in-progress
Branch: feat/41-daily-hub (base feat/39-profile-social-ui; merged origin/feat/36-daily-dive and origin/feat/9-dive-run-ui)
Updated: 2026-10-04 05:45

## Goal
`/daily` hub (today's card, Dive In or your result + share, flip-clock countdown, Daily streak, leaderboard, archive, Lumen), Dive Reveal crowd + daily blocks, the real landing teaser and `/home` Daily card, the live Daily tab on `/leaderboard`. Spec: `docs/architecture/daily-dive.md`, overnight-decisions §7, Q9, Q23, §14.

## Done so far
- Branch created, merged F23 (#57; only `.env.example` conflicted: kept both blocks) and F09 (#49; clean).

## Next steps
1. `components/daily/` (ShareButton, TierSquares, FlipClock, DawnScene) and `app/daily/**`.
2. Reveal: crowd distribution + find rates + daily block.
3. Landing/home/leaderboard integrations. Checks, docs, PR.

## Decisions & gotchas
- Server pages call `lib/daily/queries` directly (no self-fetch of `/api/daily/*`).

## Files touched
- (see git log)
