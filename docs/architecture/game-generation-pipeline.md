# Game generation pipeline

The pipeline is shared by every Game Mode (`game-modes.md`); each Mode brings its own Gemini instructions, schema, checks and minimum ([§ Per-Mode generation](#per-mode-generation)). The Gemini call, checks and Tier sections below describe **Dive's** generator, which Apogee uses unchanged.

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
  a. claim it: UPDATE … SET status = 'generating' WHERE status = 'queued' (so it runs once);
     generator = generatorFor(game.mode)  (Apogee → Dive's; a reserved Mode fails "This Game Mode can't be generated yet")
  b. for each selected document, IN PARALLEL: load its source_pages, then call Gemini with the Mode's request
     (Dive/Apogee with GEMINI_SPLIT on, the default: two calls at once, Open Prompts and every other kind, whose
     Prompts are joined before the checks; § Split generation (F30))
  c. the Mode's per-document checks (Dive's below); drop what fails, keep the rest. Then, per document, the
     verification pass (§ Verification pass (F16)): a second Gemini call drops Answers their page doesn't
     support, unclear Prompts and duplicates (GEMINI_VERIFY=off skips it; a failed call keeps everything).
     With GEMINI_OVERGENERATE on (Dive/Apogee; off by default), Gemini was asked for ~25 and selectPrompts
     now keeps the best 15–20 per document (§ Overgenerate and select (F17)).
     Then check 7 across documents, then the Mode's Game-level checks (Pairs: one Prompt per term; Blitz:
     true/false balance)
  d. assign Tiers to Open Prompt Answers (code, not Gemini; Dive only)
  e. if fewer than the Mode's minimum survive (Dive/Apogee 7, Leap 10, Pairs 12, Blitz 30) → status = 'failed',
     error = 'Not enough usable content to make a Game' (other Modes add: "a Leap Game needs 10 questions and only 6 passed the checks. Try adding more files")
  f. one transaction: INSERT prompts (with is_true for true_false), answers, answer_keys; UPDATE games SET status = 'ready', prompt_count = n
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
- Ask for **15–20 Prompts per document**, in any mix of types, with at least half of them Open Prompts. With `GEMINI_OVERGENERATE` on: **about 25, at least 12 of them Open** (§ Overgenerate and select (F17)).
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

`npm run generate:check -- <file>|--seed [--mode <mode>] [--pages a-b] [--save out.json] [--from out.json]` runs extraction → Gemini → checks on a local file (or the seed deck) without the app or database, with the given Mode's generator (default `dive`), and prints what was kept and dropped and why, plus its scorecard row for Dive-engine Modes. Use it to tune the prompt; `--from` replays a saved response for free. To compare a change across all the eval decks, use `npm run generate:eval` (§ Scorecard).

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

## Per-Mode generation

Each Mode exports a `ModeGenerator` (`lib/modes/generation.ts`) from `lib/modes/<mode>/generate.ts`: `request` (system instruction, JSON response schema, temperature, page contents), `validate(response, pages)` (per document; drops, never throws), `finalize(kept)` (Game-level checks after check 7), `minPrompts`, and `notEnough(n)` (the user-facing error). `generatorFor(mode)` in `lib/modes/generators.ts` picks it; `generateDocumentPrompts(title, pages, request)` in `lib/gemini.ts` sends it (Dive's request is the default). Every new kind still stores one `answers` row per Prompt with its Evidence page and quote, so Mastery and the Reveal work the same way.

| Mode | Asks Gemini for | Checks (code) | Min |
|---|---|---|---|
| Dive, Apogee | 15–20 mixed Prompts per document (above), as two parallel calls with `GEMINI_SPLIT` (8–10 Open, 7–10 other kinds; F30); about 25 with `GEMINI_OVERGENERATE`, then `selectPrompts` keeps 15–20 (F17) | checks 1–7, Tiers | 7 |
| Leap | 12–16 `multiple_choice` per document: stem, exactly 4 short options, `correct_option` copied from them, explanation, tier, `evidence_page` + `evidence_quote` for the correct option. Distractors must be plausible and taken from the same notes; no "all/none of the above" | exactly 4 options, distinct up to case and spacing (not `normalize()`, which would merge `O(V + E)` and `O(V * E)`); `correct_option` is one of them (exactly, else up to case/spacing); no all/none-of-the-above; the cited page exists and the quote is verbatim on it (required, else the question is dropped); the stem doesn't name the correct option while naming none of the others; tier defaults to `solid` | 10 |
| Pairs | 16–24 `definition_to_term` per document, each a different key term: a definition of at most 25 words that never uses the term, the term (1–4 words) with aliases, tier, explanation | Dive's checks for the kind (term on its cited page, quotes, unusable keys), then: definition ≤ 200 characters (it's a card), term ≤ 6 words, the definition doesn't contain the term or an Alias as whole words; across the Game, one Prompt per term (normalized) | 12 |
| Blitz | 36–45 `true_false` per document, about half false: one short statement (≤ 20 words), `is_true`, explanation (for a false one, the correct fact), tier, `evidence_page` + `evidence_quote`. A false statement changes exactly one detail of a real fact from the notes | statement ≤ 200 characters; the cited page exists and the quote is verbatim on it (required); a "false" statement that appears word for word in its page is dropped; across the Game, the larger side keeps at most 1.5× the smaller (true/false balance) | 30 |

Tested on the seed deck (12 pages) with `generate:check --seed --mode <m>` on 2026-10-04: Leap 13 returned → 13 kept (after the distinctness fix; one O(…) question was wrongly dropped before it), Pairs 21 → 21, Blitz 36 → 35 (19 true / 16 false), Apogee 16 → 16. Each call cost $0.01–0.05 and took 40–90 s. Leap's call fell back to `gemini-3.5-flash-lite` (3.6 was overloaded) and still passed.

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
| F15 (#25, done) | Example Prompts from the seed fixture in the instructions, plus "bad → good" pairs (§ Scorecard → F15) | broad Prompts, give-away Hints, steps as Answers, admin Prompts | ~1,100 input tokens |
| F16 (#26), **done** | Second Gemini call per document: does each quote show its Answer fits the Prompt? Is the Prompt clear, or a duplicate? (§ Verification pass) | mentioned-but-wrong Answers, duplicates | measured +4–7 s, ≈ +$0.006–0.010 per document (flash-lite) |
| F17 (#27), **done, off by default** | Ask for ~25 Prompts, keep the best 15–20 by code (Answers per Open Prompt, kind and page coverage, near-duplicates, verification) (§ Overgenerate and select) | uneven quality and coverage | measured +17–29 % generation cost, +5–15 % time; behind `GEMINI_OVERGENERATE` |
| F18 (#28, stretch) | pgvector on `source_pages`: per Open Prompt, retrieve the related pages and ask for every Answer they support, then merge and re-rank | too few Answers per Open Prompt, weak Rarity | embeddings at upload + one call per Open Prompt |

### Scorecard (F14)

`npm run generate:eval` prints one row per eval deck: what the checks keep and drop, plus the time and cost of the Gemini call. Judge F15–F18 by it, before and after.

```
npm run generate:eval                          replay eval/responses/ (no Gemini call, $0)
npm run generate:eval -- --from <dir>          replay another saved set
npm run generate:eval -- --live                one call per deck (≈ $0.20 for all four), saved to eval/runs/<time>/
  ... --save <dir>  --deck <id>[,<id>]  --no-fallback  --drops  --json
  ... --verify                                 also run the verification pass (F16), one more call per deck (≈ $0.03 for all four),
                                               saved to <save dir>/verify/
  ... --verify-from <dir>                      replay saved verifications instead ($0): eval/verify (for eval/responses)
  ... --verify-model <model>                   the verifier's model (default: GEMINI_VERIFY_MODEL, else GEMINI_FALLBACK_MODEL)
  ... --overgenerate                           F17: ask for ~25 (--live) and keep the best 15–20 with selectPrompts, after the
                                               verification pass if any; adds a Selected column. Replay: --from eval/overgenerate
                                               --verify-from eval/overgenerate/verify --overgenerate
```

`--no-fallback` also unsets the verifier's default model (`GEMINI_FALLBACK_MODEL`), so with `--verify` pass `--verify-model gemini-3.5-flash-lite` too, or the verifier runs on 3.6-flash.

- **Code change** (validate.ts, the checks): replay. It's free and the Gemini output is fixed, so any difference comes from your change.
- **Prompt change** (`game-prompt.ts`, F15–F17): `--live --no-fallback`, then compare with the baseline below. Gemini varies run to run at temperature 0.4, so treat a difference of a Prompt or two per deck as noise. The table header shows the **prompt version** (a hash of the instructions, schema and temperature); a replay says when a saved response came from a different prompt.
- **Decks** are listed in `eval/decks.json`. The course files aren't in git: put them in `eval/decks/` (gitignored) or set `EVAL_DECKS_DIR`. Ask Anton for the files. `sha256` in the manifest warns you if your copy differs. Without the files, only the seed deck can be scored; the others show "deck file missing".
- **Saved responses** (`eval/responses/<deck>.json`, ~20 KB each; since F15, from the current prompt `a6b826d6`, F15 run 2) are committed, with the model, seconds, token usage and estimated cost of the call. They quote the decks only in short evidence quotes. `--save` from `generate:check` writes the same format.
- **Cost** is an estimate: tokens × `GEMINI_PRICES_USD_PER_M` in `lib/gemini/pricing.ts` (3.6-flash: $0.75 input / $3.75 output per 1M tokens, thinking billed as output; 3.5-flash-lite: $0.30 / $2.50). Check ai.google.dev/pricing before trusting a total.

Columns: **Prompts ret → kept** (⚠ under 7, a one-document Game would fail) · **Kinds** open/cloze/definition_to_term/ordered_recall/odd_one_out · **Ans/Open** mean kept Answers per Open Prompt · **Quotes ok** kept Answers whose evidence quote is on its page · **Hints removed** by check 5, of the Hints given on cloze, definition and odd-one-out Prompts · **Dropped P / A** Prompts / Answers dropped · **Drops by reason** short codes from `dropCode` in `lib/games/scorecard.ts` · **s**, **$** for the Gemini call. With `--verify` or `--verify-from`, every other column describes what survives the verification pass, and three columns are added: **Verify removed A / P** (Answers judged unsupported / Prompts removed by the pass; these are not in Dropped P / A) and **Verify s**, **Verify $** for the verification call. With `--overgenerate`, a **Selected** column shows the Prompts `selectPrompts` chose from → kept, and the other columns describe what it kept.

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

#### F15: example Prompts (prompt version `a6b826d6`, 2026-10-04)

`GAME_SYSTEM_INSTRUCTION` now ends with an **EXAMPLES** section (four seed-fixture Prompts from `GAME_PROMPT_EXAMPLES`: open, cloze, ordered_recall, odd_one_out, as one-line JSON, labelled "not content to reuse") and a **BAD → GOOD** section: step sentences as Open Answers → ordered_recall; symbol Answers; compound "X or Y" Open Prompts; Prompts about the document ("covered in this material"); odd-one-out options the deck doesn't name; course admin; give-away Hints (aliases, words from the Answer, spelled-out acronyms). Short matching rules sit in GROUNDING, open, odd_one_out and ANSWERS. That's ~+4,700 characters (~1,100 tokens, ≈ $0.001) of input per call. `lib/modes/examples.test.ts` runs every embedded example (Dive, Leap, Blitz, Pairs) through its Mode's checks on the seed pages, so an example never shows something the checks would drop. Leap, Blitz and Pairs each got one example, one BAD → GOOD line and the course-admin rule (not measured: the scorecard is Dive-only).

`gemini-3.6-flash`, no fallback, one run per deck. Run 1 used prompt `ac43c27a` (examples + the first six pairs). Run 2 used the shipped prompt `a6b826d6` (plus the "about the document" and acronym-Hint lines) and is now the replay set in `eval/responses/`.

| Deck | Kept: baseline → run 1 → run 2 | Dropped P / A: baseline → run 1 → run 2 | Quotes ok: baseline → run 1 → run 2 |
|---|---|---|---|
| seed-graph-algorithms | 16 → 16 → 16 | 0/0 → 0/0 → 0/0 | 100% → 100% → 100% |
| cmpt354-sql-basics | 15 → 16 → 14 | 1/4 → 0/0 → 2/2 | 89% → 95% → 100% |
| cmpt225-avl-trees | 13 → 16 → 14 | 3/1 → 0/1 → 2/1 | 100% → 100% → 98% |
| ml-midterm-notes | 12 → 16 → 16 | 4/14 → 0/0 → 0/0 | 86% → 93% → 93% |
| **Total** | **56 → 64 → 60** | **8/19 → 0/1 → 4/3** | **95% → 97% → 98%** |

Run 1 (`ac43c27a`):

| Deck | Pages | Prompts ret → kept | Kinds (o/c/d/r/x) | Open | Ans/Open | Quotes ok | Hints removed | Dropped P / A | Drops by reason | s | $ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| seed-graph-algorithms (fixture) | 12 | 16 → 16 | 8/2/2/2/2 | 8 | 5.4 | 47/47 (100%) | 0/6 | 0 / 0 | – | 57 | 0.048 |
| cmpt354-sql-basics (PDF) | 94 | 16 → 16 | 8/3/2/1/2 | 8 | 4.8 | 41/43 (95%) | 0/7 | 0 / 0 | – | 109 | 0.049 |
| cmpt225-avl-trees (PPTX) | 73 | 16 → 16 | 8/2/2/2/2 | 8 | 4.5 | 40/40 (100%) | 0/6 | 0 / 1 | not-on-page 1 | 114 | 0.057 |
| ml-midterm-notes (DOCX) | 3 | 16 → 16 | 8/2/3/1/2 | 8 | 5.1 | 43/46 (93%) | 2/7 | 0 / 0 | – | 65 | 0.051 |
| **Total** | 182 | 64 → 64 | 32/9/9/6/8 | 32 | 4.9 | 171/176 (97%) | 2/26 | 0 / 1 | not-on-page 1 | 346 | 0.205 |

Run 2 (`a6b826d6`, shipped):

| Deck | Pages | Prompts ret → kept | Kinds (o/c/d/r/x) | Open | Ans/Open | Quotes ok | Hints removed | Dropped P / A | Drops by reason | s | $ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| seed-graph-algorithms (fixture) | 12 | 16 → 16 | 8/2/2/2/2 | 8 | 5.5 | 48/48 (100%) | 0/6 | 0 / 0 | – | 101 | 0.051 |
| cmpt354-sql-basics (PDF) | 94 | 16 → 14 | 8/2/2/1/1 | 8 | 5.3 | 46/46 (100%) | 0/5 | 2 / 2 | answer-dropped 2, unusable-name 2 | 65 | 0.066 |
| cmpt225-avl-trees (PPTX) | 73 | 16 → 14 | 8/3/1/1/1 | 8 | 4.6 | 40/41 (98%) | 0/5 | 2 / 1 | answer-dropped 1, missing-page 1, not-on-page 1 | 67 | 0.056 |
| ml-midterm-notes (DOCX) | 3 | 16 → 16 | 8/2/2/3/1 | 8 | 5.0 | 41/44 (93%) | 0/5 | 0 / 0 | – | 102 | 0.050 |
| **Total** | 182 | 64 → 60 | 32/9/7/7/5 | 32 | 5.1 | 175/179 (98%) | 0/21 | 4 / 3 | answer-dropped 3, unusable-name 2, missing-page 1, not-on-page 1 | 334 | 0.222 |

What changed. Read it with the noise in mind: there was one run per deck, and between run 1 and run 2 the PDF and PPTX each moved by 2 Prompts on almost the same prompt.
- **More Prompts kept, more quotes verified:** 56 → 64 / 60 kept and 95% → 97% / 98% of quotes verified. Per deck, only run 2's PDF kept fewer than the baseline (14 vs 15), which is within noise. Its two drops were the symbol cloze Prompts below.
- **The targeted faults are mostly gone.** Neither run has a "Name a step in …" Open Prompt. On the DOCX, run 2 turned K-means, KNN and decision trees into ordered_recall, and the baseline's 14 not-on-page Answer drops fell to 0. There are no course-admin Prompts on the PPTX, and every odd-one-out option is named in its deck (option-not-on-page went from 2 to 0). Open Prompts are now exactly half (32 of 64, up from 26), and kinds are more even.
- **What's still there:**
  - Symbol Answers came back once, in run 2, as cloze Prompts (`%` and `_` for LIKE). The rule says "never only symbols", but its BAD → GOOD line shows an open Prompt. The code already drops these Prompts.
  - A few "X or Y" Open Prompts remain ("Name an operator or keyword used with subqueries"), down from about 10 in the baseline.
  - Hints still lean on acronyms ("Its acronym is three letters long and starts with D") despite the new line. Check 5 can't see this, so F16's verification pass is the place to catch it.
- **The seed deck now copies the examples:** its shortest-path, Dijkstra-steps, union-find and MST odd-one-out Prompts are the examples themselves. Judge prompt changes on the three course decks.
- **Cost and latency** are the same within noise: ≈ $0.20–0.22 and 330–350 s per four-deck run. 3.6-flash often answered 503 during these runs. Each failed deck was retried 90–120 s later (up to 8 times), and failed calls aren't billed.

## Verification pass (F16)

Code checks only confirm an Answer is *mentioned* on its page. A second Gemini call per Source Document judges meaning: does the cited page show the Answer actually answers the Prompt, is the Prompt clear, and is it a reworded duplicate of an earlier one? It runs in `generateGame` right after the Mode's per-document checks (step c), for **every Mode**: the documents' calls run in parallel, like generation.

**What the verifier sees** (`verificationInput` in `lib/games/verify.ts`): only the pages something cites, then the checked Prompts as JSON: id (`P1`, `P2`, … in order), kind, text, `options`/`items` when the kind has them, and each Answer with its id (`P1.A1`), canonical, cited page and quote. The Answer is the canonical for typed kinds, the correct option for odd_one_out and multiple_choice, `True`/`False` for true_false (so Blitz's truth value is checked) and `correct order` for ordered_recall (so the order is checked).

**What it returns** (structured JSON, `VERIFY_RESPONSE_SCHEMA` in `lib/gemini/verify.ts`): per Prompt `{ id, clear, duplicate_of, reason?, answers: [{ id, reason, supports }] }`. Each Answer's `reason` (what the page says that decides it) comes **before** `supports`: asking for it first made the lite model catch a wrong option/truth value it had passed without it. Temperature 0.

**Applying it** (`applyVerdicts`, pure, unit-tested with a fake verifier):

| Verdict | Effect |
|---|---|
| `supports: false` on an Open Answer | the Answer is dropped; then **check 4 again** (fewer than 4 left → the Prompt is dropped) and **Tier assignment again** on what's left (order unchanged, rarity ranks 1…n) |
| `supports: false` on a single-answer Prompt (cloze, definition_to_term, ordered_recall, odd_one_out, multiple_choice, true_false) | the Prompt is dropped |
| `clear: false` | the Prompt is dropped |
| `duplicate_of: "Pk"` naming an **earlier, kept** Prompt | the Prompt is dropped (a pointer to itself, a later Prompt or a dropped one is ignored) |
| no verdict for a Prompt or Answer, or a malformed one | kept as it was (counted as unverified) |

Drops are reported like the code checks' (`verify: …` reasons, with the verifier's few words), so `generate:check` and `generate:eval --drops` list them. Duplicates are judged within one document; across documents check 7 still compares exact text.

**Failure never fails the Game.** `verifyDocument` never throws: if the call fails (after the shared retries and fallback, 120 s timeout per attempt) or its response isn't `{ prompts: [...] }`, every Prompt is kept unverified and `generateGame` logs `verify: kept N unverified Prompts …`. A successful pass logs the model, seconds and what it removed (never document text).

**Switch and model.** On by default; `GEMINI_VERIFY=off` (or `0`/`false`/`no`) skips it. The verifier tries `GEMINI_VERIFY_MODEL`, else `GEMINI_FALLBACK_MODEL` (`gemini-3.5-flash-lite`), then the usual `GEMINI_MODEL` → fallback. Lite was chosen because its quality held on the tests below while 3.6-flash cost 2–3× as much, took 11–31 s instead of 4–7 s, and answered 503 on 4 of 7 verification calls. In tests, a fake `generate` without a `verify` skips the pass, so DB tests never call Gemini.

### Measurements (2026-10-04)

**Real decks: before/after on the F15 replay set** (`eval/responses`, prompt `a6b826d6`; verdicts in `eval/verify/`, replay with `npm run generate:eval -- --verify-from eval/verify`):

| Deck | Prompts kept: before → after | Ans/Open | Quotes ok | Verify removed A / P | Verify s | Verify $ |
|---|---|---|---|---|---|---|
| seed-graph-algorithms | 16 → 16 | 5.5 | 100% | 0 / 0 | 6 | 0.009 |
| cmpt354-sql-basics | 14 → 14 | 5.3 | 100% | 0 / 0 | 7 | 0.008 |
| cmpt225-avl-trees | 14 → 14 | 4.6 | 98% | 0 / 0 | 6 | 0.007 |
| ml-midterm-notes | 16 → 16 | 5.0 | 93% | 0 / 0 | 6 | 0.008 |
| **Total** | **60 → 60** | 5.1 | 98% | **0 / 0** | 25 | **0.032** |

The F14 baseline responses (prompt `11c93557`) gave the same: 56 → 56 kept, 0 / 0 removed, 21 s, $0.028. Across nine four-deck runs over both sets (lite, every version of the verifier wording) the pass removed one Answer once ("bias" for "Name a variable or parameter used in gradient descent weight updating", debatable). 3.6-flash on the F15 set (three decks; the fourth answered 503) also removed nothing, in 11–31 s for $0.014–0.017 a deck. **On these decks, after F15, the generator's Answers are already right**, so the pass changes no scorecard number; it's a safety net.

**Planted errors: recall** (`eval/planted/`: the seed deck's 16 Prompts plus 9 hand-made bad ones that pass every code check; replay with `npm run generate:eval -- --from eval/planted --verify-from eval/planted/verify --deck seed-graph-algorithms --drops`). The 16 real Prompts were kept in every run (no false positives). Of the 9 planted:

| Run (verifier wording) | Planted Prompts removed | Missed |
|---|---|---|
| 1 (first wording) | 8 / 9 | the compound "Name a traversal, a shortest-path algorithm, or what Kruskal uses" |
| 2 (+ an example of a compound Prompt) | 9 / 9 | – |
| 3 (+ `reason` before `supports`) | 9 / 9 | – |
| 4 (+ a Hint check, since removed) | 8 / 9 | the odd-one-out with the wrong option marked |
| 5 (+ odd_one_out wording) | 9 / 9 | – |
| 6 (final: run 5 without the Hint check) | 8 / 9 | Kruskal and Prim for "Name an algorithm that handles negative edge weights" (its reason: "Kruskal deals with weighted graphs"; MST algorithms do accept negative weights, so the Prompt is ambiguous). The committed verdicts are this run |

On the Mode fixtures (`db/seed/graph-algorithms-modes.json`, via `generate:check --seed --mode <m> --from … --verify`): Leap 14 → 14, Pairs 16 → 16, Blitz 38 → 38 (no false positives, 3–8 s, $0.004–0.010). With planted errors (3 Leap questions given a wrong `correct_option`, 4 Blitz statements with a flipped truth value) it removed 3 / 3 and 4 / 4 once `reason` came before `supports` (2 / 3 and 3 / 4 without it).

**Cost and time:** ≈ $0.006–0.010 and 4–8 s per document with lite (Blitz's 38 statements: ≈ $0.010, 8 s), against the issue's estimate of +20 s and +$0.02. Documents verify in parallel, so a Game waits for the slowest one: generation takes 60–100 s, so this adds under 10 %.

**Not done (follow-ups):**
- **Give-away Hints** (F15's acronym Hints: "Its acronym is three letters long and starts with D"). A `hint_gives_away` verdict was tried and dropped: lite wrote "reveals the acronym length and starting letter" and still answered false for every real give-away. A code rule in check 5 (`acronym|letters|starts with`) or a stronger verifier model would do it.
- **Lite varies run to run** even at temperature 0 (8 or 9 of 9 planted Prompts removed). A second vote, or 3.6-flash when it isn't overloaded, would make it steadier at ~2–3× the cost.
- Duplicates are judged within one document only.

## Overgenerate and select (F17)

Ask Gemini for more Prompts than a Game needs and let code keep the best. **Off by default**; `GEMINI_OVERGENERATE=on` turns it on for Dive and Apogee (the only Modes with an `overgenerate` hook on their `ModeGenerator`). Per document: generate (about 25) → the Mode's checks → the verification pass (F16) → `selectPrompts` → then, across documents, check 7 and `finalize` as usual.

**The request** (`diveOvergenerateRequest` in `lib/modes/dive/generate.ts`) is Dive's with two changes made by `gameSystemInstruction(count, open)` in `lib/gemini/game-prompt.ts`: "write about 25 Prompts in total, at least 12 of them open" and "Write about 25 Prompts for this document". The default instructions are unchanged (prompt version `a6b826d6`); the overgenerate prompt is `f6987a82`.

**`selectPrompts(prompts, { verification?, min = 15, max = 20 })`** (`lib/games/select.ts`, pure, unit-tested) is greedy: each step adds the candidate with the highest score given what's already kept, and the result keeps document order.

| Part of the score | Value |
|---|---|
| Base | 1 |
| Open Prompt: Answers above 4 | +0.1 each, up to +0.8 (12+ Answers) |
| Answers whose quote isn't on its page | −0.3 × their share |
| Single-answer Prompt whose Hint check 5 removed | −0.1 |
| Verification status (F16) | trimmed (some Open Answers removed) −0.15; no verdict −0.05; verified 0 |
| Kind balance | +0.4 × (target share × (kept + 1) − kept of this kind), clamped to ±0.4. Targets: open ½, each other kind ⅛ |
| Page coverage | +0.3 × the share of its cited pages no kept Prompt cites yet |
| Similar text | −(Dice similarity of content words − 0.4) with the most similar kept Prompt, when above 0.4. Content words: normalized, question words ("name", "which", "steps", "order", …) removed, plurals folded |
| Shared Answers | −0.6 × the overlap with the most overlapping kept Prompt: Jaccard of Open Answer sets, ordered_recall steps or odd_one_out options; 1 for two cloze/definition Prompts with the same term (the same fact asked twice); 0 between an Open Prompt and a single-answer one |

A candidate whose text similarity or Answer overlap with a kept Prompt is **≥ 0.8 is a near-duplicate and is never kept**, even below 15. Above 15 kept, selection stops when the best remaining score is below 0.5. Dropped Prompts are reported as `select: near-duplicate of "…"` or `select: not among the best 20 (score x)`, so `generate:check --overgenerate` and `generate:eval --drops` list them. Answer overlap is Jaccard rather than shared/smaller so a broad and a narrow Open Prompt ("Name a graph algorithm", "Name an MST algorithm") aren't treated as duplicates.

Leap, Blitz and Pairs don't overgenerate: their kinds have no Open Answers to rank, and Pairs and Blitz already ask for more than their minimum.

### Measurements (2026-10-04)

`gemini-3.6-flash`, no fallback, verification with flash-lite, one live run each. **Before** is the F15 replay set (`eval/responses`, prompt `a6b826d6`) with its F16 verdicts. Judged on the three course decks (the seed deck copies the examples).

| Deck | Kept: before → run 1 → run 2 | Open | Ans/Open | Quotes ok | Pages cited (before → run 2) | Gen s | Gen $ | Verify s / $ |
|---|---|---|---|---|---|---|---|---|
| cmpt354-sql-basics (94 p) | 14 → 15 → **20** | 8 → 8 → 10 | 5.3 → 6.0 → 4.8 | 100% → 96% → 100% | 20 → 24 | 65 → 70 → 120 | 0.066 → 0.063 → 0.076 | 7 / 0.008 → 9 / 0.012 |
| cmpt225-avl-trees (73 p) | 14 → 20 → **20** | 8 → 6 → 10 | 4.6 → 4.5 → 4.6 | 98% → 91% → 100% | 13 → 23 | 67 → 69 → 72 | 0.056 → 0.066 → 0.073 | 6 / 0.007 → 8 / 0.012 |
| ml-midterm-notes (3 p) | 16 → 20 → **20** | 8 → 4 → 6 | 5.0 → 5.5 → 5.2 | 93% → 100% → 90% | 3 → 3 | 102 → 107 → 77 | 0.050 → 0.059 → 0.052 | 6 / 0.008 → 8 / 0.010 |
| **Course decks** | **44 → 55 → 60** | 24 → 18 → 26 | 5.0 → 5.4 → 4.8 | 97% → 96% → 97% | 36 → 50 | 233 → 246 → 269 | 0.171 → 0.188 → 0.201 | 18 / 0.023 → 24 / 0.033 |

- **Run 1** (prompt `bb7ea296`: "about 25", still "at least half open") returned 24, 16, 24, 23 Prompts. On the AVL and ML decks Gemini filled the extra slots with single-answer kinds (6 of 24 and 5 of 23 Open), so Open Prompts *fell* (24 → 18 on the course decks), and the SQL deck ignored the ask (16). On the seed deck it cost 2× (19k thinking tokens vs 8k).
- **Run 2** (shipped prompt `f6987a82`, "at least 12 of them open") returned 26, 27, 26 and kept 20 each: **+36 % Prompts** (44 → 60), Open Prompts 24 → 26 (10 of 20 on the PDF and PPTX), all five kinds on every deck, and **cited pages 33 → 47** on the PDF and PPTX. Ans/Open and quotes are unchanged within noise. Selection kept 47 of the candidates' 50 cited pages there while cutting 7 Prompts.
- **What selection removed:** real near-duplicates ("Name a category of primitive data types in SQL" after "Name an SQL primitive data type"; "Name a classification evaluation metric" after "Name an evaluation metric"; on the F15 replay set, one more on the ML deck), and above 20 the weakest of each over-represented kind (mostly extra cloze/definition Prompts on pages already covered). The verifier removed nothing in any run, as in F16.
- **Cost and time:** generation +17 % (run 2) to +29 % (run 1, incl. the seed deck's 2×), verification +43 % (more Prompts to judge; still ≈ $0.01 a document), time +6 % (run 1, four decks) and +15 % (run 2, three decks). 3.6-flash's latency swings ±40 s between identical calls (SQL: 65, 70, 120 s), so one run can't pin the time cost down; output tokens grow ~10–40 %.
- **Why off by default:** a Dive Run draws 7 Prompts, so the usual 14–16 per document already gives two Runs without repeats; overgenerating mostly adds replay variety and page coverage, for ~20 % more cost and some extra latency on an already 60–120 s wait, and run 1 showed it can cost Open Prompts. Turn it on (`GEMINI_OVERGENERATE=on`) for long decks where coverage matters. Replay its numbers for free with `npm run generate:eval -- --from eval/overgenerate --verify-from eval/overgenerate/verify --overgenerate` (run 2, course decks only).

## Split generation (F30)

**Why:** a Game took 60–120 s, almost all of it the one generation call per document. The time is decode, not reading: each call writes ~8–11k thinking tokens and ~4–5k output tokens one after another, and input size doesn't predict it (the 4k-token decks took ~100 s, the 14k-token SQL deck 65 s; § Scorecard). Verification adds 4–8 s. So the call is split into parallel calls that each write part of the Prompts, and a Game waits for the slower one.

**How:** with `GEMINI_SPLIT` on (the default; `off`/`0`/`false`/`no` sends one call), Dive and Apogee send **two calls per document at the same time**, both with every page:

| Call | Asks for | Schema `kind` enum |
|---|---|---|
| Open | 8–10 Prompts, all "open" (12–14 when overgenerating) | `["open"]` |
| Other | 7–10 Prompts using cloze, definition_to_term, ordered_recall and odd_one_out, some of each the material supports (11–13 when overgenerating) | the other four |

Both get Dive's full instructions; only the PROMPT KINDS line changes (`gameOpenSystemInstruction` / `gameOtherSystemInstruction` in `lib/gemini/game-prompt.ts`, built by the same `gameInstruction(task)` as the single call, whose text and version `a6b826d6` are unchanged). Splitting **by kind, not by pages**, keeps Open Prompts' Answers coming from the whole deck (pages split in half would mean fewer Answers per Open Prompt), and the schema enum keeps each call to its own kinds. The two `prompts` arrays are joined (`joinResponses`) and everything after it is unchanged: the Mode's checks, check 7, verification, selection.

**Failure:** each call has the usual retries and fallback. If one call still fails, the other's Prompts are kept and `generateGame` logs `one of 2 calls failed, keeping the others' Prompts`; the Game fails only when both fail (the usual generator message) or too few Prompts survive.

**Code:** `ModeGenerator.split?: GenerationRequest[]` and `overgenerate.split?` (`lib/modes/generation.ts`); `generationPlan(generator, { overgenerate, split })` picks the requests; `generateSplit(requests, call)` runs them with `Promise.allSettled`. Leap, Pairs and Blitz have no `split` hook yet and send one call. Their items are single facts tied to one page, so splitting their pages in two would be the natural way to add one. `generateGame`'s `split` option overrides the env; with a fake `generate` (tests) it defaults to off. `generate:eval --split` and `generate:check --split` send the split calls; their saved `run` has the wall time, summed usage and cost, and each call in `run.parts`.

### Measurements (2026-10-04)

MEASUREMENTS_PLACEHOLDER

## Code layout

| File | Responsibility |
|---|---|
| `app/api/modules/[moduleId]/games/route.ts` | POST create Game, GET list the Module's Games |
| `app/api/games/[gameId]/route.ts` | GET status/details, DELETE |
| `lib/gemini.ts`, `lib/gemini/game-prompt.ts` | Client (`generateDocumentPrompts(title, pages, request?)`) and Dive's instructions |
| `lib/games/generate-game.ts` | `generateGame` steps a–f, for every Mode |
| `lib/games/validate.ts` | Dive's zod schema + checks 1–7 (pure; shared checks 1–3 and 7, Dive's 4–6 + Tiers) |
| `lib/modes/generation.ts`, `lib/modes/generators.ts` | `ModeGenerator`, shared checks (`quoteOnPage`, …), `generatorFor(mode)` |
| `lib/modes/<mode>/generate.ts` | Each Mode's request and checks (Dive's plugs in `game-prompt.ts` + `validate.ts`) |
| `lib/games/queries.ts`, `lib/games/types.ts` | Game reads for the routes (`getPlayerGame`, `listModuleGames`), client-safe `GameSummary` |
| `lib/modes/index.ts` | `MODES`, `ModeId`, `isModeId` |
| `scripts/generate-check.ts` | `npm run generate:check`: tune a Mode's prompt on a local file |
| `scripts/seed.mts`, `db/seed/graph-algorithms-modes.json` | The demo Module's Games in every Mode, run through each Mode's own checks |
| `scripts/generate-eval.ts`, `eval/decks.json`, `eval/responses/` | `npm run generate:eval`: the F14 scorecard over the eval decks (§ Scorecard), Dive's generator |
| `lib/games/scorecard.ts`, `lib/gemini/pricing.ts` | `scoreDocument` (optionally with saved verdicts), `formatScorecardTable`; Gemini price constants and `estimateCostUsd` (scripts only) |
| `lib/gemini/verify.ts` | The verification call (F16): instructions, schema, `geminiVerifyCall`, `verificationEnabled()` (`GEMINI_VERIFY`), `verifyModels()` |
| `lib/games/verify.ts` | Pure verification logic: `verificationInput`, `applyVerdicts` (drops, check 4 + Tiers again, per-Prompt `statuses`), `verifyDocument` (never throws) |
| `lib/modes/generation.ts` (F30 part) | `splitEnabled()` (`GEMINI_SPLIT`), `generationPlan`, `generateSplit`, `joinResponses`; Dive's split requests are `diveSplitRequests(counts)` in `lib/modes/dive/generate.ts` |
| `lib/games/select.ts` | F17: `selectPrompts` (keep the best 15–20 per document), `quality`, `textSimilarity`, `answerOverlap`; `overgenerateEnabled()` (`GEMINI_OVERGENERATE`) is in `lib/modes/generation.ts` |
| `eval/overgenerate/` | F17 run 2 (overgenerate prompt `f6987a82`, course decks) and its verdicts |
| `eval/verify/`, `eval/planted/` | Saved verifications of `eval/responses/`; the planted-errors response and its verification (§ Verification pass) |
| `lib/scoring/tiers.ts` | Tier table + Open Prompt tier assignment |
