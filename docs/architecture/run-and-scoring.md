# Run engine and scoring

A **Run** is one play-through of a Game: 7 Prompts, 25 seconds each. **The server owns the clock and the score.** The browser only renders state the server returns, and never receives an Answer or Hint before it's earned or revealed.

## Rules (from `CONTEXT.md`, restated for implementers)

| Rule | Value |
|---|---|
| Prompts per Run | 7, drawn at random from the Game, no repeats, any mix of types |
| Time per Prompt | 25 s |
| Typed Prompts (open, cloze, definition) | the first correct guess ends the Prompt; a wrong guess costs **3 s**; guess as often as time allows |
| Put-in-order, odd-one-out | **one submission**: correct scores, wrong scores 0, and either way the Prompt ends |
| Timeout | 0 points; the Run continues to the next Prompt |
| Hint | single-answer Prompts only, only if `hint` isn't null; drops one Tier; a hinted common Prompt is worth 5 |
| Staleness | Open Prompts only: halve per earlier Run in which you scored that same Answer on that Prompt, rounded down, minimum 1 |
| Max Run score | 700 (7 × rare) |

> The one-submission rule for put-in-order and odd-one-out isn't in `CONTEXT.md` yet. It was chosen because with 4 options, retries would make odd-one-out trivial. Confirm it with the team before building.

## Points

```ts
const TIER_POINTS = { common: 10, solid: 25, deep: 60, rare: 100 };
const TIER_BELOW  = { rare: 'deep', deep: 'solid', solid: 'common', common: null };

// Open Prompt
earlierRuns = count(distinct run_id) from guess_events
              where player_id = me and prompt_id = p and matched_answer_id = a
                and is_correct and run_id <> currentRun
points = max(1, floor(TIER_POINTS[answer.tier] / 2 ** earlierRuns))

// Single-answer Prompt
points = !hintUsed ? TIER_POINTS[prompt.tier]
       : TIER_BELOW[prompt.tier] ? TIER_POINTS[TIER_BELOW[prompt.tier]]
       : 5
```

Examples: BFS (common) scores 10 → 5 → 2 → 1 → 1 across Runs. A hinted "deep" fill-in-the-blank scores 25.

## Run lifecycle (server state machine)

```
                    POST /api/games/[gameId]/runs
                               │  pick 7 random prompts; INSERT runs + run_prompts(position 1..7)
                               │  mark this Player's other in_progress runs 'abandoned'
                               ▼
  ┌──────────────────── run: in_progress, current = 1 ────────────────────┐
  │                                                                       │
  │  POST …/start-prompt     run_prompt.started_at = now,                 │
  │  (idempotent)            deadline_at = now + 25 s                     │
  │                                                                       │
  │  POST …/guess            if now > deadline_at + 500 ms grace → timeout │
  │                          typed: matchGuess()                          │
  │                            correct → points, outcome 'correct', next  │
  │                            wrong   → deadline_at -= 3 s; still open   │
  │                          one-shot: compare → 'correct' | 'wrong', next│
  │                                                                       │
  │  POST …/hint             single-answer + hint exists → hint_used=true │
  │                                                                       │
  │  POST …/timeout          if now ≥ deadline_at − 250 ms → outcome      │
  │                          'timeout', 0 points, next                    │
  │                                                                       │
  │  "next": current += 1; after position 7 → run 'finished',             │
  │          finished_at = now, score = sum(run_prompts.points)           │
  └───────────────────────────────────────────────────────────────────────┘
```

Every request that arrives after a Prompt's deadline closes that Prompt as `timeout` first, then acts. So a Player who closes the tab can't freeze the clock.

**Abandoned Runs** (a new Run started before this one finished) never count toward Personal Best. Their correct guesses **do** count toward Mastery and Staleness, because that recall really happened.

## API (all under Clerk auth; the Run must belong to the caller)

| Method + path | Body | Returns |
|---|---|---|
| `POST /api/games/[gameId]/runs` | — | `{ runId }` |
| `GET /api/runs/[runId]` | — | `RunState` (below) |
| `POST /api/runs/[runId]/start-prompt` | — | `RunState` |
| `POST /api/runs/[runId]/guess` | `{ text }` or `{ order: string[] }` or `{ option }` | `GuessResult` + `RunState` |
| `POST /api/runs/[runId]/hint` | — | `{ hint }` + `RunState` |
| `POST /api/runs/[runId]/timeout` | — | `RunState` |
| `GET /api/runs/[runId]/reveal` | — | `Reveal` (only once the Run is finished) |

```ts
type RunState = {
  runId: string; status: 'in_progress' | 'finished' | 'abandoned';
  position: number;            // 1..7
  score: number;
  serverNow: string;           // ISO; the client computes clock offset = serverNow − Date.now()
  prompt: {
    kind: 'open' | 'cloze' | 'definition_to_term' | 'ordered_recall' | 'odd_one_out';
    text: string;
    options?: string[];        // odd_one_out, shuffled
    items?: string[];          // ordered_recall, shuffled (never already in the correct order)
    hintAvailable: boolean; hintUsed: boolean;
    startedAt: string | null; deadlineAt: string | null;
  };
};

type GuessResult =
  | { correct: true;  points: number; answer: string; tier: Tier; stale: boolean }
  | { correct: false; penaltyMs: 3000 }              // typed Prompts
  | { correct: false; answer: string };              // one-shot Prompts: show the right answer
```

The client renders the countdown from `deadlineAt` and the clock offset. When it hits zero, the client calls `/timeout`, and the server double-checks the time.

## Reveal (after the Run)

For each of the 7 Prompts:
- what the Player answered and the points, flagged if Staleness or a Hint reduced them
- **Open Prompts:** every Answer grouped by Tier, marked found or missed, each with the Source Document title, page number and `evidence_quote`
- **Single-answer Prompts:** the correct Answer, the `explanation`, and the Evidence page

It also shows the Run total and whether it's a new Personal Best, plus the Game's Mastery before → after.

## Code layout

| File | Responsibility |
|---|---|
| `lib/runs/run-engine.ts` | State machine: create, startPrompt, guess, hint, timeout, advance |
| `lib/scoring/points.ts` | `openPoints(tier, earlierRuns)`, `singlePoints(tier, hintUsed)`: pure, unit-tested |
| `lib/scoring/tiers.ts` | Tier table (shared with generation) |
| `app/api/runs/[runId]/**/route.ts` | Thin HTTP wrappers over `run-engine.ts` |
