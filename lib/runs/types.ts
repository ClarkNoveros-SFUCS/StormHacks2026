// Shapes the Run API returns. Plain types, safe to import from client components (F09).
// Spec: docs/architecture/run-and-scoring.md
import type { Tier } from "@/lib/scoring/tiers";

export type { Tier };
export type PromptKind = "open" | "cloze" | "definition_to_term" | "ordered_recall" | "odd_one_out";
export type RunStatus = "in_progress" | "finished" | "abandoned";
export type PromptOutcome = "correct" | "wrong" | "timeout";

export type RunState = {
  runId: string;
  status: RunStatus;
  position: number; //               1..7, the current Prompt (7 once finished)
  promptCount: number; //            always 7
  score: number;
  serverNow: string; //              ISO; clock offset = Date.parse(serverNow) − Date.now()
  prompt: {
    kind: PromptKind;
    text: string;
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

export type GuessResponse = { result: GuessResult; state: RunState };
export type HintResponse = { hint: string; state: RunState };

export type Evidence = { documentTitle: string; pageNumber: number; quote: string | null } | null;

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

export type Reveal = {
  runId: string;
  gameId: string;
  score: number;
  prompts: RevealPrompt[];
  // Personal Best and Mastery before → after. Filled in by F07 (lib/progress.ts); null until then.
  progress: {
    personalBest: number;
    isNewPersonalBest: boolean;
    masteryBefore: number; //        0–100
    masteryAfter: number;
  } | null;
};
