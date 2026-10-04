# Game generation pipeline

**This is the Dive Game Mode's generator** (`game-modes.md`). Other Modes reuse the shared steps (reading pages, common checks, writing rows) and bring their own prompt, schema and checks.

Turns the stored pages of chosen Source Documents into a **Game**: Prompts, Answers, Aliases, Tiers, Evidence and Hints. It runs once per Game. Games are immutable: there's no regeneration and no adding files later. A change means a new Game.

## Flow

```
Module page → "New Game": Player picks ≥1 parsed Source Documents and a title
  │  POST /api/modules/[moduleId]/games  { title, sourceDocumentIds[] }
  ▼
1. Auth + validate: the Module is the Player's; every document belongs to it and is 'parsed'
2. one transaction: INSERT games (status = 'queued'); INSERT game_sources rows  → respond 202 { game }
3. after(async () => generateGame(gameId))

generateGame:
  a. status = 'generating'
  b. for each selected document, IN PARALLEL: load its source_pages, then call Gemini (one call per document)
  c. validate every returned Prompt (checks below); drop what fails, keep the rest
  d. assign Tiers to Open Prompt Answers (code, not Gemini)
  e. if fewer than 7 Prompts survive in total → status = 'failed', error = 'Not enough usable content to make a Game'
  f. one transaction: INSERT prompts, answers, answer_keys; UPDATE games SET status = 'ready', prompt_count = n
  on any error: status = 'failed', error = <short user-facing message>
```

The Game card shows `Generating…` and re-fetches every ~3s until it's `ready` or `failed`. A failed Game can be deleted and created again; there's no retry-in-place, because Games are immutable.

## Gemini call (one per Source Document)

- SDK: `@google/genai`, server only, `lib/gemini.ts`. Model comes from `GEMINI_MODEL`.
- **Structured output:** set the response MIME type to JSON and pass the schema below, so the output always parses. Check the current Gemini docs for the exact config field names (`responseMimeType` / `responseSchema` or `responseJsonSchema`) before coding.
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

## Checks (code, after Gemini)

All string comparisons use `normalize()` from `lib/matching/normalize.ts`, the same function used to match guesses (`answer-matching.md`). Checks run in this order:

| # | Check | Applies to | On failure |
|---|---|---|---|
| 1 | `evidence_page` exists in this document | all | drop the Answer (or the Prompt, for ordered/odd-one-out) |
| 2 | **Evidence:** the normalized page content contains the normalized canonical or one Alias | open, cloze, definition answers; odd_one_out `correct_option` | drop the Answer / Prompt |
| 3 | **Alias hygiene:** dedupe; drop any key (canonical or Alias) that normalizes to the same string as a key of a *different* Answer in the same Prompt | open | drop that key; if it was a canonical, drop the Answer |
| 4 | Open Prompt still has ≥ 4 Answers | open | drop the Prompt |
| 5 | **Hint:** the normalized hint contains no key of the Prompt's Answer as a whole word (odd_one_out: not the correct option) | single-answer | set `hint = null`; the Hint button is hidden for that Prompt |
| 6 | Shape sanity: 3–6 `items`; exactly 4 distinct `options` including `correct_option` | ordered, odd_one_out | drop the Prompt |
| 7 | Exact-duplicate Prompt text across documents | all | keep the first |

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

## Code layout

| File | Responsibility |
|---|---|
| `app/api/modules/[moduleId]/games/route.ts` | POST create Game |
| `app/api/games/[gameId]/route.ts` | GET status/details, DELETE |
| `lib/gemini.ts`, `lib/gemini/game-prompt.ts` | Client and instructions |
| `lib/games/generate-game.ts` | `generateGame` steps a–f |
| `lib/games/validate.ts` | zod schema + checks 1–7 |
| `lib/scoring/tiers.ts` | Tier table + Open Prompt tier assignment |
