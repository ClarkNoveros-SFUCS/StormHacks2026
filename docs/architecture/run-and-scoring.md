# Run engine and scoring

A **Run** is one play-through of a Game, by the rules of its Game Mode (`game-modes.md`). **The server owns the clock and the score.** The browser only renders state the server returns, and never receives an Answer, Hint, correct option, truth value or pairing before it's earned or revealed.

Shared by every Mode: the lifecycle (create → `start-prompt` → play → finished → Reveal), the server-owned clock with its grace, "any late request closes what expired first", `guess_events` logging, `runs.score`, Personal Best and Mastery, and the `RunSummary` every finished Run produces. Each Mode brings its rule values, scoring, pass bar, state and Reveal shapes, and sometimes its own play routes.

| Mode | Play routes | Engine | Rules |
|---|---|---|---|
| Dive, Apogee | `guess`, `hint` | `lib/runs/engines/dive.ts` | `lib/modes/dive/rules.ts` |
| Leap | `answer { optionId }`, `lifeline` | `lib/runs/engines/leap.ts` | `lib/modes/leap/rules.ts` |
| Pairs | `pair { termId, definitionId }` | `lib/runs/engines/pairs.ts` | `lib/modes/pairs/rules.ts` |
| Blitz | `answer { value }` | `lib/runs/engines/blitz.ts` | `lib/modes/blitz/rules.ts` |

A play route sent to a Run of another Mode returns 409 (`"A Leap Run doesn't take /guess"`).

# Dive and Apogee

Apogee plays by exactly these rules (it shares Dive's engine, rules module and generator); only its look differs. `RunState.mode` tells them apart.

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

## Dive API

| Method + path | Body | Returns |
|---|---|---|
| `POST /api/runs/[runId]/guess` | `{ text, position? }` or `{ order: string[], position? }` or `{ option, position? }` | `GuessResponse { result: GuessResult, state: DiveRunState }` |
| `POST /api/runs/[runId]/hint` | — | `HintResponse { hint, state: DiveRunState }` |

The shared routes (create, state, start-prompt, timeout, reveal) are in [§ API, every Mode](#api-every-mode).

```ts
type DiveRunState = {
  mode: 'dive' | 'apogee';
  runId: string; gameId: string; status: 'in_progress' | 'finished' | 'abandoned';
  position: number;            // 1..7 (7 once finished)
  promptCount: number;         // always 7
  score: number;
  serverNow: string;           // ISO; the client computes clock offset = serverNow − Date.now()
  prompt: {
    kind: 'open' | 'cloze' | 'definition_to_term' | 'ordered_recall' | 'odd_one_out';
    text: string;
    tier?: Tier;               // single-answer kinds only: the Tier it scores on before a Hint drop (never on open)
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

## Dive Reveal (after the Run)

`DiveReveal` and `RevealPrompt` in `lib/runs/types.ts`. For each of the 7 Prompts:
- what the Player answered (`yourAnswer`) and the points, with `stale` (Open Prompts only: points below the Answer's Tier value, so Staleness reduced them) and `hintUsed` (set even if the Prompt then scored 0)
- **Open Prompts:** every Answer, most obvious first, with its Tier, found or missed, and Evidence: the Source Document's id (`documentId`, for the file viewer link `/modules/[moduleId]?doc=<documentId>&page=<n>`), filename (`documentTitle`; there's no separate title), page number and `evidence_quote`
- **Single-answer Prompts:** the correct Answer, the `explanation`, and the Evidence page

**Pass bar:** score ≥ 150 (−1,500 m).

# Leap

10 multiple-choice questions; answer right and the avatar jumps to the next platform.

| Rule | Value |
|---|---|
| Questions per Run | 10 `multiple_choice` Prompts, drawn at random, no repeats |
| Time per question | 15 s, **one answer** (right or wrong, the question ends) |
| Correct | `round((100 + speedBonus) × multiplier × (50/50 used ? 0.5 : 1))`; `speedBonus = round(50 × msLeft / 15000)`, 0–50 |
| Streak multiplier | by correct answers in a row, this one included: 1–2 → ×1, 3–4 → ×1.5, 5+ → ×2 |
| Wrong or timeout | 0 points, lose 1 **Heart**, streak resets |
| Hearts | 3; at 0 the Run ends at once with outcome `fell` (the rest are never reached) |
| 50/50 **Lifeline** | once per Run: the server names 2 wrong options to hide (stable per question); that question's points are halved; a hidden option can't be submitted (400) |
| Max score | 150 + 150 + 225 + 225 + 6 × 300 = 2,550 |
| Pass bar | ≥ 7 correct and outcome `cleared` (not fallen) |

Flow: `start-prompt` starts the current question's clock and only then does the state carry `question` (text + options A–D, shuffled once per Run), so it can't be read off the clock → `answer { optionId, position? }` → the result names `correctOptionId` and the `explanation` → `start-prompt` for the next. `/timeout` within 250 ms of the deadline, or any request after deadline + 500 ms, closes the question as a timeout (−1 Heart). The 50/50 sets `run_prompts.hint_used` on that question and is logged on its `guess_events` row as `hint_used`.

```ts
type LeapRunState = {
  mode: 'leap'; runId; gameId; status; score; serverNow;
  position: number; promptCount: 10;
  hearts: number; maxHearts: 3; streak: number;
  nextMultiplier: number;        // what the next correct answer gets: 1, 1.5 or 2
  correctCount: number; lifelineAvailable: boolean;
  outcome: 'cleared' | 'fell' | null;
  startedAt: string | null; deadlineAt: string | null;           // the current question's clock
  question: { text; options: { id: 'A'|'B'|'C'|'D'; text }[]; hiddenOptionIds: ('A'|'B'|'C'|'D')[] } | null;
};
type LeapAnswerResult =
  | { correct: true; points; speedBonus; multiplier; halved: boolean; correctOptionId; explanation }
  | { correct: false; correctOptionId; heartsLeft; explanation }
  | { correct: false; timedOut: true };
```

Reveal (`LeapReveal.questions`): all 10 questions with the options as shown, your option, the correct option, outcome (`null` = never reached), points, whether the 50/50 was used and what it hid, the explanation and the Evidence (page + quote for the correct option).

# Pairs

Match terms to definitions against the clock, two columns (terms left, definitions right; click one, then the other).

| Rule | Value |
|---|---|
| Run | 2 **Boards** × 6 pairs: 12 `definition_to_term` Prompts with 12 different terms, drawn at random |
| Clock | 60 s per Board, started by `start-prompt` |
| Match | +50; the pair stays matched |
| Mismatch | −10 (the Run's score never goes below 0, so at 0 it costs nothing) and −2 s off the Board's clock |
| Board ends | all 6 matched (**cleared**: +5 per whole second left) or the clock runs out (unmatched pairs score 0) |
| After Board 1 | Board 2 always follows, cleared or not |
| Max score | just under 1,200 (2 × (300 matches + up to 295 time bonus)) |
| Pass bar | both Boards cleared (outcome `cleared`) |

The client sees each Board's 6 terms and 6 definitions shuffled, under opaque ids (`t…`, `d…`: hashes of the Prompt id, which the client never sees), so the state carries no pairing; the server checks each `pair { termId, definitionId, board? }`. Matches are logged to `guess_events` (correct, `matched_answer_id` = the term, so Mastery counts it); mismatches are logged against the clicked term's Prompt with `points = −(what was lost)`. `current` (the Board) is null until `start-prompt`, so a Board can't be studied off the clock. A Board that runs out ends at its deadline, even if the request that noticed came later.

```ts
type PairsRunState = {
  mode: 'pairs'; runId; gameId; status; score; serverNow;
  board: number; boardCount: 2; pairsPerBoard: 6; boardsCleared: number;
  outcome: 'cleared' | 'time_up' | null;
  startedAt: string | null; deadlineAt: string | null; mistakes: number;      // the current Board
  current: {
    terms: { id; text; matched }[]; definitions: { id; text; matched }[];
    matches: { termId; definitionId }[];
  } | null;
};
type PairResult =
  | { correct: true; points: 50; termId; definitionId; boardCleared: boolean; timeBonus: number }
  | { correct: false; pointsLost: number; penaltyMs: 2000 }
  | { correct: false; timedOut: true };
```

Reveal (`PairsReveal.boards`): per Board, cleared, mistakes, time bonus, seconds taken, and every pair (term, definition, matched, points, explanation, Evidence).

# Blitz

60 seconds of rapid true/false.

| Rule | Value |
|---|---|
| Deck | the Game's `true_false` Prompts in random order, up to 120 (a Game has ≥ 30) |
| Clock | one 60 s clock for the Run, started by `start-prompt`; statements are dealt one at a time |
| Correct | +10; once 5 are already in a row (**Combo** ≥ 5), each further correct scores 20 |
| Wrong | 0, Combo resets, −3 s off the clock |
| Ends | when the clock runs out (`time_up`), or early if the whole deck is answered (`deck_cleared`) |
| Pass bar | ≥ 150 points |

Each `answer { value: boolean, position? }` returns the truth and the explanation, and the state already carries the next statement. `run_prompts.started_at` marks a statement as dealt; the one on screen when time runs out is closed as `timeout`.

```ts
type BlitzRunState = {
  mode: 'blitz'; runId; gameId; status; score; serverNow;
  position: number;            // statements dealt so far (0 before start)
  deckSize: number; combo: number; nextPoints: 10 | 20; correctCount: number; wrongCount: number;
  outcome: 'time_up' | 'deck_cleared' | null;
  startedAt: string | null; deadlineAt: string | null;
  statement: { text: string } | null;
};
type BlitzAnswerResult =
  | { correct: true; points; isTrue; combo; explanation }
  | { correct: false; isTrue; penaltyMs: 3000; explanation }
  | { correct: false; timedOut: true };
```

Reveal (`BlitzReveal.statements`): every statement that was dealt, in order, with its truth, your answer (`null` if time ran out on it), points, explanation and Evidence.

# Every Mode

## API (all under Clerk auth; the Run must belong to the caller, the Game to the caller or be public)

| Method + path | Body | Returns | Modes |
|---|---|---|---|
| `POST /api/games/[gameId]/runs` | — | `{ runId }` (abandons the caller's other in-progress Runs) | all |
| `GET /api/runs/[runId]` | — | `RunState` | all |
| `POST /api/runs/[runId]/start-prompt` | — | `RunState`: starts the current clock (Prompt, Board, or Blitz's 60 s); idempotent | all |
| `POST /api/runs/[runId]/timeout` | — | `RunState`: the client's countdown hit zero; checked against the server clock | all |
| `GET /api/runs/[runId]/reveal` | — | `Reveal` (409 until finished) | all |
| `POST /api/runs/[runId]/guess` | `GuessBody` | `GuessResponse` | Dive, Apogee |
| `POST /api/runs/[runId]/hint` | — | `HintResponse` | Dive, Apogee |
| `POST /api/runs/[runId]/answer` | Leap `{ optionId, position? }` · Blitz `{ value, position? }` | `LeapAnswerResponse` · `BlitzAnswerResponse` | Leap, Blitz |
| `POST /api/runs/[runId]/lifeline` | optional `{ position }` | `LifelineResponse { hiddenOptionIds, state }` | Leap |
| `POST /api/runs/[runId]/pair` | `{ termId, definitionId, board? }` | `PairResponse` | Pairs |

Errors are `{ error }` with 400 (bad body, empty or over-long guess, an option/order/card that isn't on screen, a hidden option), 401 (signed out), 403 (a locked Course Topic's practice Game, F22), 404 (not yours and not public, or a malformed id) and 409 (wrong state: Game not ready or too few Prompts, the clock hasn't started or the item already closed, Run finished or abandoned, no Hint, 50/50 already used, a route of another Mode, Reveal before finish).

Every play request may carry the `position` (or `board`) it was meant for: if that item already closed, the request gets 409 instead of landing on the next one. A request that arrives after the deadline plus 500 ms grace is ignored and returns `{ correct: false, timedOut: true }` with the state that closing it produced.

**The types live in `lib/runs/types.ts`** (client-safe, import them in the UI) and are the source of truth: `RunState = DiveRunState | LeapRunState | PairsRunState | BlitzRunState`, and `Reveal` likewise, all discriminated on `mode`. `assertMode(state, 'leap')` narrows one; `ModeRunState<'apogee'>` is `DiveRunState`. Every state has `runId`, `gameId`, `mode`, `status`, `score` and `serverNow`.

## Run summary and pass bars

Every finished Run has a Mode-agnostic `RunSummary` (in `Reveal.summary`, and from `getRunSummary(tx, playerId, runId)` for server code such as XP and leaderboards):

```ts
{ mode, score, finishedAt, outcome, stats }
// dive/apogee: outcome 'finished';             stats { prompts, correct, hintsUsed }
// leap:        outcome 'cleared' | 'fell';      stats { questions, correct, wrong, timeouts, heartsLeft, bestStreak, lifelineUsed }
// pairs:       outcome 'cleared' | 'time_up';   stats { boardsCleared, matches, mistakes, timeBonus }
// blitz:       outcome 'time_up' | 'deck_cleared'; stats { answered, correct, wrong, bestCombo }
```

`Reveal.passed` applies the Mode's **pass bar** (`passedRun(summary)` in `lib/modes/rules.ts`, used by Courses): Dive/Apogee score ≥ 150; Leap ≥ 7 correct and not fallen; Pairs both Boards cleared; Blitz ≥ 150 points.

`Reveal.topic` (F22) is set when the Game is a Course Topic's practice Game: `{ courseSlug, courseTitle, topicSlug, topicNumber, topicTitle, passed, passedNow, passedBefore, nextTopicSlug, unlockedNext, courseFinished }`, else `null`. See `courses.md`.

## Progress in every Reveal

`Reveal.progress: { personalBest, isNewPersonalBest, masteryBefore, masteryAfter }` comes from `runProgress()` in `lib/progress.ts` (F07), the same for every Mode (Mastery as percentages, rounded down). `personalBest` is the best as of this Run: the higher of this score and the previous best. Both use the Run's own timestamps, so an old Reveal keeps showing what was true then:
- **Previous best:** the highest score of this Player's other finished Runs on the Game that finished before this one (`null` if none). **New Personal Best** = score > previous best (or > 0 when there is none). A tie isn't a new best.
- **Mastery before:** Answers found by correct guesses made before this Run started. **Mastery after:** Answers found up to the moment this Run finished, so this Run's guesses are included. Abandoned Runs count toward both. In Leap, Pairs and Blitz a correct answer finds that Prompt's one Answer row.

## Code layout

| File | Responsibility |
|---|---|
| `lib/runs/run-engine.ts` | Public commands, dispatching on the Game's Mode: `createRun`, `getRunState`, `startPrompt`, `timeoutPrompt`, `guess`, `revealHint`, `answer`, `pair`, `applyLifeline`, `getReveal`, `getRunSummary`, `RunError`. Commands take `(tx, playerId, …, now)` and lock the run row (`createRun` locks the player row); `getReveal`/`getRunSummary` read without a lock. Every command that can finish a Run goes through `play()`, which runs `afterFinish()` once in the same transaction: F21 `onRunFinished` (XP, Badges) and F22 `recordTopicRun` (`courses.md`). `createRun` accepts public Games. |
| `lib/runs/engines/common.ts` | `ModeEngine` interface, `lockRun`/`readRun` (with `games.mode`), `saveRun`, `logGuess`, Evidence lookup, Reveal progress |
| `lib/runs/engines/dive.ts` | Dive and Apogee (moved unchanged from the old `run-engine.ts`) |
| `lib/runs/engines/leap.ts`, `pairs.ts`, `blitz.ts` | The other Modes' state machines; their per-Run state lives in `runs.mode_state` |
| `lib/runs/types.ts` | Client-safe API types (unions on `mode`) |
| `lib/runs/client.ts` | Browser fetch helpers (`runApi.create/state/startPrompt/timeout/guess/hint/reveal`, `RunApiError`, `msUntil` with the server clock offset) |
| `lib/runs/http.ts` | `runRoute()`: auth, one transaction, the server clock, `RunError` → HTTP status |
| `lib/runs/shuffle.ts` | Seeded shuffles (seed `runId:promptId`, so a reload shows the same order and the client can't undo it) |
| `lib/modes/<mode>/rules.ts` | Each Mode's constants, scoring and `passed()`: pure, unit-tested. Dive's re-exports `lib/scoring/points.ts` |
| `lib/scoring/tiers.ts` | Tier table and `assignOpenTiers(n)` (shared with generation) |
| `app/api/games/[gameId]/runs/route.ts`, `app/api/runs/[runId]/**/route.ts` | Thin HTTP wrappers over `run-engine.ts` |
