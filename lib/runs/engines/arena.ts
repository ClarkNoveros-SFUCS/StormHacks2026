import "server-only";
import {
  ARENA_PENALTY_MS, ARENA_QUESTION_MS, ARENA_QUESTIONS, arenaPoints, streakMultiplier,
} from "@/lib/modes/arena/rules";
import { seededShuffle } from "../shuffle";
import type {
  ArenaHitResponse, ArenaHitResult, ArenaOutcome, ArenaReveal, ArenaRevealQuestion, ArenaRunState, LeapOptionId,
  PromptOutcome, RunSummary,
} from "../types";
import {
  bodyObject, drawPrompts, EARLY_TIMEOUT_MS, evidenceLookup, GRACE_MS, iso, logGuess, optionalInt, RunError, saveRun,
  type ModeEngine, type RevealBase, type RunRow, type Tx,
} from "./common";

// Arena's state machine. Spec: run-and-scoring.md § Arena. 10 multiple-choice questions (Leap's
// kind) shown as 4 targets in a first-person room, 20 s each. A hit is an answer (POST /answer
// { optionId }). The right target closes the question: (100 + speed bonus) × streak multiplier,
// −25 per wrong hit on it, floor 25. A wrong target shatters: −3 s off the clock, the streak
// resets, and the question stays open (if the penalty runs the clock out it closes as a
// timeout). A timeout scores 0. The right option is only sent once it's hit.

type ArenaState = {
  streak: number;
  bestStreak: number;
  correct: number;
  timeouts: number;
  /** Wrong hits over the whole Run. */
  wrongHits: number;
  /** Targets shot down on the current question. */
  shattered: LeapOptionId[];
  outcome: ArenaOutcome | null;
};

type Row = RunRow<ArenaState>;

type Question = {
  position: number;
  prompt_id: string;
  started_at: Date | null;
  deadline_at: Date | null;
  text: string;
  options: string[];
  correct_answer_id: string;
  correct_option: string;
  tier: string;
  explanation: string | null;
};

const OPTION_IDS: LeapOptionId[] = ["A", "B", "C", "D"];

export const arenaEngine: ModeEngine = {
  draw: (tx, gameId) => drawPrompts(tx, gameId, ["multiple_choice"], ARENA_QUESTIONS, ARENA_QUESTIONS, "multiple-choice Prompts"),
  initialState: (): ArenaState => ({
    streak: 0, bestStreak: 0, correct: 0, timeouts: 0, wrongHits: 0, shattered: [], outcome: null,
  }),

  async state(tx, run, now) {
    await settle(tx, run as Row, now);
    return buildState(tx, run as Row, now);
  },

  async start(tx, run, now) {
    // Closing an expired question doesn't also start the next one's clock (like Dive and Leap)
    if (!(await settle(tx, run as Row, now))) {
      await tx`
        UPDATE run_prompts SET started_at = ${now}, deadline_at = ${new Date(now.getTime() + ARENA_QUESTION_MS)}
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

  summary: async (_tx, run) => arenaSummary(run as Row),
  reveal: (tx, run, base) => arenaReveal(tx, run as Row, base),
};

// ---------------------------------------------------------------------------------------
// POST /answer { optionId, position? }: a hit

export async function arenaHit(tx: Tx, r: RunRow, body: unknown, now: Date): Promise<ArenaHitResponse> {
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

  const s = run.mode_state;
  const options = shownOptions(run, q);
  const hit = options.find((o) => o.id === b.optionId)!;
  if (s.shattered.includes(hit.id)) throw new RunError(409, "That target is already down");
  const correctOptionId = options.find((o) => o.text === q.correct_option)!.id;
  const correct = hit.id === correctOptionId;

  let result: ArenaHitResult;
  let points = 0;
  if (correct) {
    const wrongHits = s.shattered.length;
    const scored = arenaPoints(q.deadline_at.getTime() - now.getTime(), s.streak + 1, wrongHits);
    points = scored.points;
    result = { correct: true, ...scored, wrongHits, correctOptionId, explanation: q.explanation };
  } else {
    result = { correct: false, optionId: hit.id, penaltyMs: ARENA_PENALTY_MS, closed: false };
  }
  await logGuess(tx, {
    run, promptId: q.prompt_id, position: q.position, startedAt: q.started_at, raw: JSON.stringify(hit.text), normalized: null,
    method: "choice", answerId: correct ? q.correct_answer_id : null, distance: null, correct, points,
    hintUsed: false, tier: correct ? (q.tier as never) : null, now,
  });

  if (correct) {
    await closeQuestion(tx, run, "correct", points, q.correct_answer_id, now);
  } else {
    s.shattered = [...s.shattered, hit.id];
    s.wrongHits += 1;
    s.streak = 0;
    const deadline = new Date(q.deadline_at.getTime() - ARENA_PENALTY_MS);
    await tx`UPDATE run_prompts SET deadline_at = ${deadline} WHERE run_id = ${run.id} AND position = ${q.position}`;
    if (deadline.getTime() <= now.getTime()) {
      await closeQuestion(tx, run, "timeout", 0, null, now); // the penalty ran the clock out
      result = { ...result, closed: true } as ArenaHitResult;
    } else {
      await saveRun(tx, run, now);
    }
  }
  return { result, state: await buildState(tx, run, now) };
}

// ---------------------------------------------------------------------------------------
// Internals

async function loadQuestion(tx: Tx, run: Row): Promise<Question> {
  const [q] = await tx<Question[]>`
    SELECT rp.position, rp.prompt_id, rp.started_at, rp.deadline_at,
           p.text, p.options, p.tier, p.explanation, a.id AS correct_answer_id, a.canonical AS correct_option
      FROM run_prompts rp JOIN prompts p ON p.id = rp.prompt_id
      JOIN LATERAL (SELECT id, canonical FROM answers WHERE prompt_id = p.id LIMIT 1) a ON true
     WHERE rp.run_id = ${run.id} AND rp.position = ${run.current_position}`;
  return q;
}

/** The targets in the order this Run shows them, lettered A–D. Seeded by the Prompt id, which the client never sees. */
function shownOptions(run: Row, q: { prompt_id: string; options: string[] }) {
  return seededShuffle(q.options, `${run.id}:${q.prompt_id}`).map((text, i) => ({ id: OPTION_IDS[i], text }));
}

/** Any request after the deadline (plus grace) closes the question as a timeout first. */
async function settle(tx: Tx, run: Row, now: Date): Promise<boolean> {
  if (run.status !== "in_progress") return false;
  const q = await loadQuestion(tx, run);
  if (!q.deadline_at || now.getTime() <= q.deadline_at.getTime() + GRACE_MS) return false;
  await closeQuestion(tx, run, "timeout", 0, null, now);
  return true;
}

/** Ends the current question; finishes the Run after the 10th. */
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
    s.timeouts += 1;
    s.streak = 0;
  }
  s.shattered = [];
  if (run.current_position >= ARENA_QUESTIONS) {
    s.outcome = "cleared";
    await saveRun(tx, run, now, true);
  } else {
    run.current_position += 1;
    await saveRun(tx, run, now);
  }
}

async function buildState(tx: Tx, run: Row, now: Date): Promise<ArenaRunState> {
  const s = run.mode_state;
  const base: ArenaRunState = {
    mode: "arena", runId: run.id, gameId: run.game_id, status: run.status, score: run.score, serverNow: now.toISOString(),
    position: run.current_position, promptCount: ARENA_QUESTIONS, streak: s.streak, nextMultiplier: streakMultiplier(s.streak + 1),
    correctCount: s.correct, wrongHits: s.wrongHits, outcome: s.outcome, startedAt: null, deadlineAt: null, question: null,
  };
  if (run.status !== "in_progress") return base;
  const q = await loadQuestion(tx, run);
  if (!q.started_at) return base;
  return {
    ...base,
    startedAt: iso(q.started_at),
    deadlineAt: iso(q.deadline_at),
    question: { text: q.text, options: shownOptions(run, q), shatteredOptionIds: [...s.shattered] },
  };
}

function arenaSummary(run: Row): RunSummary {
  const s = run.mode_state;
  return {
    mode: "arena",
    score: run.score,
    finishedAt: run.finished_at!.toISOString(),
    outcome: s.outcome ?? "cleared",
    stats: { questions: ARENA_QUESTIONS, correct: s.correct, timeouts: s.timeouts, wrongHits: s.wrongHits, bestStreak: s.bestStreak },
  };
}

async function arenaReveal(tx: Tx, run: Row, base: RevealBase): Promise<ArenaReveal> {
  const rows = await tx<(Question & { outcome: PromptOutcome | null; points: number; evidence_page_id: string | null; evidence_quote: string | null })[]>`
    SELECT rp.position, rp.prompt_id, rp.started_at, rp.deadline_at, rp.outcome, rp.points,
           p.text, p.options, p.tier, p.explanation, a.id AS correct_answer_id, a.canonical AS correct_option,
           coalesce(a.evidence_page_id, p.evidence_page_id) AS evidence_page_id, a.evidence_quote
      FROM run_prompts rp JOIN prompts p ON p.id = rp.prompt_id
      JOIN LATERAL (SELECT id, canonical, evidence_page_id, evidence_quote FROM answers WHERE prompt_id = p.id LIMIT 1) a ON true
     WHERE rp.run_id = ${run.id} ORDER BY rp.position`;
  const evidence = await evidenceLookup(tx, rows.map((r) => r.evidence_page_id));
  const hits = new Map<number, { raw: string; correct: boolean; ms: number }[]>();
  for (const g of await tx<{ position: number; raw_text: string; is_correct: boolean; ms_into_prompt: number }[]>`
    SELECT position, raw_text, is_correct, ms_into_prompt FROM guess_events
     WHERE player_id = ${run.player_id} AND run_id = ${run.id} AND created_at >= ${run.started_at}
     ORDER BY created_at, ms_into_prompt`) {
    const list = hits.get(g.position) ?? [];
    list.push({ raw: JSON.parse(g.raw_text) as string, correct: g.is_correct, ms: g.ms_into_prompt });
    hits.set(g.position, list);
  }
  const questions: ArenaRevealQuestion[] = rows.map((q) => {
    const options = shownOptions(run, q);
    return {
      position: q.position,
      text: q.text,
      options,
      hits: (hits.get(q.position) ?? []).flatMap((h) => {
        const o = options.find((x) => x.text === h.raw);
        return o ? [{ optionId: o.id, correct: h.correct, msIntoQuestion: h.ms }] : [];
      }),
      correctOptionId: options.find((o) => o.text === q.correct_option)!.id,
      outcome: q.outcome,
      points: q.points,
      explanation: q.explanation,
      evidence: evidence(q.evidence_page_id, q.evidence_quote),
    };
  });
  return { ...base, mode: "arena", questions };
}
