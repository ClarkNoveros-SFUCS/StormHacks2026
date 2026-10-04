# #72 Make Dive match the real Krillion game (logic and animation)

Status: done
Branch: feat/72-dive-krillion-parity
Updated: 2026-10-04 08:50

## Goal
Match Dive's animations and screen flow to Krillion, using a recorded Krillion daily dive (https://www.youtube.com/watch?v=YU2mpcddchs) as the reference. Spec: `docs/design/modes/dive.md` §5–6.

## Done so far
- Studied the recording frame by frame (ffmpeg contact sheets). Krillion's sink is one continuous move: chip drops, camera follows it, tier lines hang in the world, card scrolls away, depth counts live. Ours used to sink the chip in a fixed box and *then* move the camera.
- New `Descent` (chip + world tier lines, drives the camera via `DiveCamera.follow`), `DepthMarks` (depth facts), `NOTHING LANDED` (`CatchScreen tier="miss"`), Krillion-size catch screen, count-up score, card `rise` entry, dock slide-in, red top-edge hot clock, bigger boat, sky intro pan (`SKY_DEPTH`, `useSkyCarry`), calmer marine snow, softer Trench flash.
- Wired into both `DiveRunScreen` and `DivePlayground`. Verified by recording the playground with headless Chrome (Playwright) and comparing frames with the reference.
- tsc, lint and the Dive tests pass. Full suite: only `lib/daily/daily.test.ts` share-URL test fails, and only because a local `.env.local` sets `NEXT_PUBLIC_SITE_URL` (passes without it).

## Next steps
- None for this issue. Possible follow-ups: Krillion's "did you mean X? submit again to confirm" typo confirmation (matching logic, F05).

## Decisions & gotchas
- Kept our tiers and points (Shallows 10 / Reef 25 / Abyss 60 / Trench 100), not Krillion's; scoring is a shared contract and the issue was about animation.
- Removed `DepthRuler` from the Run (Krillion has none; the edges now hold depth facts). Component kept.
- The real `/runs/[id]` screen couldn't be clicked through locally without signing in; it shares all the new components and logic with the playground, which was tested end to end.
- React compiler lint forbids mutating a ref passed as a prop, so `Descent` reports the world shift through `onShift(px)` and the parent moves its own card.

## Files touched
- components/modes/dive/{Descent,DepthMarks}.tsx (new), CatchScreen, DiveHud, DiveRunScreen, DivePlayground, OceanStage, depth.ts (+ tests)
- components/round/RoundCard.tsx, app/globals.css (`card-rise`)
- docs/design/modes/dive.md, docs/FEATURES.md
