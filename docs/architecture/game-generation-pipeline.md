# Game generation pipeline

**This is the Dive Game Mode's generator** (`game-modes.md`). Other Modes reuse the shared steps (reading pages, common checks, writing rows) and bring their own prompt, schema and checks.

Turns the stored pages of chosen Source Documents into a **Game**: Prompts, Answers, Aliases, Tiers, Evidence and Hints. It runs once per Game. Games are immutable: there's no regeneration and no adding files later. A change means a new Game.

## Flow

```
Module page → "New Game": Player picks ≥1 parsed Source Documents and a title
  │  POST /api/modules/[moduleId]/games  { title, mode?, sourceDocumentIds[] }   (mode defaults to 'dive')
  ▼
1. Auth + validate: the Module is the Player's; every document belongs to it and is 'parsed' (else 409); mode is in MODES
2. one transaction: INSERT games (status = 'queued', mode); INSERT game_sources rows  → respond 202 { game }
3. after(async () => generateGame(gameId))

generateGame:
  a. claim it: UPDATE … SET status = 'generating' WHERE status = 'queued' (so it runs once); assert mode = 'dive'
  b. for each selected document, IN PARALLEL: load its source_pages, then call Gemini (one call per document)
  c. validate every returned Prompt (checks below); drop what fails, keep the rest
  d. assign Tiers to Open Prompt Answers (code, not Gemini)
  e. if fewer than 7 Prompts survive in total → status = 'failed', error = 'Not enough usable content to make a Game'
  f. one transaction: INSERT prompts, answers, answer_keys; UPDATE games SET status = 'ready', prompt_count = n
  on any error: status = 'failed', error = <short user-facing message>
```

The Game card shows `Generating…` and re-fetches every ~3s until it's `ready` or `failed`. A failed Game can be deleted and created again; there's no retry-in-place, because Games are immutable.

A Game still `queued`/`generating` 10 minutes after creation (the server restarted mid-way, say) is marked `failed` the next time the Player's Games are read.

### API

| Method + path | Body | Returns |
|---|---|---|
| `POST /api/modules/[moduleId]/games` | `{ title, mode?, sourceDocumentIds[] }` | 202 `{ game }` |
| `GET /api/modules/[moduleId]/games` | — | `{ games }`, newest first (poll while any are queued/generating) |
| `GET /api/games/[gameId]` | — | `{ game }` |
| `DELETE /api/games/[gameId]` | — | 204. Any status; also deletes its Runs and `guess_events` |

`game` is `GameSummary` from `lib/games/types.ts`: `id, module_id, title, mode, status, error, prompt_count, created_at, sources: { id, filename }[]`. Errors are `{ error }` with 400 (bad body, unknown mode, files not in this Module), 401, 404 and 409 (a file isn't Ready).

## Gemini call (one per Source Document)

- SDK: `@google/genai`, server only, `lib/gemini.ts`. Model comes from `GEMINI_MODEL` (we use `gemini-3.6-flash`).
- **Overload:** on 429/5xx (Gemini often answers 503 "high demand"), retry after 2, 5 and 12 s, then switch to `GEMINI_FALLBACK_MODEL` if set (we use `gemini-3.5-flash-lite`: weaker, fewer Open Prompts, but rarely overloaded). 3.8-flash was overloaded on most long requests during testing, which is why we use 3.6.
- **Structured output:** `responseMimeType: "application/json"` plus `responseJsonSchema` (plain JSON Schema), so the output always parses. `answers`, `tier`, `hint` and `explanation` are **required** for every Prompt (empty when a kind doesn't use them): left optional, Gemini omits them from single-answer Prompts, which then get dropped.
- Cost and speed with 3.6-flash: a 94-page lecture PDF took 45–100 s and ~$0.05 USD (per-deck numbers: § Scorecard). Don't lower the thinking level: `LOW` returned two Prompts with no Answers.
- Input: the document's pages, each wrapped as `=== Page <page_number> ===\n<content_md>`, and the document title.
- Ask for **15–20 Prompts per document**, in any mix of types, with at least half of them Open Prompts.
- Temperature around 0.4: varied enough for interesting Prompts, low enough to stay grounded.

### Instructions to give Gemini (summary; the full prompt lives in `lib/gemini/game-prompt.ts`)

1. Use **only** facts stated in the pages. Every Answer cites the page it appears on (`evidence_page`) and a short verbatim quote (`evidence_quote`, ≤ 200 characters).
2. **Open Prompts** ("Name a…", "Give an example of…", "Name a property of…"): list **4–15 valid Answers ordered from most obvious to most obscure** for a student in this course. Ranking order is the only rarity signal. Don't output scores or points.
3. **Single-answer Prompts:** give a `tier` (`common` | `solid` | `deep` | `rare`) for how obscure the fact is, a `hint`, and a one-sentence `explanation` shown on the reveal screen.
4. **Hints** are short clues that never contain the Answer, any Alias, or an obvious fragment of them.
5. **Aliases:** common alternative names, spellings, abbreviations and expansions ("BFS" ↔ "breadth-first search", "Dijkstra" ↔ "Dijkstra's algorithm"). Don't list mere typos; typo tolerance is handled in code.
6. `exact_only: true` for short acronyms (≤ 4 letters) and any Answer within a couple of letters of another Answer in the same Prompt (BFS/DFS).
7. Prompts must be answerable in 25 seconds by typing a few words.

### Response schema

A flat shape (optional fields per `kind`) works more reliably with structured output than `oneOf`:

```jsonc
{
  "prompts": [
    {
      "kind": "open | cloze | definition_to_term | ordered_recall | odd_one_out",
      "text": "string",

      // open, cloze, definition_to_term
      "answers": [                       // open: 4–15, most obvious first; cloze/definition: exactly 1
        {
          "canonical": "string",
          "aliases": ["string"],
          "exact_only": false,
          "evidence_page": 14,
          "evidence_quote": "string"
        }
      ],

      // single-answer kinds only
      "tier": "common | solid | deep | rare",
      "hint": "string",
      "explanation": "string",

      // ordered_recall
      "items": ["step 1", "step 2", "..."],   // 3–6, in the correct order
      // odd_one_out
      "options": ["a", "b", "c", "d"],       // exactly 4
      "correct_option": "c",
      // ordered_recall + odd_one_out
      "evidence_page": 19
    }
  ]
}
```

Validate the parsed response with a zod schema mirroring this shape. If one Prompt fails validation, drop it, not the whole document.

`npm run generate:check -- <file> [--pages a-b] [--save out.json] [--from out.json]` runs extraction → Gemini → checks on a local file without the app or database and prints what was kept and dropped and why, plus its scorecard row. Use it to tune the prompt; `--from` replays a saved response for free. To compare a change across all the eval decks, use `npm run generate:eval` (§ Scorecard).

## Checks (code, after Gemini)

All string comparisons use `normalize()` from `lib/matching/normalize.ts`, the same function used to match guesses (`answer-matching.md`). Checks run in this order:

| # | Check | Applies to | On failure |
|---|---|---|---|
| 1 | `evidence_page` exists in this document | all | drop the Answer (or the Prompt, for ordered/odd-one-out) |
| 2 | **Evidence:** the normalized page content contains the normalized canonical or one Alias, as whole words | open, cloze, definition answers; odd_one_out `correct_option` | drop the Answer / Prompt. odd_one_out first moves its Evidence to the first page that names the correct option (Gemini often cites the page about the other three); it's dropped only if no page does |
| 3 | **Alias hygiene:** dedupe; a repeated canonical keeps its first Answer; drop any key (canonical or Alias) that normalizes to the same string as a key of a *different* Answer in the same Prompt | open | drop that key; if it was a canonical, drop the Answer |
| 4 | Open Prompt still has ≥ 4 Answers; above 15, keep the 15 most obvious | open | drop the Prompt |
| 5 | **Hint:** the normalized hint contains no key of the Prompt's Answer as a whole word (odd_one_out: not the correct option) | single-answer | set `hint = null`; the Hint button is hidden for that Prompt |
| 6 | Shape sanity: 3–6 `items`; exactly 4 distinct `options` including `correct_option` | ordered, odd_one_out | drop the Prompt |
| 7 | Exact-duplicate Prompt text across documents | all | keep the first |

Two more rules apply before the checks above:

- **Unusable keys:** a name that normalizes to nothing, or to one character from something longer (`A*` → `a`, `%`, `_`), can't be typed or matched safely: `a` is on every page and would match the word "a". The key is left out, and if it's the canonical, the Answer is dropped. A genuine one-letter name (`C`, `R`) is kept.
- **Quotes:** an `evidence_quote` that isn't on its page (whitespace- and case-insensitive) or is over 200 characters is stored as null. The Answer is kept, because its page already passed check 2.

## Tier assignment for Open Prompts (code)

Gemini returns Answers ordered from most obvious to most obscure. With `N` Answers at index `0 … N-1`:

```
rarity_rank = index + 1                  // 1 = most obvious
last answer (index N-1)  → rare          // exactly one per Open Prompt
m = N - 1 remaining
deep   = ceil(0.3 * m)                   // the next most obscure
solid  = round(0.4 * m)
common = m - deep - solid
if common < 1: solid -= 1; common += 1   // always at least one common
assign from the obscure end: rare, then deep×deep, solid×solid, common×common
```

Examples:
- N = 4 → rare 1, deep 1, solid 1, common 1
- N = 11 → rare 1, deep 3, solid 4, common 3

Points per Tier come from one constant table (`lib/scoring/tiers.ts`): common 10, solid 25, deep 60, rare 100. Gemini never sees or writes points.

## Improving output quality (planned)

What testing on real decks showed (seed deck and CMPT 354 SQL Basics, 94 pages):
- **Mentioned ≠ correct.** Check 2 only confirms an Answer appears on its page. "Name an algorithm that handles negative edge weights" got Kruskal and Prim, both on the cited page and both wrong.
- **Broad or compound Open Prompts** ("Name an SQL clause used to filter, order, or group records"), and two ordered_recall Prompts about the same thing.
- **Hints that nearly give it away** through a plural or a related word ("disjoint sets" for union-find), which check 5's whole-word match misses.

**Why not plain RAG:** retrieval is for material that doesn't fit in the model's context. A whole deck does (94 pages ≈ 13k tokens), and each document already gets its own call, so retrieving chunks would only show Gemini less. Retrieval does help one thing: finding *more* Answers for an Open Prompt across the deck (F18).

Planned, in order (each measured with F14's scorecard, which comes first):

| ID | Change | Fixes | Cost |
|---|---|---|---|
| F14 (#24) | Scorecard over 3–4 real decks: kept Prompts, kinds, Answers per Open Prompt, quotes verified, drops by reason, time, cost; `--from` replays for free | judging changes by eye | none per Game |
| F15 (#25) | Example Prompts from the seed fixture in the instructions, plus "bad → good" pairs | broad Prompts, give-away Hints, tier choice | a few hundred input tokens |
| F16 (#26) | Second Gemini call per document: does each quote show its Answer fits the Prompt? Is the Prompt clear, or a duplicate? | mentioned-but-wrong Answers, duplicates | ~+20 s, ~+$0.02 per document |
| F17 (#27) | Ask for ~25 Prompts, keep the best 15–20 by code (Answers per Open Prompt, kind and page coverage, near-duplicates) | uneven quality and coverage | more output tokens |
| F18 (#28, stretch) | pgvector on `source_pages`: per Open Prompt, retrieve the related pages and ask for every Answer they support, then merge and re-rank | too few Answers per Open Prompt, weak Rarity | embeddings at upload + one call per Open Prompt |

### Scorecard (F14)

`npm run generate:eval` prints one row per eval deck: what the checks keep and drop, plus the time and cost of the Gemini call. Judge F15–F18 by it, before and after.

```
npm run generate:eval                          replay eval/responses/ (no Gemini call, $0)
npm run generate:eval -- --from <dir>          replay another saved set
npm run generate:eval -- --live                one call per deck (≈ $0.20 for all four), saved to eval/runs/<time>/
  ... --save <dir>  --deck <id>[,<id>]  --no-fallback  --drops  --json
```

- **Code change** (validate.ts, the checks): replay. It's free and the Gemini output is fixed, so any difference comes from your change.
- **Prompt change** (`game-prompt.ts`, F15–F17): `--live --no-fallback`, then compare with the baseline below. Gemini varies run to run at temperature 0.4, so treat a difference of a Prompt or two per deck as noise. The table header shows the **prompt version** (a hash of the instructions, schema and temperature); a replay says when a saved response came from a different prompt.
- **Decks** are listed in `eval/decks.json`. The course files aren't in git: put them in `eval/decks/` (gitignored) or set `EVAL_DECKS_DIR`. Ask Anton for the files. `sha256` in the manifest warns you if your copy differs. Without the files, only the seed deck can be scored; the others show "deck file missing".
- **Saved responses** (`eval/responses/<deck>.json`, ~20 KB each) are committed, with the model, seconds, token usage and estimated cost of the call. They quote the decks only in short evidence quotes. `--save` from `generate:check` writes the same format.
- **Cost** is an estimate: tokens × `GEMINI_PRICES_USD_PER_M` in `lib/gemini/pricing.ts` (3.6-flash: $0.75 input / $3.75 output per 1M tokens, thinking billed as output; 3.5-flash-lite: $0.30 / $2.50). Check ai.google.dev/pricing before trusting a total.

Columns: **Prompts ret → kept** (⚠ under 7, a one-document Game would fail) · **Kinds** open/cloze/definition_to_term/ordered_recall/odd_one_out · **Ans/Open** mean kept Answers per Open Prompt · **Quotes ok** kept Answers whose evidence quote is on its page · **Hints removed** by check 5, of the Hints given on cloze, definition and odd-one-out Prompts · **Dropped P / A** Prompts / Answers dropped · **Drops by reason** short codes from `dropCode` in `lib/games/scorecard.ts` · **s**, **$** for the Gemini call.

#### Baseline (prompt version `11c93557`, 2026-10-04)

`gemini-3.6-flash`, no fallback, one run per deck:

| Deck | Pages | Prompts ret → kept | Kinds (o/c/d/r/x) | Open | Ans/Open | Quotes ok | Hints removed | Dropped P / A | Drops by reason | s | $ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| seed-graph-algorithms (fixture) | 12 | 16 → 16 | 8/2/2/2/2 | 8 | 5.1 | 45/45 (100%) | 1/6 | 0 / 0 | – | 58 | 0.043 |
| cmpt354-sql-basics (PDF) | 94 | 16 → 15 | 7/2/3/2/1 | 7 | 4.7 | 34/38 (89%) | 0/6 | 1 / 4 | unusable-name 4, too-few-answers 1 | 101 | 0.058 |
| cmpt225-avl-trees (PPTX) | 73 | 16 → 13 | 7/2/2/2/0 | 7 | 4.4 | 35/35 (100%) | 0/4 | 3 / 1 | option-not-on-page 2, not-on-page 1, too-few-answers 1 | 79 | 0.057 |
| ml-midterm-notes (DOCX) | 3 | 16 → 12 | 4/2/3/2/1 | 4 | 6.0 | 25/29 (86%) | 0/6 | 4 / 14 | not-on-page 14, too-few-answers 4 | 75 | 0.044 |
| **Total** | 182 | 64 → 56 | 26/8/10/8/4 | 26 | 5.0 | 139/147 (95%) | 1/22 | 8 / 19 | not-on-page 15, too-few-answers 6, unusable-name 4, option-not-on-page 2 | 314 | 0.202 |

What it shows (`--drops` lists every drop):
- **Gemini always returns 16 Prompts**, and every deck still makes a Game (12–16 kept). Open Prompts average only **~5 Answers**, near the minimum of 4: little room for Rarity (F17, F18).
- **Answers that are phrases, not names** cause most drops. On the DOCX, four "Name a step in K-means / KNN / decision trees" Open Prompts got sentence-long paraphrased Answers ("Select k closest neighbors") that aren't on the page word for word, so 14 Answers and 4 Prompts were dropped. Steps belong in ordered_recall (F15's "bad → good" pairs).
- **Symbols as Answers:** "Name an arithmetic operator that returns NULL…" listed `+ - * /`, which normalize to nothing (unusable-name), so the whole Prompt was dropped.
- **odd_one_out with an invented correct option:** "Which … is NOT mentioned in the slides?" makes the correct option something no page names, so check 2 drops it. Ask for odd-one-out sets where all four options are in the deck.
- **Admin slides become Prompts** ("Name a requirement or rule for taking the midterm exam" on the PPTX). The instructions could say to skip course logistics.
- Check 5 rarely fires (1 of 22 Hints removed), but it can't catch near give-aways (§ above), so read the Hints too.
- **Latency is 60–100 s per deck**, more than the ~45 s measured earlier; the 94-page PDF took 101 s. 3.6-flash also answered 503 to the 94-page deck on three of four attempts within 25 minutes (each attempt is 4 tries over ~20 s). In the app, the fallback model would have taken over.

## Code layout

| File | Responsibility |
|---|---|
| `app/api/modules/[moduleId]/games/route.ts` | POST create Game, GET list the Module's Games |
| `app/api/games/[gameId]/route.ts` | GET status/details, DELETE |
| `lib/gemini.ts`, `lib/gemini/game-prompt.ts` | Client and instructions |
| `lib/games/generate-game.ts` | `generateGame` steps a–f |
| `lib/games/validate.ts` | zod schema + checks 1–7 (pure; shared checks 1–3 and 7, Dive's 4–6 + Tiers) |
| `lib/games/queries.ts`, `lib/games/types.ts` | Game reads for the routes (`getPlayerGame`, `listModuleGames`), client-safe `GameSummary` |
| `lib/modes/index.ts` | `MODES`, `ModeId`, `isModeId` |
| `scripts/generate-check.ts` | `npm run generate:check`: tune the prompt on a local file |
| `scripts/generate-eval.ts`, `eval/decks.json`, `eval/responses/` | `npm run generate:eval`: the F14 scorecard over the eval decks (§ Scorecard) |
| `lib/games/scorecard.ts`, `lib/gemini/pricing.ts` | `scoreDocument`, `formatScorecardTable`; Gemini price constants and `estimateCostUsd` (scripts only) |
| `lib/scoring/tiers.ts` | Tier table + Open Prompt tier assignment |
