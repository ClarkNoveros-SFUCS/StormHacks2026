// Shapes the Run API returns. Plain types, safe to import from client components.
// Spec: docs/architecture/run-and-scoring.md
//
// Every Mode shares the lifecycle (POST /api/games/[gameId]/runs → start-prompt → play →
// finished → GET reveal), the server-owned clock and the error shape `{ error }`. What differs
// per Mode is the state, the play routes and the Reveal, so RunState, Reveal and RunSummary are
// discriminated unions on `mode`. Narrow with `switch (state.mode)`.
//
//   Mode            play routes                              state           reveal
//   dive, apogee    POST guess, POST hint                    DiveRunState    DiveReveal
//   leap            POST answer { optionId }, POST lifeline  LeapRunState    LeapReveal
//   pairs           POST pair { termId, definitionId }       PairsRunState   PairsReveal
//   blitz           POST answer { value }                    BlitzRunState   BlitzReveal
//   arena           POST answer { optionId } (a hit)         ArenaRunState   ArenaReveal
//
// Shared by all: GET /api/runs/[runId] (state), POST start-prompt (starts the current clock:
// a Prompt, a Pairs Board, or Blitz's one 60 s clock; idempotent), POST timeout (the client's
// countdown hit zero; the server checks its own clock), GET reveal (409 until finished).
//
// Clocks: every state has `serverNow`. Compute offset = Date.parse(serverNow) − Date.now() and
// render countdowns from the `deadlineAt` fields. Answers are never sent before they're earned:
// no correct option, truth value or pairing appears in a state, only in results and the Reveal.
import type { DiveFamilyModeId, ModeId, PromptKind } from "@/lib/modes";
import type { Tier } from "@/lib/scoring/tiers";

export type { DiveFamilyModeId, ModeId, PromptKind, Tier };
export type RunStatus = "in_progress" | "finished" | "abandoned";
export type PromptOutcome = "correct" | "wrong" | "timeout";

/**
 * The page in a Source Document that backs an Answer. Null if the page is gone.
 * `documentId` lets the Reveal link into the Module's file viewer (`/modules/[moduleId]?doc=<id>&page=<n>`).
 */
export type Evidence = { documentId: string; documentTitle: string; pageNumber: number; quote: string | null } | null;

/** Fields every RunState has. */
type RunStateBase = {
  runId: string;
  gameId: string;
  status: RunStatus;
  score: number;
  /** ISO; clock offset = Date.parse(serverNow) − Date.now() */
  serverNow: string;
};

// =========================================================================================
// Dive and Apogee (same rules; Apogee only looks different)

export type DiveRunState = RunStateBase & {
  mode: DiveFamilyModeId;
  position: number; //               1..7, the current Prompt (7 once finished)
  promptCount: number; //            always 7
  prompt: {
    kind: PromptKind;
    text: string;
    /** Single-answer kinds only: the Tier this Prompt scores on (before a Hint drop). Never on open. */
    tier?: Tier;
    options?: string[]; //           odd_one_out, shuffled
    items?: string[]; //             ordered_recall, shuffled, never already in the correct order
    hintAvailable: boolean;
    hintUsed: boolean;
    hint?: string; //                only once hintUsed, so a reload keeps it
    startedAt: string | null; //     null until POST /start-prompt
    deadlineAt: string | null;
  } | null; //                       null once the Run is finished or abandoned
};

// POST /guess body: exactly one of text / order / option. `position` is optional but
// recommended: a guess meant for an already-closed Prompt is then refused (409) instead of
// landing on the next one.
export type GuessBody =
  | { text: string; position?: number } //       open, cloze, definition_to_term
  | { order: string[]; position?: number } //    ordered_recall
  | { option: string; position?: number }; //    odd_one_out

export type GuessResult =
  | { correct: true; points: number; answer: string; tier: Tier; stale: boolean }
  | { correct: false; penaltyMs: 3000 } //                          typed Prompts; still open unless the clock ran out
  | { correct: false; answer: string; correctOrder?: string[] } //  one-shot Prompts: the right answer, Prompt closed
  | { correct: false; timedOut: true }; //                          arrived after the deadline: closed as a timeout, guess ignored

export type GuessResponse = { result: GuessResult; state: DiveRunState };
export type HintResponse = { hint: string; state: DiveRunState };

export type RevealPrompt = {
  position: number;
  kind: PromptKind;
  text: string;
  outcome: PromptOutcome | null;
  points: number;
  hintUsed: boolean;
  stale: boolean; //                 points reduced by Staleness
  yourAnswer: string | null; //      the matched Answer, else the last thing submitted
  // Open Prompts: every Answer, most obvious first
  answers?: { answer: string; tier: Tier; found: boolean; evidence: Evidence }[];
  // Single-answer Prompts
  tier?: Tier;
  correctAnswer?: string; //         ordered_recall: the items joined with " → "
  correctOrder?: string[]; //        ordered_recall
  explanation?: string | null;
  evidence?: Evidence;
};

// =========================================================================================
// Leap: 10 multiple-choice questions, 15 s each, one try, 3 Hearts, one 50/50 Lifeline

export type LeapOptionId = "A" | "B" | "C" | "D";

export type LeapRunState = RunStateBase & {
  mode: "leap";
  position: number; //               1..10, the current question (last one answered once finished)
  promptCount: number; //            10
  hearts: number; //                 3 → 0; at 0 the Run ends with outcome "fell"
  maxHearts: number; //              3
  streak: number; //                 correct answers in a row so far
  /** The multiplier the next correct answer gets: 1, 1.5 (3+ in a row) or 2 (5+ in a row). */
  nextMultiplier: number;
  correctCount: number;
  /** True until the Run's one 50/50 has been used. */
  lifelineAvailable: boolean;
  /** Set once finished: "cleared" (all 10 answered) or "fell" (hearts ran out). */
  outcome: LeapOutcome | null;
  /** The current question's clock. Both null until POST /start-prompt. deadlineAt = startedAt + 15 s. */
  startedAt: string | null;
  deadlineAt: string | null;
  /**
   * The current question, only while its clock runs: null before POST /start-prompt (so it
   * can't be read off the clock) and once the Run is over. Flow: start-prompt → answer → show
   * the result → start-prompt for the next one.
   */
  question: {
    text: string;
    /** Shuffled once per Run (stable across reloads). The correct one is never marked. */
    options: { id: LeapOptionId; text: string }[];
    /** The two wrong options the 50/50 removed on this question; [] if not used here. */
    hiddenOptionIds: LeapOptionId[];
  } | null;
};

export type LeapAnswerBody = { optionId: LeapOptionId; position?: number };

export type LeapAnswerResult =
  | {
      correct: true;
      points: number; //             (100 + speedBonus) × multiplier, halved after a 50/50, rounded
      speedBonus: number; //         0–50, linear on time left
      multiplier: number; //         1, 1.5 or 2
      halved: boolean; //            the 50/50 was used on this question
      correctOptionId: LeapOptionId;
      explanation: string | null;
    }
  | { correct: false; correctOptionId: LeapOptionId; heartsLeft: number; explanation: string | null }
  | { correct: false; timedOut: true }; // arrived after the deadline: counted as a timeout (−1 heart)

export type LeapAnswerResponse = { result: LeapAnswerResult; state: LeapRunState };
export type LifelineResponse = { hiddenOptionIds: LeapOptionId[]; state: LeapRunState };

export type LeapRevealQuestion = {
  position: number;
  text: string;
  options: { id: LeapOptionId; text: string }[]; //   as shown in the Run
  yourOptionId: LeapOptionId | null; //               null on a timeout or an unplayed question
  correctOptionId: LeapOptionId;
  outcome: PromptOutcome | null; //                   null: never reached (the Run ended first)
  points: number;
  lifelineUsed: boolean;
  hiddenOptionIds: LeapOptionId[];
  explanation: string | null;
  evidence: Evidence;
};

// =========================================================================================
// Pairs: 2 Boards × 6 pairs, 60 s per Board

export type PairsRunState = RunStateBase & {
  mode: "pairs";
  board: number; //                  1..2, the current Board (last one once finished)
  boardCount: number; //             2
  pairsPerBoard: number; //          6
  boardsCleared: number;
  outcome: PairsOutcome | null; //   set once finished
  /** The current Board's clock. Both null until POST /start-prompt. 60 s, minus 2 s per mismatch. */
  startedAt: string | null;
  deadlineAt: string | null;
  /** Mismatches on the current Board. */
  mistakes: number;
  /**
   * The current Board, only while its clock runs: null before POST /start-prompt (so it can't
   * be studied off the clock) and once the Run is over. After a Board ends, call start-prompt
   * again for the next one.
   */
  current: {
    /** Shuffled; ids are opaque and differ between terms and definitions, so they reveal no pairing. */
    terms: { id: string; text: string; matched: boolean }[];
    definitions: { id: string; text: string; matched: boolean }[];
    /** Pairs found so far on this Board. */
    matches: { termId: string; definitionId: string }[];
  } | null;
};

export type PairBody = { termId: string; definitionId: string; board?: number };

export type PairResult =
  | {
      correct: true;
      points: number; //             50
      termId: string;
      definitionId: string;
      boardCleared: boolean; //      all 6 matched: the Board is over and the next needs start-prompt
      timeBonus: number; //          on a cleared Board: 5 per whole second left; else 0
    }
  | { correct: false; pointsLost: number; penaltyMs: number } // −10 (never below a score of 0) and −2 s
  | { correct: false; timedOut: true }; //                      arrived after the Board's deadline

export type PairResponse = { result: PairResult; state: PairsRunState };

export type PairsRevealBoard = {
  board: number;
  cleared: boolean;
  mistakes: number;
  timeBonus: number;
  /** Seconds the Board took (to clearing, or the full clock). Null if it never started. */
  seconds: number | null;
  pairs: {
    term: string;
    definition: string;
    matched: boolean;
    points: number;
    explanation: string | null;
    evidence: Evidence;
  }[];
};

// =========================================================================================
// Blitz: one 60 s clock, true/false statements dealt one at a time

export type BlitzRunState = RunStateBase & {
  mode: "blitz";
  /** How many statements have been dealt so far (the current one included). */
  position: number;
  /** Statements available in this Run's deck (≥ 30); the Run ends early if all are answered. */
  deckSize: number;
  combo: number; //                  correct in a row
  /** Points the next correct answer scores: 10, or 20 once combo ≥ 5. */
  nextPoints: number;
  correctCount: number;
  wrongCount: number;
  outcome: BlitzOutcome | null; //   set once finished
  startedAt: string | null; //       null until POST /start-prompt starts the 60 s
  deadlineAt: string | null; //      startedAt + 60 s, minus 3 s per wrong answer
  /** The statement to judge now: null before POST /start-prompt and once the Run is over. */
  statement: { text: string } | null;
};

export type BlitzAnswerBody = { value: boolean; position?: number };

export type BlitzAnswerResult =
  | { correct: true; points: number; isTrue: boolean; combo: number; explanation: string | null }
  | { correct: false; isTrue: boolean; penaltyMs: number; explanation: string | null } // combo resets
  | { correct: false; timedOut: true }; // the clock had already run out: the Run is finished

export type BlitzAnswerResponse = { result: BlitzAnswerResult; state: BlitzRunState };

export type BlitzRevealStatement = {
  position: number;
  text: string;
  isTrue: boolean;
  yourAnswer: boolean | null; //     null: dealt but not answered before time ran out
  correct: boolean;
  points: number;
  explanation: string | null;
  evidence: Evidence;
};

// =========================================================================================
// Arena: 10 multiple-choice questions as targets in a first-person room, 20 s each. A hit is
// an answer: the right target closes the question; a wrong one shatters (−3 s, −25 on that
// question's points) and the question stays open until the right hit or the clock runs out.

export type ArenaRunState = RunStateBase & {
  mode: "arena";
  position: number; //               1..10, the current question (the last one once finished)
  promptCount: number; //            10
  streak: number; //                 right questions in a row (a wrong hit resets it)
  /** The multiplier the next right hit gets: 1, 1.5 (3+ in a row) or 2 (5+ in a row). */
  nextMultiplier: number;
  correctCount: number;
  /** Wrong hits over the whole Run so far. */
  wrongHits: number;
  /** "cleared" once all 10 are closed. */
  outcome: ArenaOutcome | null;
  /** The current question's clock. Both null until POST /start-prompt. 20 s, minus 3 s per wrong hit. */
  startedAt: string | null;
  deadlineAt: string | null;
  /** The current question, only while its clock runs (null before start-prompt and once over). */
  question: {
    text: string;
    /** Shuffled once per Run (stable across reloads). The right one is never marked. */
    options: { id: LeapOptionId; text: string }[];
    /** Targets already shot down on this question (all wrong). */
    shatteredOptionIds: LeapOptionId[];
  } | null;
};

/** POST /answer for Arena: the target that was hit. */
export type ArenaHitBody = { optionId: LeapOptionId; position?: number };

export type ArenaHitResult =
  | {
      correct: true;
      points: number; //             max(25, round((100 + speedBonus) × multiplier) − 25 × wrongHits)
      speedBonus: number; //         0–50, linear on time left
      multiplier: number; //         1, 1.5 or 2
      wrongHits: number; //          wrong hits on this question before the right one
      correctOptionId: LeapOptionId;
      explanation: string | null;
    }
  | {
      correct: false;
      optionId: LeapOptionId; //     the target that shattered
      penaltyMs: number; //          3000, off this question's clock
      /** True when the penalty ran the clock out: the question closed as a timeout. */
      closed: boolean;
    }
  | { correct: false; timedOut: true }; // arrived after the deadline: closed as a timeout, hit ignored

export type ArenaHitResponse = { result: ArenaHitResult; state: ArenaRunState };

export type ArenaRevealQuestion = {
  position: number;
  text: string;
  options: { id: LeapOptionId; text: string }[]; //   as shown in the Run
  /** Every target hit on this question, in order (wrong ones, then the right one if found). */
  hits: { optionId: LeapOptionId; correct: boolean; msIntoQuestion: number }[];
  correctOptionId: LeapOptionId;
  outcome: PromptOutcome | null; //                   correct | timeout; null: never reached
  points: number;
  explanation: string | null;
  evidence: Evidence;
};

// =========================================================================================
// Every Mode

export type RunState = DiveRunState | LeapRunState | PairsRunState | BlitzRunState | ArenaRunState;

/** The body of POST /answer: Leap and Arena send an optionId, Blitz a value. */
export type AnswerBody = LeapAnswerBody | BlitzAnswerBody | ArenaHitBody;
export type AnswerResponse = LeapAnswerResponse | BlitzAnswerResponse | ArenaHitResponse;

export type LeapOutcome = "cleared" | "fell";
export type PairsOutcome = "cleared" | "time_up"; //   cleared = both Boards cleared
export type BlitzOutcome = "time_up" | "deck_cleared";
export type ArenaOutcome = "cleared"; //               every question closed (hit or timed out)

/**
 * What every Mode produces when a Run finishes, so XP, leaderboards and Course passes can be
 * Mode-agnostic. `passed` (in the Reveal) applies the Mode's pass bar to it.
 */
export type RunSummary =
  | {
      mode: DiveFamilyModeId; score: number; finishedAt: string; outcome: "finished";
      stats: { prompts: number; correct: number; hintsUsed: number };
    }
  | {
      mode: "leap"; score: number; finishedAt: string; outcome: LeapOutcome;
      stats: { questions: number; correct: number; wrong: number; timeouts: number; heartsLeft: number; bestStreak: number; lifelineUsed: boolean };
    }
  | {
      mode: "pairs"; score: number; finishedAt: string; outcome: PairsOutcome;
      stats: { boardsCleared: number; matches: number; mistakes: number; timeBonus: number };
    }
  | {
      mode: "blitz"; score: number; finishedAt: string; outcome: BlitzOutcome;
      stats: { answered: number; correct: number; wrong: number; bestCombo: number };
    }
  | {
      mode: "arena"; score: number; finishedAt: string; outcome: ArenaOutcome;
      /** Accuracy is correct / (correct + wrongHits); shots that hit no target never reach the server. */
      stats: { questions: number; correct: number; timeouts: number; wrongHits: number; bestStreak: number };
    };

/** Personal Best and Mastery before → after (lib/progress.ts), the same for every Mode. */
export type RevealProgress = {
  personalBest: number; //         as of this Run: max(this score, earlier best)
  isNewPersonalBest: boolean; //   beat every earlier finished Run (a tie doesn't count)
  masteryBefore: number; //        0–100, rounded down
  masteryAfter: number;
} | null; //                       null only if the Run has no finished_at

type RevealBase = {
  runId: string;
  gameId: string;
  score: number;
  summary: RunSummary;
  /** Whether the Run meets its Mode's pass bar (used by Courses). */
  passed: boolean;
  progress: RevealProgress;
};

export type DiveReveal = RevealBase & { mode: DiveFamilyModeId; prompts: RevealPrompt[] };
export type LeapReveal = RevealBase & { mode: "leap"; questions: LeapRevealQuestion[] };
export type PairsReveal = RevealBase & { mode: "pairs"; boards: PairsRevealBoard[] };
/** Only statements that were dealt, in the order they were shown. */
export type BlitzReveal = RevealBase & { mode: "blitz"; statements: BlitzRevealStatement[] };
export type ArenaReveal = RevealBase & { mode: "arena"; questions: ArenaRevealQuestion[] };

export type Reveal = DiveReveal | LeapReveal | PairsReveal | BlitzReveal | ArenaReveal;

/** The state type of one Mode: `ModeRunState<"apogee">` is DiveRunState. */
export type ModeRunState<M extends ModeId> = M extends DiveFamilyModeId ? DiveRunState : Extract<RunState, { mode: M }>;

/** Narrowing helper: `state` as the given Mode's state, or a TypeError. */
export function assertMode<M extends RunState["mode"]>(state: RunState, ...modes: M[]): ModeRunState<M> {
  if (!(modes as string[]).includes(state.mode)) throw new TypeError(`Expected a ${modes.join("/")} Run, got ${state.mode}`);
  return state as ModeRunState<M>;
}
