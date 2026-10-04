# #32 F19 Landing page and site-wide UI overhaul

Status: in-progress
Branch: feat/32-landing-shell (base `feat/10-design-system`, PR #47; merged `origin/feat/34-social-backend`, PR #45)
Updated: 2026-10-04

## Goal
Site shell (nav, footer, page transitions, Konami easter egg), the signed-out landing page (scroll story from sky to deep ocean) and the signed-in `/home` dashboard. Spec: issue #32, `overnight-decisions.md` §2, §9, §12–14, `docs/design/design-system.md`, `docs/architecture/ui-map.md`, `docs/architecture/social.md`.

## Done so far
- Branch set up; claimed #32.
- Contract fix (commented on #32): `lib/social/types.ts` `AVATARS` aligned with F10's 16 drawn sprites (the PATCH rejected 11 of them). Test `components/site/avatar-ids.test.ts`.

## Next steps
- Shell: `components/site/` (SiteNav, user menu, mobile sheet, footer, Konami fishing), `app/layout.tsx`.
- Landing: `components/landing/` + `app/page.tsx`.
- Home: `app/home/`.
- Checks, FEATURES.md, PR.

## Decisions (made without Anton)
- Signed-in detection uses `getApiPlayer()` (honours `DEV_PLAYER_ID` in dev) instead of Clerk's `<Show>`, so the dev bypass renders the signed-in shell.
