import "server-only";
import {
  LEAP_HEARTS, LEAP_QUESTION_MS, LEAP_QUESTIONS, leapPoints, streakMultiplier,
} from "@/lib/modes/leap/rules";
import { seededShuffle } from "../shuffle";
import type {
  LeapAnswerResponse, LeapAnswerResult, LeapOptionId, LeapOutcome, LeapReveal, LeapRevealQuestion, LeapRunState,
  LifelineResponse, PromptOutcome, RunSummary,
} from "../types";
import {
  bodyObject, drawPrompts, EARLY_TIMEOUT_MS, evidenceLookup, GRACE_MS, iso, logGuess, optionalInt, RunError, saveRun,
  type ModeEngine, type RevealBase, type RunRow, type Tx,
} from "./common";

// Leap's state machine. Spec: run-and-scoring.md § Leap. 10 multiple-choice questions, 15 s
// each, one answer each. Correct: 100 + speed bonus × streak multiplier. Wrong or timeout: lose
// a Heart; at 0 Hearts the Run ends ("fell"). One 50/50 per Run hides two wrong options and
// halves that question's points. The correct option is only sent after the answer.

type LeapState = {
  hearts: number;
  streak: number;
  bestStreak: number;
  correct: number;
  wrong: number;
  timeouts: number;
  /** The position the 50/50 was used on, or null. */
  lifelinePosition: number | null;
  outcome: LeapOutcome | null;
};

type Row = RunRow<LeapState>;

type Question = {
  position: number;
  prompt_id: string;
  started_at: Date | null;
  deadline_at: Date | null;
  hint_used: boolean; //    the 50/50 was used on this question
  text: string;
  options: string[];
  correct_answer_id: string;
  correct_option: string;
  tier: string;
  explanation: string | null;
};

const OPTION_IDS: LeapOptionId[] = ["A", "B", "C", "D"];

export const leapEngine: ModeEngine = {
  draw: (tx, gameId) => drawPrompts(tx, gameId, ["multiple_choice"], LEAP_QUESTIONS, LEAP_QUESTIONS, "multiple-choice Prompts"),
  initialState: (): LeapState => ({
    hearts: LEAP_HEARTS, streak: 0, bestStreak: 0, correct: 0, wrong: 0, timeouts: 0, lifelinePosition: null, outcome: null,
  }),

  async state(tx, run, now) {
    await settle(tx, run as Row, now);
    return buildState(tx, run as Row, now);
  },

  async start(tx, run, now) {
    // Closing an expired question doesn't also start the next one's clock (like Dive)
    if (!(await settle(tx, run as Row, now))) {
      await tx`
        UPDATE run_prompts SET started_at = ${now}, deadline_at = ${new Date(now.getTime() + LEAP_QUESTION_MS)}
         WHERE run_id = ${run.id} AND position = ${run.current_position} AND started_at IS NULL`;
    }
    return buildState(tx, run as Row, now);
  },

  async timeout(tx, r, now) {
    const run = r as Row;
    if (run.status === "in_progress" && !(await settle(tx, run, now))) {
      const q = await loadQuestion(tx, run);
      if (q.deadline_at && now.getTime() >= q.deadline_at.getTime() - EARLY_TIMEOUT_MS) {
        await closeQuestion(tx, run, "timeout", 0, null, now);
      }
    }
    return buildState(tx, run, now);
  },

  summary: async (_tx, run) => leapSummary(run as Row),
  reveal: (tx, run, base) => leapReveal(tx, run as Row, base),
};

// ---------------------------------------------------------------------------------------
// POST /answer { optionId, position? } and POST /lifeline

export async function leapAnswer(tx: Tx, r: RunRow, body: unknown, now: Date): Promise<LeapAnswerResponse> {
  const run = r as Row;
  const b = bodyObject(body);
  if (typeof b.optionId !== "string" || !OPTION_IDS.includes(b.optionId as LeapOptionId)) {
    throw new RunError(400, "optionId must be A, B, C or D");
  }
  const position = optionalInt(b, "position");
  if (await settle(tx, run, now)) {
    return { result: { correct: false, timedOut: true }, state: await buildState(tx, run, now) };
  }
  if (position !== undefined && position !== run.current_position) throw new RunError(409, "That question is already closed");
  const q = await loadQuestion(tx, run);
  if (!q.started_at || !q.deadline_at) throw new RunError(409, "Question hasn't started");

  const options = shownOptions(run, q);
  const chosen = options.find((o) => o.id === b.optionId)!;
  if (q.hint_used && hiddenIds(run, q).includes(chosen.id)) throw new RunError(400, "That option was removed by the 50/50");
  const correctOptionId = options.find((o) => o.text === q.correct_option)!.id;
  const correct = chosen.text === q.correct_option;

  let result: LeapAnswerResult;
  if (correct) {
    const streak = run.mode_state.streak + 1;
    const { points, speedBonus, multiplier } = leapPoints(q.deadline_at.getTime() - now.getTime(), streak, q.hint_used);
    result = { correct: true, points, speedBonus, multiplier, halved: q.hint_used, correctOptionId, explanation: q.explanation };
  } else {
    result = { correct: false, correctOptionId, heartsLeft: run.mode_state.hearts - 1, explanation: q.explanation };
  }
  const points = result.correct ? result.points : 0;
  await logGuess(tx, {
    run, promptId: q.prompt_id, position: q.position, startedAt: q.started_at, raw: JSON.stringify(chosen.text), normalized: null,
    method: "choice", answerId: correct ? q.correct_answer_id : null, distance: null, correct, points,
    hintUsed: q.hint_used, tier: correct ? (q.tier as never) : null, now,
  });
  await closeQuestion(tx, run, correct ? "correct" : "wrong", points, correct ? q.correct_answer_id : null, now);
  return { result, state: await buildState(tx, run, now) };
}

export async function leapLifeline(tx: Tx, r: RunRow, body: unknown, now: Date): Promise<LifelineResponse> {
  const run = r as Row;
  const position = body === undefined || body === null ? undefined : optionalInt(bodyObject(body), "position");
  if (await settle(tx, run, now)) throw new RunError(409, "That question timed out");
  if (position !== undefined && position !== run.current_position) throw new RunError(409, "That question is already closed");
  const q = await loadQuestion(tx, run);
  if (!q.started_at) throw new RunError(409, "Question hasn't started");
  if (run.mode_state.lifelinePosition !== null && run.mode_state.lifelinePosition !== q.position) {
    throw new RunError(409, "You've already used your 50/50");
  }
  if (!q.hint_used) {
    await tx`UPDATE run_prompts SET hint_used = true WHERE run_id = ${run.id} AND position = ${q.position}`;
    q.hint_used = true;
    run.mode_state.lifelinePosition = q.position;
    await saveRun(tx, run, now);
  }
  return { hiddenOptionIds: hiddenIds(run, q), state: await buildState(tx, run, now) };
}

// ---------------------------------------------------------------------------------------
// Internals

async function loadQuestion(tx: Tx, run: Row): Promise<Question> {
  const [q] = await tx<Question[]>`
    SELECT rp.position, rp.prompt_id, rp.started_at, rp.deadline_at, rp.hint_used,
           p.text, p.options, p.tier, p.explanation, a.id AS correct_answer_id, a.canonical AS correct_option
      FROM run_prompts rp JOIN prompts p ON p.id = rp.prompt_id
      JOIN LATERAL (SELECT id, canonical FROM answers WHERE prompt_id = p.id LIMIT 1) a ON true
     WHERE rp.run_id = ${run.id} AND rp.position = ${run.current_position}`;
  return q;
}

/** The options in the order this Run shows them, lettered A–D. Seeded by the Prompt id, which the client never sees. */
function shownOptions(run: Row, q: { prompt_id: string; options: string[] }) {
  return seededShuffle(q.options, `${run.id}:${q.prompt_id}`).map((text, i) => ({ id: OPTION_IDS[i], text }));
}

/** The two wrong options a 50/50 removes on this question (stable for the Run). */
function hiddenIds(run: Row, q: { prompt_id: string; options: string[]; correct_option: string; hint_used: boolean }): LeapOptionId[] {
  if (!q.hint_used) return [];
  const wrong = shownOptions(run, q).filter((o) => o.text !== q.correct_option).map((o) => o.id);
  return seededShuffle(wrong, `${run.id}:${q.prompt_id}:5050`).slice(0, 2).sort();
}

/** Any request after the deadline (plus grace) closes the question as a timeout first. */
async function settle(tx: Tx, run: Row, now: Date): Promise<boolean> {
  if (run.status !== "in_progress") return false;
  const q = await loadQuestion(tx, run);
  if (!q.deadline_at || now.getTime() <= q.deadline_at.getTime() + GRACE_MS) return false;
  await closeQuestion(tx, run, "timeout", 0, null, now);
  return true;
}

/** Ends the current question; finishes the Run after the 10th or when the Hearts run out. */
async function closeQuestion(tx: Tx, run: Row, outcome: PromptOutcome, points: number, answerId: string | null, now: Date) {
  await tx`
    UPDATE run_prompts SET ended_at = ${now}, outcome = ${outcome}, points = ${points}, answer_id = ${answerId}
     WHERE run_id = ${run.id} AND position = ${run.current_position}`;
  const s = run.mode_state;
  run.score += points;
  if (outcome === "correct") {
    s.correct += 1;
    s.streak += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
  } else {
    s.hearts -= 1;
    s.streak = 0;
    if (outcome === "wrong") s.wrong += 1;
    else s.timeouts += 1;
  }
  if (s.hearts <= 0) {
    s.outcome = "fell";
    await saveRun(tx, run, now, true);
  } else if (run.current_position >= LEAP_QUESTIONS) {
    s.outcome = "cleared";
    await saveRun(tx, run, now, true);
  } else {
    run.current_position += 1;
    await saveRun(tx, run, now);
  }
}

async function buildState(tx: Tx, run: Row, now: Date): Promise<LeapRunState> {
  const s = run.mode_state;
  const base: LeapRunState = {
    mode: "leap", runId: run.id, gameId: run.game_id, status: run.status, score: run.score, serverNow: now.toISOString(),
    position: run.current_position, promptCount: LEAP_QUESTIONS, hearts: s.hearts, maxHearts: LEAP_HEARTS,
    streak: s.streak, nextMultiplier: streakMultiplier(s.streak + 1), correctCount: s.correct,
    lifelineAvailable: s.lifelinePosition === null, outcome: s.outcome, startedAt: null, deadlineAt: null, question: null,
  };
  if (run.status !== "in_progress") return base;
  const q = await loadQuestion(tx, run);
  if (!q.started_at) return base;
  return {
    ...base,
    // The 50/50 is "available" on the question it was used on, so a repeat call is harmless
    lifelineAvailable: s.lifelinePosition === null || s.lifelinePosition === q.position,
    startedAt: iso(q.started_at),
    deadlineAt: iso(q.deadline_at),
    question: { text: q.text, options: shownOptions(run, q), hiddenOptionIds: hiddenIds(run, q) },
  };
}

function leapSummary(run: Row): RunSummary {
  const s = run.mode_state;
  return {
    mode: "leap",
    score: run.score,
    finishedAt: run.finished_at!.toISOString(),
    outcome: s.outcome ?? (s.hearts <= 0 ? "fell" : "cleared"),
    stats: {
      questions: LEAP_QUESTIONS, correct: s.correct, wrong: s.wrong, timeouts: s.timeouts, heartsLeft: Math.max(0, s.hearts),
      bestStreak: s.bestStreak, lifelineUsed: s.lifelinePosition !== null,
    },
  };
}

async function leapReveal(tx: Tx, run: Row, base: RevealBase): Promise<LeapReveal> {
  const rows = await tx<(Question & { outcome: PromptOutcome | null; points: number; evidence_page_id: string | null; evidence_quote: string | null })[]>`
    SELECT rp.position, rp.prompt_id, rp.started_at, rp.deadline_at, rp.hint_used, rp.outcome, rp.points,
           p.text, p.options, p.tier, p.explanation, a.id AS correct_answer_id, a.canonical AS correct_option,
           coalesce(a.evidence_page_id, p.evidence_page_id) AS evidence_page_id, a.evidence_quote
      FROM run_prompts rp JOIN prompts p ON p.id = rp.prompt_id
      JOIN LATERAL (SELECT id, canonical, evidence_page_id, evidence_quote FROM answers WHERE prompt_id = p.id LIMIT 1) a ON true
     WHERE rp.run_id = ${run.id} ORDER BY rp.position`;
  const evidence = await evidenceLookup(tx, rows.map((r) => r.evidence_page_id));
  const chosen = new Map(
    (await tx<{ position: number; raw_text: string }[]>`
      SELECT DISTINCT ON (position) position, raw_text FROM guess_events
       WHERE player_id = ${run.player_id} AND run_id = ${run.id} AND created_at >= ${run.started_at}
       ORDER BY position, created_at DESC`).map((g) => [g.position, JSON.parse(g.raw_text) as string]),
  );
  const questions: LeapRevealQuestion[] = rows.map((q) => {
    const options = shownOptions(run, q);
    const yours = chosen.get(q.position);
    return {
      position: q.position,
      text: q.text,
      options,
      yourOptionId: options.find((o) => o.text === yours)?.id ?? null,
      correctOptionId: options.find((o) => o.text === q.correct_option)!.id,
      outcome: q.outcome,
      points: q.points,
      lifelineUsed: q.hint_used,
      hiddenOptionIds: hiddenIds(run, q),
      explanation: q.explanation,
      evidence: evidence(q.evidence_page_id, q.evidence_quote),
    };
  });
  return { ...base, mode: "leap", questions };
}
