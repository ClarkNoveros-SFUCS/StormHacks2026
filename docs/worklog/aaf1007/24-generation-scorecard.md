# #24 F14 Generation scorecard (eval on real decks)

Status: in-progress
Branch: feat/24-generation-scorecard
Updated: 2026-10-04 09:00

## Goal
Measure Game generation on 3-4 real decks so prompt and check changes (F15-F17) are judged by numbers, not by eye. One row per deck: Prompts returned/kept, kinds, Open Prompts, Answers per Open Prompt, quotes verified, Hints removed, drops by reason, seconds, cost. Replays of saved responses cost nothing. Spec: `docs/architecture/game-generation-pipeline.md` § Improving output quality.

## Done so far
- Claimed #24 (assignee + in-progress, comment), branched from origin/main.
- Picked the eval decks (files stay outside git):
  - seed: `db/seed/graph-algorithms.json` (12 pages, in repo)
  - PDF: `~/Desktop/SFU/CMPT 354/slides/01-354-SQLBasics.pdf` (94 pages)
  - PPTX: `~/Desktop/SFU/CMPT 225/cmpt225-week07/CMPT225-Week07.pptx` (AVL trees, 73 slides, ~20k chars)
  - DOCX: `~/Downloads/Midterm.docx` (student ML midterm notes, 3 sections, ~7.5k chars)
  - The MIT 6.100L lecture PDF from earlier testing isn't on disk any more.

## Next steps
1. `lib/gemini/pricing.ts`, `lib/games/scorecard.ts` (+ test), `scripts/deck-pages.ts`, `scripts/eval.ts`, `eval/decks.json`, `npm run generate:eval`.
2. Live run (budget $1), save responses to `eval/responses/`, record the baseline in the spec.
3. Checks, FEATURES.md F14, PR.

## Decisions & gotchas
- Never edit `lib/gemini/game-prompt.ts`: F14 is measurement only.

## Files touched
- docs/worklog/aaf1007/24-generation-scorecard.md
