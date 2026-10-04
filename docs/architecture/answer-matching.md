# Answer matching

Decides whether a typed guess is one of a Prompt's Answers. It runs on the server, inside Tiger Data's Postgres, on every guess. No AI is involved: the Answer list is closed and doc-only, so matching only has to cope with spelling.

This applies to typed Prompts: Open, cloze and definition-to-term. Put-in-order and odd-one-out submit structured choices and are checked by direct comparison (see `run-and-scoring.md`).

## 1. Normalize (TypeScript, one shared function)

`lib/matching/normalize.ts` is used **both** when storing keys at generation time and when matching guesses. It must stay the single implementation; never re-implement it in SQL.

```
normalize(s):
  1. Unicode NFKD, strip combining marks      "Borůvka" → "Boruvka"
  2. lowercase
  3. curly quotes → straight; "&" → " and "
  4. drop a trailing possessive "'s" on each word    "dijkstra's" → "dijkstra"
  5. drop remaining apostrophes
  6. every char not [a-z0-9] → space            "bellman-ford" → "bellman ford"
  7. collapse runs of spaces, trim
```

There's deliberately no stemming or plural stripping. Variants come from Gemini's Aliases plus the typo step, so "negative" vs "negatives" is either an Alias or within typo distance.

## 2. Stored keys

At generation time, every canonical name and Alias becomes one row in `answer_keys`:

```
answer_keys(prompt_id, normalized, answer_id, exact_only)
  UNIQUE (prompt_id, normalized)    -- generation check #3 guarantees no cross-Answer collisions
```

`exact_only` is copied from the Answer, so the SQL needs no join.

## 3. Match algorithm

```
guess = normalize(raw)
if guess == "": wrong (no time penalty; the UI shouldn't even submit)

step 1 (exact):  SELECT answer_id FROM answer_keys WHERE prompt_id = $1 AND normalized = $2
                 → hit: MATCH (method = 'exact')

step 2 (typo):   budget = 0 if len(guess) < 5, 1 if 5..8, 2 if ≥ 9
                 if budget == 0: NO MATCH
                 SELECT DISTINCT answer_id
                   FROM answer_keys
                  WHERE prompt_id = $1
                    AND NOT exact_only
                    AND abs(length(normalized) - length($2)) <= $3
                    AND levenshtein_less_equal(normalized, $2, $3) <= $3
                 → exactly 1 answer_id: MATCH (method = 'typo')
                 → 0: NO MATCH
                 → ≥ 2: NO MATCH (method = 'ambiguous'). Crediting the wrong Answer is worse than a few lost seconds.
```

`levenshtein_less_equal` comes from the `fuzzystrmatch` extension (`CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;` in the first migration). It stops counting once it passes the budget, so it's cheap. A Prompt has at most a few dozen keys, so no trigram index is needed.

### Worked examples ("Name a graph algorithm")

| Raw guess | Normalized | Result |
|---|---|---|
| `Dijkstra's` | `dijkstra` | exact → Dijkstra |
| `bellman fod` | `bellman fod` | typo, distance 1, budget 2 → Bellman-Ford |
| `breadth first search` | `breadth first search` | exact (Alias) → BFS |
| `dfs` | `dfs` | exact → DFS. If it were `bfs` with a typo, the length-3 budget is 0, so no fuzzy BFS/DFS confusion is possible. |
| `shortest path algorithm` | `shortest path algorithm` | no match → wrong guess (−3 s) |
| `A*` | `a` | no match. Off-syllabus guesses aren't accepted; the reveal screen lists the valid Answers. |

## 4. What the matcher returns

```ts
type MatchResult =
  | { matched: true;  answerId: string; method: 'exact' | 'typo'; distance: number }
  | { matched: false; method: 'none' | 'ambiguous' };
```

The Run engine turns this into points and the time penalty (`run-and-scoring.md`) and logs it to `guess_events` (`data-model.md`).

## 5. Code layout

| File | Responsibility |
|---|---|
| `lib/matching/normalize.ts` | `normalize()`, pure, unit-tested with the table above |
| `lib/matching/match-guess.ts` | `matchGuess(promptId, raw): Promise<MatchResult>`, the two SQL steps |

Write unit tests for `normalize` and integration tests for `matchGuess` against a seeded Prompt, using the worked examples above as test cases.
