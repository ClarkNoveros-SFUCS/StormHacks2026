# Overnight state (single source of truth)

Read this first if you're a new session or your context was compacted. Decisions: `overnight-decisions.md` (same folder). Never redo an item marked `pr-open`.

Phase: **done — queue finished; summary in overnight-summary.md**
Main checkout sits on `chore/overnight-plan` (PR #43, docs only; all lanes branch from it). This file and `overnight-agent-protocol.md` are untracked here until the summary branch is made.
Issues created: F19 #32 landing/shell, F20 #33 modes engine, F21 #34 social, F22 #35 courses, F23 #36 daily, F24 #37 apogee+leap UI, F25 #38 pairs+blitz UI, F26 #39 profile/friends/leaderboard UI, F27 #40 explore UI, F28 #41 daily hub UI, F29 #42 arena.
Comments posted on #10 (direction), #9, #11 (AC), #8 (takeover, Clark unassigned), #21.

## Facts found
- Dev DB (`stormhacks-dev`) has one Player: `user_3KD852awCV88LswW9l5jkVyo4gB` (Anton, owns the seeded Graph Algorithms Module).
- Extensions: timescaledb 2.30.2, timescaledb_toolkit 1.26.0 (hyperfunctions OK), fuzzystrmatch. No pgvector yet.

## Queue

| Lane | # | Item | Issue | Status | Branch | PR | Notes |
|---|---|---|---|---|---|---|---|
| P | 1 | F14 generation scorecard | #24 | pr-open | feat/24-generation-scorecard | #44 | verified: tsc/lint(0 err)/101 tests OK; baseline 64→56 prompts, $0.20 |
| P | 2 | F15 example Prompts | #25 | pr-open | feat/25-example-prompts | #54 | kept 56→64/60, quotes 95→97/98%; $0.43 |
| P | 3 | F16 verification pass | #26 | pr-open | feat/26-verification-pass | #60 | verified; catches 8–9/9 planted errors; ~$0.45 |
| P | 4 | F17 overgenerate + select | #27 | pr-open | feat/27-overgenerate-select | #62 | PR metadata checked; agent-reported checks pass; flag off by default |
| A | 1 | F20 Game Modes engine + generation | #33 | pr-open | feat/33-game-modes-engine | #46 | verified tsc/lint/110 tests; 59 db tests; Gemini ~$0.17; seed has a Game per Mode |
| A | 2 | F21 Social backend | #34 | pr-open | feat/34-social-backend | #45 | verified tsc/lint/126 tests; migration applied; onRunFinished hook wired by F22 |
| A | 3 | F22 Courses + Python Basics + XP wiring | #35 | pr-open | feat/35-courses-backend | #48 | verified tsc/lint/161 tests; seeded 6 topics/30 public games |
| A | 3a | Seed content (Python course JSON + Daily pool) | — | done | content/seed-content | (none) | pushed 2ec6d62; 6 topics all modes, 12 daily puzzles (#1 CS 2026-10-04); `npm run seed:content:check` passes |
| A | 4 | F23 Daily Dive backend | #36 | pr-open | feat/36-daily-dive | #57 | verified tsc/lint/180 tests; job 1013 registered; 15 puzzles (3 Gemini, ~$0.13) |
| U | 1 | F10 design system + docs + mock w/ real diving | #10 | pr-open | feat/10-design-system | #47 | verified tsc/lint/114 tests; I played /styleguide/dive: Krillion layout + catch screen OK |
| U | 2 | F19 Landing + shell + /home | #32 | pr-open | feat/32-landing-shell | #51 | verified tsc/lint/164 tests; AVATARS list fixed to match F10 |
| U | 3 | F08 Modules + file viewer + Mode picker | #8 | pr-open | feat/8-modules-ui | #50 | verified tsc/lint/151 tests; Part of #21 |
| U | 4 | F09 Dive Run + Reveal | #9 | pr-open | feat/9-dive-run-ui | #49 | verified tsc/lint/139 tests; launch page /runs/new?game= |
| U | 5 | F11 Game page | #11 | pr-open | feat/11-game-page | #52 | verified tsc/lint/200 tests |
| U | 6 | F24 Apogee + Leap screens | #37 | pr-open | feat/37-apogee-leap | #58 | verified tsc/lint/144 tests; seeded extra player user_dev_f24_agent in dev DB |
| U | 6b | F25 Pairs + Blitz screens | #38 | pr-open | feat/38-pairs-blitz | #55 | verified (see log); conflicts with F24 in mode-screens.tsx/client.ts expected |
| U | 7 | F26 Profile / Friends / Leaderboard | #39 | pr-open | feat/39-profile-social-ui | #56 | verified; daily tab waits for F23 gameId |
| U | 8 | F27 Explore / Course / Topic | #40 | pr-open | feat/40-explore-ui | #53 | verified tsc/lint/201 tests |
| U | 9 | F28 Daily hub + daily integrations | #41 | pr-open | feat/41-daily-hub | #59 | verified tsc/lint/238 tests; Anton has counted Daily #1 (315) |
| — | 10 | F18 retrieval (stretch) | #28 | skipped | | | lower priority than Arena per Anton (Q7); not started |
| — | 12 | F29 Arena (stretch) | #42 | pr-open | feat/42-arena | #61 | verified; pointer-lock needs a manual check |
| — | 11 | F12 deploy prep (prep only) | #12 | pr-open | feat/12-deploy-prep | #63 | docs; deploy needs human |
| — | 13 | overnight/demo integration | — | done | overnight/demo | (none) | all PRs except F17 merged; checks + smoke test pass |

## Log
- 2026-10-04 02:40 — decisions drafted; round 1 of grilling sent (Q1–Q16).
- 2026-10-04 02:45 — F14 subagent launched in a worktree (background) while waiting on round-1 answers.
- 2026-10-04 03:00 — grilling done (Q1–Q27 + final note in decisions §12–14). "go" received. Phase 1 started.
- 2026-10-04 03:10 — plan PR #43 opened; issues #32–#42 created; F20 (lane A) and F10 (lane U) agents launched in worktrees.
- 2026-10-04 03:40 — F14 verified (PR #44). F21 launched in slot P (F15 waits for F20).
- 2026-10-04 04:25 — F21 verified (PR #45), F20 verified (PR #46). Launched: seed content, F22 (on F20+F21), F15 (on F20+F14). Gemini spend so far ≈ $0.37.
- 2026-10-04 04:55 — F10 verified (PR #47) incl. visual check. UI parallelised: F19, F08, F09 launched concurrently (route ownership rules added to protocol).
- 2026-10-04 05:10 — seed content done (content/seed-content). **Usage limit reached.** Agents possibly still running/cut off: F22 (feat/35-courses-backend), F15 (feat/25-example-prompts), F19 (feat/32-landing-shell), F08 (feat/8-modules-ui), F09 (feat/9-dive-run-ui).

## RESUME HERE (new session)
1. For each `doing` item: check `git ls-remote origin <branch>`, `gh pr list --head <branch>`, and its worklog `docs/worklog/aaf1007/<n>-*.md` on that branch. If a PR exists → verify (tsc/lint/test, `Closes`, no attribution) and mark pr-open. If not → resume with a fresh subagent on the same branch from its worklog's Next steps.
2. Remaining queue: F11 #11 (base F10+F20), F24 #37 + F25 #38 (base F09 branch), F26 #39 (base F19/F21), F27 #40 (base F22 + F10), F23 #36 Daily backend (base F22, merge content/seed-content), F28 #41 (after F23 + F09), F16 #26, F17 #27, F12 #12 prep, F29 #42 stretch.
3. Then push `overnight/demo` (merge all PR branches) and write `overnight-summary.md` (include Anton's to-do for main: merge order 43 → 44/45/46/47 → stacked PRs; migrations already applied to stormhacks-dev; run `npm run db:seed`, `db:seed:courses`, `social:backfill`; DEV_PLAYER_ID is dev-only).
Gemini spend so far ≈ $0.37 + F15's (≤ $0.80).
- 2026-10-04 05:30 — F22 finished (PR #48). Only a PR-metadata check done (base, Closes, no attribution); full local re-verify pending due to usage limit.
- 2026-10-04 ~06:10 — usage limit reset. F08/F19/F09/F15 had died (429); stray dev servers killed; all four resumed via SendMessage. F22 verified. Launched F23 and F11.
- 06:40 — F09 (#49) and F08 (#50) verified; seed data intact. Launched F24, F25 (base F09), F27 (base F10+F22). F26 queued until a slot frees.
- 06:55 — F19 verified (PR #51). F26 launched (base F19 + merge F22).
- 07:10 — F11 finished (PR #52).
- 07:25 — F27 finished (PR #53).
- 07:30 — F27 verified (#53). F16 launched on F15's branch.
- 07:50 — F15 finished (PR #54). Gemini total ≈ $0.80 + F16/F23 in flight.
- 08:10 — F25 finished (PR #55).
- 08:25 — F26 finished (PR #56).
- 08:45 — F23 verified (#57). F28 launched (also wires crowd chart, landing teaser, leaderboard daily tab).
- 09:05 — F24 finished (PR #58).
- 09:10 — F29 Arena launched (stretch). F18 skipped in favour of Arena.
- 09:30 — F28 finished (PR #59).
- 09:45 — F28 verified (#59), F16 verified (#60). Launched overnight/demo integration + F12 prep agent, and F17. Gemini total ≈ $1.5.
- 10:05 — F29 Arena finished (PR #61).
- 10:25 — F17 finished (PR #62). Usage limit near: summary written. overnight/demo + F12 agent still running.
- 10:45 — overnight/demo pushed, F12 PR #63. Queue finished.
