# #40 F27 Explore, Course and Topic pages

Status: done
Branch: feat/40-explore-ui (base `feat/10-design-system`, merged `origin/feat/35-courses-backend`)
Updated: 2026-10-04 overnight

## Goal
`/explore` catalogue, `/explore/[courseSlug]` course page (banner hero, numbered Topic timeline, sidebar), `/explore/[courseSlug]/[topicSlug]` Topic page (reading, resources, mark as read, Practice panel, pass celebration, unlock animation). Spec: issue #40, overnight-decisions §5, Q24, Q27, §14; `docs/architecture/courses.md`.

## Done so far
- Branch from `origin/feat/10-design-system`, merged `origin/feat/35-courses-backend` (conflict in `docs/architecture/ui-map.md`: kept F10's route tree, kept the F27 section and F22's data section, kept the Course practice Games Reveal bullet).
- `/explore`: hero with parallax pixel jungle scene + mascot, Python Basics as a wide TiltCard (jungle-python SVG banner with slithering snake, level chip, Topics, minutes, Mode badges, progress ring signed in), 3 coming-soon cards that wiggle + quip on click, "Or make your own" → `/modules`.
- `/explore/[courseSlug]`: banner hero (mirrored art, parallax), CTA Start learning / Continue: Topic N / Review, sign-in button signed out; Topic timeline (gold check + filled rail for passed, pulsing ring for current, padlock for locked), accordions with summary, per-Mode best + pass, Read / Practice; `?passed=` unlock animation (rail fills, next node pops, burst, mascot "Topic N unlocked!", course finished → confetti); sidebar ProfileCard / sign-in card, progress bar, 6 Topic badges + course badge, stats incl. resource count.
- Topic page: header with chips, "Topic passed!" banner (confetti once per session), reading as continuous article with page pills (scroll-spy), top reading progress bar, highlighted Python code with copy, Common mistakes callouts, Mark as read (+20 XP toast, burst, level-up celebrate), Practice panel (ModeTile per Game, short pass bar, best in the Mode's unit, passed tick, Play → POST runs → `/runs/<id>`; signed out → Clerk modal; locked → disabled + "Pass Topic N−1 first"), resources (new tab), prev/next nav (next highlighted once passed).
- Metadata on all three pages. Unit tests for markdown, highlighter, labels.
- Verified with the dev server on 4200: signed in as Anton (mark as read gave +20 XP toast, Play created a Run and navigated to `/runs/<id>`), as a throwaway player with Topics passed (timeline states, `?passed` animation for Topic 2 and course finish, passed banner; player and rows deleted afterwards), and signed out (all pages 200, "Sign in to play", read/run POSTs 401). 375 px: no horizontal scroll on any page (checked in a 375 px iframe).
- Checks: tsc, lint, `npm test` (201), `npm run build` pass.

## Next steps
- None. Follow-ups: F09/F24/F25 link Reveal "Topic passed" banners to `/explore/<course>?passed=<topic>`; F19 adds Explore to the nav.

## Decisions & gotchas
- Pages call `lib/courses/queries.ts` directly with `getApiPlayer()` (null signed out). Extra read-only query `topicRecords()` for per-Mode bests on the timeline (no API change).
- Wrote a tiny markdown parser + Python tokenizer instead of adding dependencies. Single `*` is never emphasis because readings use `*`/`**` as operators in prose.
- Play POSTs directly instead of linking F09's `/runs/new?game=` (works whether or not F09 is merged).
- Course hero art is mirrored so the snake sits right of the title; on mobile the overlay gradient runs bottom-to-top for contrast.
- Locked Topic nodes show a padlock (no number), per the brief.
- Signed-out explore pages get their own small Logo + Sign in bar in `app/explore/layout.tsx` (root header is signed-in only; nav is F19's).
- Fixed `components/results/ResultList.tsx` KIND_LABEL (missing `multiple_choice`, `true_false`) so tsc passes after the merge; same change as on F09's branch.
- Chrome screenshots in this environment crop/lag; verification leaned on DOM checks.

## Files touched
- app/explore/** (new)
- components/results/ResultList.tsx (2-line integration fix)
- docs/FEATURES.md (F27 section + board row), docs/architecture/ui-map.md (merge resolution + `?passed`), this worklog
