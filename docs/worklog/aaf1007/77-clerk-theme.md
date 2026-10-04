# #77 F34 Clerk sign-in and sign-up match the site style

Status: done
Branch: feat/77-clerk-theme
Updated: 2026-10-04

## Goal
Clerk's SignIn/SignUp (page and modal) used Clerk's default dark look. Make them match the SYLLABYSS site style.

## Done
- `lib/ui/clerk-appearance.ts`: variables (hex copies of the :root palette, Mulish body, Pixelify buttons) and `elements` mapped to `.px-btn` / `.px-frame`; passed to `ClerkProvider` in `app/layout.tsx`.
- `app/globals.css`: `@layer theme, base, clerk, components, utilities;` before the Tailwind import (Clerk's CSS goes in the `clerk` layer via `cssLayerName`), and `.cl-*` rules: yellow primary button, secondary social buttons, card frame with drop, input border/focus.
- Verified in a production build on 127.0.0.1:3100 (signed out): `/sign-in` page and the nav modal. tsc, lint, 417 unit tests pass.

## Decisions & gotchas
- Checked with `next start`, not `next dev`: dev blocks 127.0.0.1 as a cross-origin dev resource, and localhost had the user's signed-in session.
- `lib/daily/daily.test.ts` "reads NEXT_PUBLIC_SITE_URL" fails when `.env.local` sets `NEXT_PUBLIC_SITE_URL` (it does on aaf1007's machine now). Not from this change; run tests with it unset.
- The heading "Sign in to StormHacks 2026" is the Clerk application name (dashboard), not code.

## Next steps (needs human)
1. Clerk dashboard → application settings → rename the application to SYLLABYSS (applies to dev and production).
