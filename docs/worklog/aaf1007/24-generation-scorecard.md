# #24 F14 Generation scorecard (eval on real decks)

Status: done
Branch: feat/24-generation-scorecard
Updated: 2026-10-04 03:15

## Goal
Measure Game generation on 3-4 real decks so prompt and check changes (F15-F17) are judged by numbers, not by eye. One row per deck: Prompts returned/kept, kinds, Open Prompts, Answers per Open Prompt, quotes verified, Hints removed, drops by reason, seconds, cost. Replays of saved responses cost nothing. Spec: `docs/architecture/game-generation-pipeline.md` § Improving output quality → § Scorecard (F14).

## Done so far
- Claimed #24 (assignee + in-progress, comment), branched from origin/main.
- Eval decks (files stay outside git; listed in `eval/decks.json` with sha256):
  - seed: `db/seed/graph-algorithms.json` (12 pages, in repo)
  - PDF: `~/Desktop/SFU/CMPT 354/slides/01-354-SQLBasics.pdf` (94 pages)
  - PPTX: `~/Desktop/SFU/CMPT 225/cmpt225-week07/CMPT225-Week07.pptx` (AVL trees, 73 slides)
  - DOCX: `~/Downloads/Midterm.docx` (student ML midterm notes, 3 sections)
  - The MIT 6.100L lecture PDF from earlier testing isn't on disk any more.
- `lib/games/scorecard.ts` (`scoreDocument`, `dropCode`, `unwrapSaved`, `formatScorecardTable`) + `scorecard.test.ts` (16 tests).
- `lib/gemini/pricing.ts` (price constants moved out of generate-check, `estimateCostUsd`).
- `scripts/deck-pages.ts` (env, deck loading, `promptVersion` hash), `scripts/generate-eval.ts`, `npm run generate:eval`.
- `generate:check` now uses the shared helpers, saves the same `SavedResponse` format (model, seconds, usage, cost) and prints a scorecard row; `--from` still reads old bare responses.
- Live baseline on gemini-3.6-flash (no fallback), saved to `eval/responses/`, recorded in the spec with findings.
- Checks: tsc, lint (0 errors; 20 pre-existing warnings in docs/design/mock), npm test (101), npm run build all pass.

## Next steps
None for F14. F15-F18 compare against the baseline in the spec.

## Decisions & gotchas
- Never edit `lib/gemini/game-prompt.ts`: F14 is measurement only.
- Script name `generate:eval` (the issue's name, next to `generate:check`) rather than `eval`.
- Replay is the default; `--live` must be asked for. Live runs save to `eval/runs/<time>/` (gitignored) unless `--save` is given, so the committed baseline is never overwritten by accident.
- `--no-fallback` keeps a table on one model. The baseline used it.
- Course files are never committed: `eval/decks/` is gitignored, `EVAL_DECKS_DIR` overrides. Saved responses (~17-21 KB each) are committed; they quote the decks only in short evidence quotes.
- Saved file = `{ deck, createdAt, promptVersion, run: { model, seconds, usage, costUsd }, response }`. `promptVersion` is the first 8 hex chars of sha256(instructions + schema + temperature); the baseline is `11c93557`.
- Drop reasons are mapped to short codes by regex in `dropCode`; an unknown reason falls back to the text with digits → N, so a new check in validate.ts still shows up.
- "Hints removed" counts only cloze / definition_to_term / odd_one_out (check 5's kinds), matched to the raw Hint by Prompt text.
- Cost = tokens × price constant (3.6-flash $0.75 in / $3.75 out per 1M, thinking as output). Estimates only.
- Gemini spend: 4 successful calls ≈ $0.202 USD total. 503s were not billed: the SQL deck failed 3 of 4 attempts over ~25 min.
- pdf.js prints "Warning: TT: undefined function: 32" for the SQL PDF; harmless, and it goes to stderr so `--json` stays valid.

## Files touched
- docs/worklog/aaf1007/24-generation-scorecard.md
- lib/games/scorecard.ts, lib/games/scorecard.test.ts, lib/gemini/pricing.ts
- scripts/deck-pages.ts, scripts/generate-eval.ts, scripts/generate-check.ts
- eval/decks.json, eval/responses/*.json
- package.json, .gitignore, .env.example
- docs/architecture/game-generation-pipeline.md, docs/FEATURES.md (F14 only)
