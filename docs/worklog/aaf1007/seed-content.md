# Seed content for F22 (#35, Python Basics course) and F23 (#36, Daily Dive pool)

Status: done (no PR by design: the F22/F23 branches load these files)
Branch: content/seed-content (base origin/chore/overnight-plan)
Updated: 2026-10-04

## Goal
Hand-written, checked data files that the F22/F23 agents load: the Python Basics Course (6 Topics, reading + resources + Dive/Apogee/Leap/Pairs/Blitz practice) and a Daily Dive seed pool (≥ 10 puzzles with fact sheets). No app code. Spec: `overnight-decisions.md` §5, §7, Q18–Q20, Q23, Q27; `docs/architecture/game-generation-pipeline.md` checks 1–7.

## Done so far
- `scripts/check-seed-content.ts` + `npm run seed:content:check`: zod shapes, counts, verbatim Evidence quotes, Hints vs Answers, unique normalized Open Answers, and every Dive/Pairs Prompt through `validateDocument` (strict: any drop or cleared quote is an error). Leap/Blitz checks mirror `lib/modes/{leap,blitz}/generate.ts` (in flight on the modes branch). `--partial` checks only the files named and skips whole-collection rules.
- Content written in scratch fragments (one Topic / puzzle per file), assembled into `db/seed/courses/python-basics.json` and `db/seed/daily/pool.json`.

- Counts: Topics 1-6 have Dive 11/11/12/11/11/13, Leap 15/14/14/14/15/15, Pairs 16/15/15/14/14/15, Blitz 35/34/34/32/33/36 (each balanced true/false); readings 4-5 pages, 462-647 words outside code; 4 resources each.
- Daily pool: 12 puzzles (#1 Computing 2026-10-04, #2-#7 Science, History, Geography, Literature, Mathematics, Art & Music on 2026-10-05..10, #8-#12 spares). 3 open Prompts each (6-12 Answers) + cloze, definition_to_term, ordered_recall, odd_one_out.
- Checks: `npm run seed:content:check` passes; also ran every Mode game through the in-flight validators on the modes branch (`validateLeap`, `validateBlitz` + `balanceTrueFalse`, `validatePairs` + `dedupeTerms`, `validateDocument`): nothing dropped, no quotes cleared. `npx tsc --noEmit`, `npm run lint` (0 errors), `npm test` pass.

## Next steps
1. F22/F23 agents: load the files (see shapes below) and run each Mode's own validator at seed time as a guard.
2. If a fact or question needs changing, edit the JSON directly and re-run `npm run seed:content:check` (the scratch generator scripts were not kept).

## Decisions & gotchas
- **Course file shape:** `{ course: { slug, title, level, summary, description, banner_theme, estimated_minutes }, topics: [{ slug, order, title, summary, minutes, reading: { pages: [{ page_number, content_md }] }, resources: [{ title, url, source }], games: [...] }] }`. `games` mirrors `graph-algorithms-modes.json`: `{ mode, title, prompts }` per Mode in that Mode's Gemini response shape; Apogee is `{ mode: "apogee", title, prompts_from: "dive" }` (reuse the same Topic's Dive Prompts).
- **Pool shape:** `{ puzzles: [{ number, day, theme, title, fact_sheet: { pages }, prompts }] }`, 7 Dive-kind Prompts each; page N of the fact sheet is the Evidence for Prompt N. #1 = 2026-10-04 (Computing), #2–#7 = 2026-10-05..10, the rest `day: null` spares.
- Leap options are distinct case-insensitively (the Leap validator lowercases), so "Print"/"print" style options are out. Options and Answers that normalize to empty (pure symbols such as `//`, `#`) are dropped by the pipeline, so they're written as words ("A hash sign (#)").
- Resource URLs were checked with curl (all 200). docs.python.org now redirects `library/functions.html` and `library/stdtypes.html` to `builtins/...`, so the files use the `builtins/` URLs. realpython.com blocks curl (403), so no Real Python links (couldn't verify them).
- Evidence quotes are verbatim; a few include markdown (backticks) when the line has it.
- No duplicate Prompt text across Daily puzzles (checked). Overlaps found in review were replaced: #2 now asks for SI base units (noble gases stay in #11), #10 asks for Nobel Prize categories and renewable energy sources (EM spectrum and organelles stay in #2), #12 asks for atmospheric gases (continents stay in #4).
- Distractors that are technically also correct were removed (e.g. `int` for the type of True, `NameError` for UnboundLocalError), and one opinion-based Blitz statement was dropped.

## Files touched
- `scripts/check-seed-content.ts`, `package.json` (script), `db/seed/courses/python-basics.json`, `db/seed/daily/pool.json`, this worklog.
