# #9 F09 Run screen and Reveal UI (Dive)

Status: done
Branch: feat/9-dive-run-ui (base `feat/10-design-system`, PR #47; merges `feat/33-game-modes-engine`, PR #46)
Updated: 2026-10-04 05:20

## Goal
`/runs/[runId]` (Mode dispatcher + the Dive Run screen wired to the real Run API) and `/runs/[runId]/reveal` (Krillion results column). Spec: `docs/design/modes/dive.md` §5–7, `docs/architecture/run-and-scoring.md`, `ui-map.md`, issue #9 latest comment.

## Done so far
- Contract additions (announced on #9 first): `Evidence.documentId` (filled in `evidenceLookup`, every Mode), `DiveRunState.prompt.tier` for single-answer kinds. DB test updated + asserts the tier.
- `lib/runs/client.ts`: `runApi` fetch helpers with clock offset (`serverNow` vs. request midpoint), `RunApiError`, `msUntil`.
- `app/runs/[runId]/page.tsx` (owner only, finished → reveal, abandoned → `RunClosed`), `mode-screens.tsx` (dispatcher; Apogee/Leap/Pairs/Blitz placeholders), `reveal/page.tsx` (409 → back to the Run), `queries.ts` (`getRunContext`, `getDiveHistory`), `new/` (`/runs/new?game=` launcher).
- `components/modes/dive/DiveRunScreen.tsx`: the full flow from DivePlayground on the real API; requests serialized through one promise chain so a late guess can't race `/timeout`; resync on 409; retry on network loss.
- `components/modes/dive/DiveRevealScreen.tsx` + extended `DiveReveal` (Mastery with gild, PB on the curve, Evidence links, DIVE AGAIN creates a Run).
- Small additive props on F10 blocks: `EvidenceLine.href`, `ResultList.evidenceHref`, `DistributionChart.best/minValues`, `CatchScreen.tags`. `ResultList` KIND_LABEL gained the two F20 kinds (tsc broke after the merge).
- Verified on :3700 with DEV_PLAYER_ID: full 7/7 run in the browser (all five kinds incl. ordered recall solved via ▲▼, hint, wrong guess, one-try miss, timeouts, Enter on the catch screen), reload mid-prompt resumes the clock, abandoned run screen, Apogee placeholder, 404s, Reveal with distribution + PB after 3 dives, 375 px Run and Reveal.

## Next steps
None. Follow-ups are in the PR body.

## Decisions & gotchas
- `start-prompt` fires 750 ms after the card's entry animation, and after DESCEND for later Prompts (clock paused on the catch screen).
- Distribution = your finished Runs on the Game up to this one; caption only below 3 values; caption `BETTER THAN X OF YOUR N OTHER DIVES`.
- Put-in-order catch shows "All in order" instead of the four joined steps; a one-try order miss says "the right order is marked".
- `/runs/new?game=` is the launch beat (user gesture unlocks sound). F11 can link there.
- Creating any Run abandons your other in-progress Runs (engine rule), so a stale Run tab shows the abandoned screen on its next request.
- Chrome background tabs throttle timers (1 s) and stall WAAPI animations, so leftover burst particles in screenshots are an artifact.
- Test runs were played as Anton's dev player on the seeded Graph Algorithms Dive Game, so his history there has a few Runs.

## Files touched
- `app/runs/**`, `components/modes/dive/{DiveRunScreen,DiveRevealScreen,DiveReveal,CatchScreen,playground-data}.tsx|ts`, `components/results/{EvidenceLine,ResultList,DistributionChart}.tsx`, `app/styleguide/DiveComponents.tsx`, `lib/runs/{client,types}.ts`, `lib/runs/engines/{common,dive}.ts`, `lib/runs/run-engine.db.test.ts`, docs (`FEATURES.md` F09, `run-and-scoring.md`, `ui-map.md`, `dive.md`).
