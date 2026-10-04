# Overnight subagent protocol (read fully before starting)

You are one subagent in an unattended overnight build of ClarkNoveros-SFUCS/StormHacks2026 (Next.js 16 App Router + React 19 + Tailwind 4, Clerk auth, Tiger Data Postgres/TimescaleDB, Gemini). Anton (the user, GitHub `aaf1007`) is asleep. **Never ask questions**: pick the sensible default, write it in your worklog and PR body, and keep going.

## Read first
- `AGENTS.md` (this Next.js has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before writing Next code), `CONTEXT.md`, `docs/architecture/overview.md`, `docs/FEATURES.md`.
- **Decisions of record:** `docs/worklog/aaf1007/overnight-decisions.md` (on `origin/chore/overnight-plan`). It overrides older docs where they disagree, especially §12–14 (Anton's own answers).
- Your issue: `gh issue view <n>` (+ comments).

## Worktree setup
You start in a fresh git worktree. Main checkout: `/Users/ant1007/Desktop/stormhacks2026` (don't edit files there).
1. `cp /Users/ant1007/Desktop/stormhacks2026/.env.local .env.local` (gitignored; never commit). For signed-in pages under `next dev`, append `DEV_PLAYER_ID=user_3KD852awCV88LswW9l5jkVyo4gB` to **your worktree's** `.env.local` only (the bypass exists once F10 lands; see below).
2. `npm ci` (fall back to `npm install`), then `npx next typegen`.
3. `git fetch origin` and create your branch from the base given in your brief: `git switch -c <branch> origin/<base>`.
4. Dev server: use the port in your brief (`npx next dev -p <port>`), and stop it when done. Never use port 3000 (Anton's).

## Team protocol
- Claim when you start: `gh issue edit <n> --add-assignee @me --add-label in-progress`, then comment `Claimed. Branch: <branch>. Plan: <one line>.`
- Worklog: create and keep current `docs/worklog/aaf1007/<n>-<slug>.md` (template in `docs/worklog/README.md`); commit it with the code. Update it after each chunk.
- **Shared contracts** (DB schema, public `lib/` signatures, API routes, `CONTEXT.md` terms): post a comment on your issue describing the change **before** you push it.
- **Migrations:** `db/migrations/<YYYYMMDDTHHMM>_<name>.sql`, one transaction, no BEGIN/COMMIT. **Additive only** (new tables/columns/indexes, widened CHECKs, new aggregates/jobs). Never drop or rename; never edit a migration that has been applied. The dev DB (`stormhacks-dev`) is shared with the team and `main` must keep working against it. Apply with `npm run db:migrate`. Continuous aggregates: `WITH NO DATA`.
- **Commits:** normal messages. **Never** add `Co-Authored-By` trailers or "Generated with …" lines anywhere (commits, PR title, PR body).
- Never merge a PR, never push to `main`, never force-push a branch you didn't create.
- Stay in your lane: don't rewrite files another in-flight feature owns, except for minimal, clearly-noted integration edits.
- Gemini: stay inside the budget in your brief (the whole night has $5).

## Definition of done
1. Every item on your issue checklist is met.
2. `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build` pass, plus `npm run test:db` if you touched the DB.
3. UI work: start the dev server and load every page you touched; check there are no runtime or console errors (`curl -s localhost:<port>/<path>` at least; screenshots if browser tools are available to you). Check 375 px and desktop widths when you can.
4. `docs/FEATURES.md`: edit **only your feature's section and board row**: tick the boxes (copy the issue checklist into the section), Status `done`, fill Entry points and Notes for others. Update the matching `docs/architecture/*.md` / `docs/design/*.md` and `CONTEXT.md` if behaviour or terms changed.
5. Worklog `Status: done`. Commit, `git push -u origin <branch>`.
6. Open the PR: `gh pr create --base <base branch> --title "<Fxx> <title>" --body "..."`. Body: `Closes #<n>`, what was built, how to try it, check results, **decisions made without Anton**, and `Stacked on #<PR>` if your base isn't `main`.

If you're stuck after a real attempt: commit the WIP, push, record the blocker in the worklog, don't open a PR, and report.

## Report back (≤ 15 lines)
Status, branch, PR URL, each check command's result, decisions made, follow-ups/known gaps.

## UI agents: extra rules
- **Visual bar:** `overnight-decisions.md` §2 and **§14**. Anton wants the site visually stunning, full of character and interactivity, beyond Codedex. Every page should feel alive: use F10's components (`@/components/ui`, list + props in the F10 section of `docs/FEATURES.md` and `docs/design/design-system.md`): SkyBackdrop, Mascot (Lumen), TiltCard, Odometer, XpBar, StreakFlame, Confetti, ModeTile, ProfileCard, Heatmap, PixelAvatar, synthesized sfx. Add new shared components to `components/ui/` only if they're generic; otherwise keep them in your feature folder.
- **Dive screens** follow `docs/design/modes/dive.md` (Krillion layout, real descent, catch screen). The `/styleguide/dive` playground is the reference implementation to reuse.
- **Signed-in rendering:** add `DEV_PLAYER_ID=user_3KD852awCV88LswW9l5jkVyo4gB` to your worktree `.env.local` (honoured only by `next dev`).
- **Browser checks:** if Chrome tools are available, open your own new tab (`tabs_create_mcp`), never touch other tabs, close yours when done. Background tabs throttle animation, so if screenshots look frozen, rely on DOM checks/console logs instead.
- **Ownership** (to avoid conflicts between parallel UI agents): F19 owns `app/layout.tsx`, the site nav/header, `app/page.tsx`, `app/home/**`. F08 owns `app/modules/**`. F09 owns `app/runs/**` (with a per-Mode dispatcher that F24/F25 extend). F11 owns `app/games/**`. F26 owns `app/u/**`, `app/profile`, `app/friends`, `app/leaderboard`. F27 owns `app/explore/**`. F28 owns `app/daily/**`. If you need a nav link or layout tweak you don't own, leave it and note it in your PR.
