# #32 F19 Landing page and site-wide UI overhaul

Status: done
Branch: feat/32-landing-shell (base `feat/10-design-system`, PR #47; merged `origin/feat/34-social-backend`, PR #45)
Updated: 2026-10-04

## Goal
Site shell (nav, footer, page transitions, Konami easter egg), the signed-out landing page (scroll story from sky to deep ocean) and the signed-in `/home` dashboard. Spec: issue #32, `overnight-decisions.md` §2, §9, §12–14, `docs/design/design-system.md`, `docs/architecture/ui-map.md`, `docs/architecture/social.md`.

## Done
- Contract fix (commented on #32): `lib/social/types.ts` `AVATARS` aligned with F10's 16 drawn sprites (the PATCH rejected 11 of them). Test `components/site/avatar-ids.test.ts`.
- Shell (`components/site/`, `app/layout.tsx`): sticky nav (links, streak, level chip with XP bar popover, mute, avatar menu with Profile/Friends/My Modules/Sign out; signed-out Sign in + "Start playing"), mobile bottom sheet, `RouteTransition`, footer with pixel seabed, `KonamiFishing` mini-game, skip link. Hidden on `/runs/*`.
- Landing (`app/page.tsx`, `components/landing/`): `LandingWorld` canvas (sky by local time, boat, waterline, zones, creatures incl. whale/anglers/squid, bioluminescence, seabed with kelp/chest/vent, marine snow, cursor lantern in the deep, depth gauge ≥ 1400 px), Hero with parallax and Lumen, sections that surface with bubbles (`Surface`), 7 sections per §9. `getDailyTeaser()` stub (TODO F23).
- Home (`app/home/`): greeting with Lumen bubble, Jump back in (live Mode mini-scene, Mastery, PB, Resume/Play), Continue progress (Daily card with countdown, course card behind `coursesAvailable()`, recent Games), sidebar ProfileCard + avatar picker (PATCH verified), XP bar, weekly XP board (friends → global fallback), friends panel.
- Fixes found while verifying: fixed layers portalled to `<body>` (header `backdrop-filter` trapped the mobile sheet; canvas needed a state ref because the portal mounts after the first effect); `unstable_rethrow` in `getNavState()` so Next's dynamic-usage signal isn't swallowed.

## Checks
- `npx tsc --noEmit`, `npm run lint`, `npm test` (164 passed), `npm run build`: pass.
- Browser: `/home` (dev bypass) desktop + 375 px iframe, mobile sheet, avatar save (restored to anglerfish), user menu + Escape, Konami game; `/` signed out via the production build on `127.0.0.1:3500` (Clerk cookie is per-host), desktop + 375 px: no horizontal overflow, no console errors (only Clerk's dev-keys warning). The Chrome tab reported `visibilityState: hidden`, so animation screenshots past the hero were unreliable; checked by DOM instead.

## Decisions (made without Anton)
- Signed-in detection uses `getApiPlayer()` (honours `DEV_PLAYER_ID` in dev) instead of Clerk's `<Show>`, so the dev bypass renders the signed-in shell.
- Streak flame in the nav links to `/daily`; level chip links to the profile.
- Landing camera moves at 0.6× scroll; the gauge reads 0 → 6,000 m (eased) with ocean zone names; sky tint by local hour.
- Daily teaser shows a sample CS prompt (launch day is CS-themed) with example Answers, only while it's a sample.
- Home "Play" goes to `/games/[id]` (F11), "Resume run" to `/runs/[id]` when a Run is in progress.
- Friends activity: no feed exists in F21, so the panel lists friends + pending requests with a "coming soon" line.
