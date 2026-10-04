# #69 Bug: Sign out doesn't update the nav

Status: done
Branch: fix/69-sign-out-nav
Updated: 2026-10-04 08:30

## Goal
Clicking Sign out should leave the user on the landing page with the signed-out nav, without a hard reload.

## Done so far
- Cause: `SiteNav` (components/site/SiteNav.tsx) seeds `useState(initial)` from the root layout's server nav state and never re-syncs. Clerk's `signOut({ redirectUrl: "/" })` pushes `/` and calls `router.refresh()`, which re-renders the layout with `{ signedIn: false }`, but the client state kept the old signed-in value. Same in reverse after sign-in.
- Fix: `app/layout.tsx` keys `<SiteNav>` on signed-in/out, so an auth change remounts it with the new `initial`.
- `npx tsc --noEmit` and eslint are clean.

## Next steps
1. (Approved by the user.) Manual check in the browser: sign out from the avatar menu and from the mobile sheet. The header should switch to Sign in / Start playing right away. Then sign in and check that it switches back.

## Decisions & gotchas
- Keyed on signed-in/out only, not the Player: `NavPlayer` has no id, and switching accounts goes through sign-out anyway.
- XP/streak updates between routes still come from SiteNav's `/api/me/summary` fetch. Only auth changes remount the nav.

## Files touched
- app/layout.tsx
