# #87 Game card: step-by-step text animation while a Game is generating

Status: done
Branch: feat/87-gen-steps
Updated: 2026-10-04

## Goal
Replace the static "Writing prompts from your files..." line on a generating Game card with a text animation that steps through the generation stages, without a timer.

## Done so far
- `GenSteps` (app/modules/_components/GenSteps.tsx): one line that rolls up to each new step, `n/5` counter, progress ticks (hidden below `sm` so the label fits on phones).
- Swapped into `GameCard` in GamesPanel.tsx; removed the old `Elapsed` timer.
- Styles `.stepRoll` and `.tickNow` in modules.module.css.
- Tried a picture version (pixel icons in a row); the user picked the text one.

## Next steps
None.

## Decisions & gotchas
- The generator only reports `generating`, not a stage, so steps advance on time since `created_at` (0/5/12/30/48 s, roughly the real pipeline: read, concepts, write, verify, select). It stays on the last step until the Game is ready.

## Files touched
- app/modules/_components/GenSteps.tsx (new)
- app/modules/_components/GamesPanel.tsx
- app/modules/_components/modules.module.css
