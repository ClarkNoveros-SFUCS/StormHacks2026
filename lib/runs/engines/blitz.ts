import "server-only";
import {
  BLITZ_MAX_DECK, BLITZ_MIN_DECK, BLITZ_MS, BLITZ_PENALTY_MS, blitzPoints,
} from "@/lib/modes/blitz/rules";
import type { Tier } from "@/lib/scoring/tiers";
import type {
  BlitzAnswerResponse, BlitzAnswerResult, BlitzOutcome, BlitzReveal, BlitzRevealStatement, BlitzRunState, PromptOutcome, RunSummary,
} from "../types";
import {
  bodyObject, drawPrompts, EARLY_TIMEOUT_MS, evidenceLookup, GRACE_MS, iso, logGuess, optionalInt, RunError, saveRun,
  type ModeEngine, type RevealBase, type RunRow, type Tx,
} from "./common";

// Blitz's state machine. Spec: run-and-scoring.md § Blitz. One 60 s clock for the whole Run.
// The deck (up to 120 true_false Prompts, drawn at random) is stored as run_prompts; the server
// deals one statement at a time (run_prompts.started_at marks it dealt). +10 per correct, 20
// after 5 in a row; a wrong answer resets the combo and costs 3 s. The Run ends when the clock
// runs out or the deck is used up. runs.current_position is the statement being judged.

type BlitzState = {
  startedAt: string | null;
  deadlineAt: string | null;
  deckSize: number;
  combo: number;
  bestCombo: number;
  correct: number;
  wrong: number;
  outcome: BlitzOutcome | null;
};
type Row = RunRow<BlitzState>;

type Statement = {
  position: number;
  prompt_id: string;
  started_at: Date | null;
  text: string;
  is_true: boolean;
  tier: Tier;
  explanation: string | null;
  answer_id: string;
};

export const blitzEngine: ModeEngine = {
  draw: (tx, gameId) => drawPrompts(tx, gameId, ["true_false"], BLITZ_MAX_DECK, BLITZ_MIN_DECK, "true/false statements"),
  initialState: (deckSize: number): BlitzState => ({
    startedAt: null, deadlineAt: null, deckSize, combo: 0, bestCombo: 0, correct: 0, wrong: 0, outcome: null,
  }),

  async state(tx, run, now) {
    await settle(tx, run as Row, now);
    return buildState(tx, run as Row, now);
  },

  async start(tx, r, now) {
    const run = r as Row;
    if (!(await settle(tx, run, now)) && run.status === "in_progress" && !run.mode_state.startedAt) {
      run.mode_state.startedAt = now.toISOString();
      run.mode_state.deadlineAt = new Date(now.getTime() + BLITZ_MS).toISOString();
      await deal(tx, run, now);
      await saveRun(tx, run, now);
    }
    return buildState(tx, run, now);
  },

  async timeout(tx, r, now) {
    const run = r as Row;
    const deadline = run.mode_state.deadlineAt;
    if (run.status === "in_progress" && !(await settle(tx, run, now)) && deadline && now.getTime() >= Date.parse(deadline) - EARLY_TIMEOUT_MS) {
      await finish(tx, run, "time_up", now);
    }
    return buildState(tx, run, now);
  },

  summary: async (_tx, run) => blitzSummary(run as Row),
  reveal: (tx, run, base) => blitzReveal(tx, run as Row, base),
};

// ---------------------------------------------------------------------------------------
// POST /answer { value, position? }

export async function blitzAnswer(tx: Tx, r: RunRow, body: unknown, now: Date): Promise<BlitzAnswerResponse> {
  const run = r as Row;
  const b = bodyObject(body);
  if (typeof b.value !== "boolean") throw new RunError(400, "value must be true or false");
  const position = optionalInt(b, "position");
  if (await settle(tx, run, now)) return { result: { correct: false, timedOut: true }, state: await buildState(tx, run, now) };
  if (!run.mode_state.startedAt || !run.mode_state.deadlineAt) throw new RunError(409, "The clock hasn't started");
  if (position !== undefined && position !== run.current_position) throw new RunError(409, "That statement is already answered");

  const st = await loadStatement(tx, run);
  const s = run.mode_state;
  const correct = b.value === st.is_true;
  const points = correct ? blitzPoints(s.combo) : 0;
  await logGuess(tx, {
    run, promptId: st.prompt_id, position: st.position, startedAt: st.started_at ?? new Date(s.startedAt!),
    raw: JSON.stringify(b.value), normalized: null, method: "choice", answerId: correct ? st.answer_id : null,
    distance: null, correct, points, hintUsed: false, tier: correct ? st.tier : null, now,
  });
  await tx`
    UPDATE run_prompts SET ended_at = ${now}, outcome = ${correct ? "correct" : "wrong"}, points = ${points},
                           answer_id = ${correct ? st.answer_id : null}
     WHERE run_id = ${run.id} AND position = ${st.position}`;

  let result: BlitzAnswerResult;
  run.score += points;
  if (correct) {
    s.combo += 1;
    s.correct += 1;
    s.bestCombo = Math.max(s.bestCombo, s.combo);
    result = { correct: true, points, isTrue: st.is_true, combo: s.combo, explanation: st.explanation };
  } else {
    s.combo = 0;
    s.wrong += 1;
    s.deadlineAt = new Date(Date.parse(s.deadlineAt!) - BLITZ_PENALTY_MS).toISOString();
    result = { correct: false, isTrue: st.is_true, penaltyMs: BLITZ_PENALTY_MS, explanation: st.explanation };
  }

  if (Date.parse(s.deadlineAt!) <= now.getTime()) await finish(tx, run, "time_up", now); // the penalty ran the clock out
  else if (run.current_position >= s.deckSize) await finish(tx, run, "deck_cleared", now);
  else {
    run.current_position += 1;
    await deal(tx, run, now);
    await saveRun(tx, run, now);
  }
  return { result, state: await buildState(tx, run, now) };
}

// ---------------------------------------------------------------------------------------
// Internals

async function loadStatement(tx: Tx, run: Row): Promise<Statement> {
  const [st] = await tx<Statement[]>`
    SELECT rp.position, rp.prompt_id, rp.started_at, p.text, p.is_true, p.tier, p.explanation, a.id AS answer_id
      FROM run_prompts rp JOIN prompts p ON p.id = rp.prompt_id
      JOIN LATERAL (SELECT id FROM answers WHERE prompt_id = p.id LIMIT 1) a ON true
     WHERE rp.run_id = ${run.id} AND rp.position = ${run.current_position}`;
  return st;
}

/** Marks the current statement as dealt (shown from now). */
async function deal(tx: Tx, run: Row, now: Date) {
  await tx`UPDATE run_prompts SET started_at = ${now} WHERE run_id = ${run.id} AND position = ${run.current_position} AND started_at IS NULL`;
}

/** Any request after the clock ran out (plus grace) finishes the Run first. */
async function settle(tx: Tx, run: Row, now: Date): Promise<boolean> {
  if (run.status !== "in_progress" || !run.mode_state.deadlineAt) return false;
  if (now.getTime() <= Date.parse(run.mode_state.deadlineAt) + GRACE_MS) return false;
  await finish(tx, run, "time_up", now);
  return true;
}

async function finish(tx: Tx, run: Row, outcome: BlitzOutcome, now: Date) {
  // The statement on screen when time ran out was dealt but never judged
  await tx`
    UPDATE run_prompts SET ended_at = ${now}, outcome = 'timeout'
     WHERE run_id = ${run.id} AND started_at IS NOT NULL AND outcome IS NULL`;
  run.mode_state.outcome = outcome;
  await saveRun(tx, run, now, true);
}

async function buildState(tx: Tx, run: Row, now: Date): Promise<BlitzRunState> {
  const s = run.mode_state;
  const base: BlitzRunState = {
    mode: "blitz", runId: run.id, gameId: run.game_id, status: run.status, score: run.score, serverNow: now.toISOString(),
    position: s.startedAt ? run.current_position : 0, deckSize: s.deckSize, combo: s.combo, nextPoints: blitzPoints(s.combo),
    correctCount: s.correct, wrongCount: s.wrong, outcome: s.outcome,
    startedAt: iso(s.startedAt), deadlineAt: iso(s.deadlineAt), statement: null,
  };
  if (run.status !== "in_progress" || !s.startedAt) return base;
  const st = await loadStatement(tx, run);
  return { ...base, statement: { text: st.text } };
}

function blitzSummary(run: Row): RunSummary {
  const s = run.mode_state;
  return {
    mode: "blitz",
    score: run.score,
    finishedAt: run.finished_at!.toISOString(),
    outcome: s.outcome ?? "time_up",
    stats: { answered: s.correct + s.wrong, correct: s.correct, wrong: s.wrong, bestCombo: s.bestCombo },
  };
}

async function blitzReveal(tx: Tx, run: Row, base: RevealBase): Promise<BlitzReveal> {
  const rows = await tx<(Statement & { outcome: PromptOutcome | null; points: number; evidence_page_id: string | null; evidence_quote: string | null })[]>`
    SELECT rp.position, rp.prompt_id, rp.started_at, rp.outcome, rp.points,
           p.text, p.is_true, p.tier, p.explanation, a.id AS answer_id,
           coalesce(a.evidence_page_id, p.evidence_page_id) AS evidence_page_id, a.evidence_quote
      FROM run_prompts rp JOIN prompts p ON p.id = rp.prompt_id
      JOIN LATERAL (SELECT id, evidence_page_id, evidence_quote FROM answers WHERE prompt_id = p.id LIMIT 1) a ON true
     WHERE rp.run_id = ${run.id} AND rp.started_at IS NOT NULL
     ORDER BY rp.position`;
  const evidence = await evidenceLookup(tx, rows.map((r) => r.evidence_page_id));
  const statements: BlitzRevealStatement[] = rows.map((st) => ({
    position: st.position,
    text: st.text,
    isTrue: st.is_true,
    yourAnswer: st.outcome === "correct" ? st.is_true : st.outcome === "wrong" ? !st.is_true : null,
    correct: st.outcome === "correct",
    points: st.points,
    explanation: st.explanation,
    evidence: evidence(st.evidence_page_id, st.evidence_quote),
  }));
  return { ...base, mode: "blitz", statements };
}
