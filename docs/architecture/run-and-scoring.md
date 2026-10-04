# Run engine and scoring

**These are the Dive Game Mode's rules** (`game-modes.md`). The lifecycle, server-owned clock and `guess_events` logging are shared by every Mode; the rule values and scoring are Dive's.

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

The one-submission rule for put-in-order and odd-one-out was chosen because with 4 options, retries would make odd-one-out trivial. It's confirmed and built (F06), but `CONTEXT.md` doesn't state it yet.

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
                               │  409 unless the Game is 'ready' and has ≥ 7 Prompts
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
  │  "next": score += points, current += 1; after position 7 →            │
  │          run 'finished', finished_at = now                            │
  └───────────────────────────────────────────────────────────────────────┘
```

Every request that arrives after a Prompt's deadline closes that Prompt as `timeout` first, then acts. So a Player who closes the tab can't freeze the clock.

Edge cases the client needs to know:
- **`start-prompt`** that closes an expired Prompt doesn't start the next one's clock in the same call. The client shows the timeout, then calls `start-prompt` again.
- **A wrong guess whose −3 s runs the clock out** closes the Prompt as `timeout` immediately. The result is still `{ correct: false, penaltyMs }`, but the returned `RunState` has already moved to the next Prompt.
- **A guess that arrives after the deadline plus grace** returns `{ correct: false, timedOut: true }`; the guess is ignored.
- **Send `position` with every guess.** A guess for a Prompt that has already closed then gets 409 instead of landing on the next Prompt.
- **`/hint`** needs the Prompt to have started, and calling it again returns the same Hint. A `/hint` after the deadline plus grace returns 409 "That Prompt timed out", and because the error rolls back the transaction, the timeout isn't saved: the next request closes the Prompt instead.
- **`/timeout`** sent early (more than 250 ms before the deadline) changes nothing. On a finished or abandoned Run it returns the `RunState` (like `GET /api/runs/[runId]`), where `start-prompt`, `guess` and `hint` return 409.

**Abandoned Runs** (a new Run started before this one finished) never count toward Personal Best. Their correct guesses **do** count toward Mastery and Staleness, because that recall really happened.

## API (all under Clerk auth; the Run must belong to the caller)

| Method + path | Body | Returns |
|---|---|---|
| `POST /api/games/[gameId]/runs` | — | `{ runId }` |
| `GET /api/runs/[runId]` | — | `RunState` |
| `POST /api/runs/[runId]/start-prompt` | — | `RunState` |
| `POST /api/runs/[runId]/guess` | `{ text, position? }` or `{ order: string[], position? }` or `{ option, position? }` | `{ result: GuessResult, state: RunState }` |
| `POST /api/runs/[runId]/hint` | — | `{ hint, state: RunState }` |
| `POST /api/runs/[runId]/timeout` | — | `RunState` |
| `GET /api/runs/[runId]/reveal` | — | `Reveal` (only once the Run is finished) |

Errors are `{ error }` with 400 (bad body, empty or over-long guess, an order or option that doesn't match the choices), 401 (signed out), 404 (not yours, or a malformed id) and 409 (wrong state: Game not ready, Prompt not started or already closed, Run finished or abandoned, no Hint, Reveal before finish).

**The types live in `lib/runs/types.ts`** (client-safe, import them in the UI) and are the source of truth. The main shapes:

```ts
type RunState = {
  runId: string; status: 'in_progress' | 'finished' | 'abandoned';
  position: number;            // 1..7 (7 once finished)
  promptCount: number;         // always 7
  score: number;
  serverNow: string;           // ISO; the client computes clock offset = serverNow − Date.now()
  prompt: {
    kind: 'open' | 'cloze' | 'definition_to_term' | 'ordered_recall' | 'odd_one_out';
    text: string;
    options?: string[];        // odd_one_out, shuffled
    items?: string[];          // ordered_recall, shuffled (never already in the correct order)
    hintAvailable: boolean; hintUsed: boolean;
    hint?: string;             // only once hintUsed, so a reload keeps it
    startedAt: string | null;  // null until POST /start-prompt
    deadlineAt: string | null;
  } | null;                    // null once the Run is finished or abandoned
};

type GuessResult =
  | { correct: true;  points: number; answer: string; tier: Tier; stale: boolean }
  | { correct: false; penaltyMs: 3000 }                          // typed Prompts
  | { correct: false; answer: string; correctOrder?: string[] }  // one-shot Prompts: the right answer, Prompt closed
  | { correct: false; timedOut: true };                          // arrived too late: closed as a timeout
```

On a correct single-answer guess, `tier` is the Prompt's own Tier, before any Hint drop; `points` already includes the drop. `RunState.prompt` doesn't carry the Tier.

The client renders the countdown from `deadlineAt` and the clock offset. When it hits zero, the client calls `/timeout`, and the server double-checks the time.

## Reveal (after the Run)

`Reveal` and `RevealPrompt` in `lib/runs/types.ts`. For each of the 7 Prompts:
- what the Player answered (`yourAnswer`) and the points, with `stale` (Open Prompts only: points below the Answer's Tier value, so Staleness reduced them) and `hintUsed` (set even if the Prompt then scored 0)
- **Open Prompts:** every Answer, most obvious first, with its Tier, found or missed, and Evidence: the Source Document's filename (`documentTitle`; there's no separate title), page number and `evidence_quote`
- **Single-answer Prompts:** the correct Answer, the `explanation`, and the Evidence page

It also shows the Run total and whether it's a new Personal Best, plus the Game's Mastery before → after.

These come from `runProgress()` in `lib/progress.ts` (F07), returned as `Reveal.progress: { personalBest, isNewPersonalBest, masteryBefore, masteryAfter }` (Mastery as percentages, rounded down). `personalBest` is the best as of this Run: the higher of this score and the previous best. Both use the Run's own timestamps, so an old Reveal keeps showing what was true then:
- **Previous best:** the highest score of this Player's other finished Runs on the Game that finished before this one (`null` if none). **New Personal Best** = score > previous best (or > 0 when there is none). A tie isn't a new best.
- **Mastery before:** Answers found by correct guesses made before this Run started. **Mastery after:** Answers found up to the moment this Run finished, so this Run's guesses are included. Abandoned Runs count toward both.

## Code layout

| File | Responsibility |
|---|---|
| `lib/runs/run-engine.ts` | State machine: `createRun`, `getRunState`, `startPrompt`, `guess`, `revealHint`, `timeoutPrompt`, `getReveal`, `RunError`. Commands take `(tx, playerId, …, now)` and lock the run row (`createRun` locks the player row); `getReveal(tx, playerId, runId)` reads without a lock. |
| `lib/runs/types.ts` | Client-safe API types: `RunState`, `GuessBody`, `GuessResult`, `Reveal`, … |
| `lib/runs/http.ts` | `runRoute()`: auth, one transaction, the server clock, `RunError` → HTTP status |
| `lib/runs/shuffle.ts` | Seeded shuffles for options and items (seed `runId:promptId`, so a reload shows the same order) |
| `lib/scoring/points.ts` | `openPoints(tier, earlierRuns)`, `singlePoints(tier, hintUsed)`: pure, unit-tested |
| `lib/scoring/tiers.ts` | Tier table and `assignOpenTiers(n)` (shared with generation) |
| `app/api/games/[gameId]/runs/route.ts`, `app/api/runs/[runId]/**/route.ts` | Thin HTTP wrappers over `run-engine.ts` |
