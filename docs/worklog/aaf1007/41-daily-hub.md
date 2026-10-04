# #41 F28 Daily Dive hub page

Status: done
Branch: feat/41-daily-hub (base feat/39-profile-social-ui; merged origin/feat/36-daily-dive and origin/feat/9-dive-run-ui)
Updated: 2026-10-04 06:10

## Goal
`/daily` hub (today's card, Dive In or your result + share, flip-clock countdown, Daily streak, leaderboard, archive, Lumen), Dive Reveal crowd + daily blocks, the real landing teaser and `/home` Daily card, the live Daily tab on `/leaderboard`. Spec: `docs/architecture/daily-dive.md`, `docs/architecture/ui-map.md` § `/daily`, overnight-decisions §7, Q9, Q23, §14.

## Done so far
- Branch created, merged F23 (#57; only `.env.example` conflicted: kept both blocks) and F09 (#49; clean: the expected ResultList / FEATURES / ui-map conflicts didn't happen).
- `components/daily/`: DawnScene, FlipClock (+ CSS module), ShareButton (+ `copyText` with a clipboard timeout and textarea fallback), TierSquares, `format.ts` (+ 10 tests).
- `app/daily/`: server page (reads `lib/daily` directly; `crowdStats` for your "better than"), DailyHub, TodayCard, DailyBoard (Global/Friends via `/api/daily/leaderboard`), Archive (practice via `runApi.create`), `usePlay`.
- Reveal: `DiveRevealScreen` handles `reveal.daily` / `reveal.crowd`; `DistributionChart` `weights`/`subcaption`; `DiveReveal` `afterHeader`/`actions`/`findRate`; `ResultList` `findRate` ("% found").
- Integrations: landing teaser + `/home` DailyCard on `dailyToday()`; `/leaderboard` Daily tab live via `getDailyPuzzle`.
- Verified: played Daily #1 via the API as Anton (315 pts, −3,150 m, 🟪🟪🟨⬜🟦🟪⬛, counted); `/daily` signed in (counted state, rank #1 of 1, board, archive, flip clock), Reveal (crowd curve, "YOU'RE THE FIRST DIVER TODAY", "% found", Daily block, leaderboard/practice buttons), `/home` (not played + counted), `/leaderboard?tab=daily` (Anton on the podium), signed-out `/` and `/daily` on `next start` (real teaser, Dive In opens Clerk's modal), 375 px via an iframe (no horizontal overflow), no console errors.
- Checks: tsc, lint, `npm test` (238), `npm run build` all pass. No DB changes (no `test:db` needed).

## Next steps
- None. Follow-ups: a "Daily" nav badge when today's is unplayed (F19 owns the nav); the share link uses `NEXT_PUBLIC_SITE_URL` (unset on dev → localhost:3000).

## Decisions & gotchas
- Server pages call `lib/daily/queries` directly (no self-fetch of `/api/daily/*`); landing/home fall back to the sample teaser if `dailyToday` throws.
- Daily Reveal hides Personal Best and Mastery (the crowd replaces them) and renders Evidence as plain text: the fact sheet belongs to the system Module, which a Player can't open.
- "See today's leaderboard" goes to `/daily#leaderboard` (a past day's Reveal: `/daily#archive`); Back goes to `/daily`.
- Crowd curve with 1 player still draws (minValues 1); caption "YOU'RE THE FIRST DIVER TODAY" when you're the only one.
- `findRateLookup` matches by position + canonical text (case-insensitive), single-answer Prompts by position.
- Chrome background tabs leave `navigator.clipboard.writeText` pending; `copyText` races it with a 1.2 s timeout, then tries `execCommand`, else the toast shows the text to copy by hand.
- `next start -H 127.0.0.1` broke with Clerk ("Failed to proxy http://localhost:4401"); `next start -p 4401` and browsing `127.0.0.1:4401` works signed out.
- The counted Daily #1 result is on Anton's account (dev DB's only real player).

## Files touched
- `app/daily/*`, `components/daily/*`
- `components/modes/dive/DiveRevealScreen.tsx`, `DiveReveal.tsx`, `components/results/DistributionChart.tsx`, `ResultList.tsx`
- `app/page.tsx`, `app/home/page.tsx`, `app/home/MainCards.tsx`, `components/landing/daily-teaser.ts`, `components/landing/Sections.tsx`
- `app/leaderboard/page.tsx`, `app/leaderboard/daily.ts`
- `docs/FEATURES.md`, `docs/architecture/ui-map.md`, `docs/design/design-system.md`
