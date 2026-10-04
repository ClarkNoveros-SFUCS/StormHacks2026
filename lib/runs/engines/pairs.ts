import "server-only";
import { createHash } from "node:crypto";
import {
  mismatchLoss, PAIRS_BOARD_MS, PAIRS_BOARDS, PAIRS_MATCH_POINTS, PAIRS_MISMATCH_PENALTY_MS, PAIRS_PER_BOARD, timeBonus,
} from "@/lib/modes/pairs/rules";
import type { Tier } from "@/lib/scoring/tiers";
import { seededShuffle } from "../shuffle";
import type { PairResponse, PairsOutcome, PairsReveal, PairsRevealBoard, PairsRunState, PromptOutcome, RunSummary } from "../types";
import {
  bodyObject, EARLY_TIMEOUT_MS, evidenceLookup, GRACE_MS, iso, logGuess, optionalInt, RunError, saveRun,
  type ModeEngine, type RevealBase, type RunRow, type Tx,
} from "./common";

// Pairs' state machine. Spec: run-and-scoring.md § Pairs. Two Boards of 6 definition_to_term
// Prompts (term ↔ definition), 60 s each. The client sees the terms and definitions shuffled
// under opaque ids and submits one (termId, definitionId) at a time; the server checks it.
// Match +50; mismatch −10 (never below 0) and −2 s. A Board ends when all 6 are matched
// (+5 per whole second left) or its clock runs out. runs.current_position is the Board.

type BoardState = {
  startedAt: string | null;
  deadlineAt: string | null;
  endedAt: string | null;
  cleared: boolean;
  mistakes: number;
  timeBonus: number;
};
type PairsState = { boards: BoardState[]; outcome: PairsOutcome | null };
type Row = RunRow<PairsState>;

type PairRow = {
  position: number;
  prompt_id: string;
  started_at: Date | null;
  outcome: PromptOutcome | null;
  points: number;
  definition: string;
  term: string;
  answer_id: string;
  tier: Tier;
  explanation: string | null;
  evidence_page_id: string | null;
  evidence_quote: string | null;
};

const emptyBoard = (): BoardState => ({ startedAt: null, deadlineAt: null, endedAt: null, cleared: false, mistakes: 0, timeBonus: 0 });

export const pairsEngine: ModeEngine = {
  async draw(tx, gameId) {
    const need = PAIRS_BOARDS * PAIRS_PER_BOARD;
    // One Prompt per distinct term, so a Board never holds two cards with the same term
    const rows = await tx<{ id: string }[]>`
      SELECT id FROM (
        SELECT DISTINCT ON (lower(a.canonical)) p.id, random() AS r
          FROM prompts p JOIN answers a ON a.prompt_id = p.id
         WHERE p.game_id = ${gameId} AND p.kind = 'definition_to_term'
         ORDER BY lower(a.canonical), random()
      ) x ORDER BY r LIMIT ${need}`;
    if (rows.length < need) throw new RunError(409, `Game has fewer than ${need} term–definition pairs`);
    return rows.map((r) => r.id);
  },
  initialState: (): PairsState => ({ boards: Array.from({ length: PAIRS_BOARDS }, emptyBoard), outcome: null }),

  async state(tx, run, now) {
    await settle(tx, run as Row, now);
    return buildState(tx, run as Row, now);
  },

  async start(tx, r, now) {
    const run = r as Row;
    if (!(await settle(tx, run, now)) && run.status === "in_progress") {
      const board = currentBoard(run);
      if (!board.startedAt) {
        board.startedAt = now.toISOString();
        board.deadlineAt = new Date(now.getTime() + PAIRS_BOARD_MS).toISOString();
        const [from, to] = positions(run.current_position);
        await tx`UPDATE run_prompts SET started_at = ${now} WHERE run_id = ${run.id} AND position BETWEEN ${from} AND ${to}`;
        await saveRun(tx, run, now);
      }
    }
    return buildState(tx, run, now);
  },

  async timeout(tx, r, now) {
    const run = r as Row;
    if (run.status === "in_progress" && !(await settle(tx, run, now))) {
      const board = currentBoard(run);
      if (board.deadlineAt && now.getTime() >= Date.parse(board.deadlineAt) - EARLY_TIMEOUT_MS) await closeBoard(tx, run, false, now);
    }
    return buildState(tx, run, now);
  },

  summary: async (tx, run) => pairsSummary(tx, run as Row),
  reveal: (tx, run, base) => pairsReveal(tx, run as Row, base),
};

// ---------------------------------------------------------------------------------------
// POST /pair { termId, definitionId, board? }

export async function pairsPair(tx: Tx, r: RunRow, body: unknown, now: Date): Promise<PairResponse> {
  const run = r as Row;
  const b = bodyObject(body);
  if (typeof b.termId !== "string" || typeof b.definitionId !== "string") throw new RunError(400, "Send termId and definitionId");
  const boardNo = optionalInt(b, "board");
  if (await settle(tx, run, now)) return { result: { correct: false, timedOut: true }, state: await buildState(tx, run, now) };
  if (boardNo !== undefined && boardNo !== run.current_position) throw new RunError(409, "That Board is already over");
  const board = currentBoard(run);
  if (!board.startedAt || !board.deadlineAt) throw new RunError(409, "Board hasn't started");

  const rows = await loadBoard(tx, run);
  const term = rows.find((p) => termId(run, p) === b.termId);
  const def = rows.find((p) => definitionId(run, p) === b.definitionId);
  if (!term || !def) throw new RunError(400, "termId and definitionId must be on this Board");
  if (term.outcome === "correct" || def.outcome === "correct") throw new RunError(409, "That card is already matched");

  const startedAt = new Date(board.startedAt);
  const raw = JSON.stringify({ term: term.term, definition: def.definition });
  if (term.prompt_id === def.prompt_id) {
    await logGuess(tx, {
      run, promptId: def.prompt_id, position: def.position, startedAt, raw, normalized: null, method: "choice",
      answerId: def.answer_id, distance: null, correct: true, points: PAIRS_MATCH_POINTS, hintUsed: false, tier: def.tier, now,
    });
    await tx`
      UPDATE run_prompts SET ended_at = ${now}, outcome = 'correct', points = ${PAIRS_MATCH_POINTS}, answer_id = ${def.answer_id}
       WHERE run_id = ${run.id} AND position = ${def.position}`;
    run.score += PAIRS_MATCH_POINTS;
    const cleared = rows.filter((p) => p.outcome === "correct").length + 1 === rows.length;
    let bonus = 0;
    if (cleared) {
      bonus = timeBonus(Date.parse(board.deadlineAt) - now.getTime());
      await closeBoard(tx, run, true, now, bonus);
    } else {
      await saveRun(tx, run, now);
    }
    return {
      result: { correct: true, points: PAIRS_MATCH_POINTS, termId: b.termId, definitionId: b.definitionId, boardCleared: cleared, timeBonus: bonus },
      state: await buildState(tx, run, now),
    };
  }

  // Mismatch: logged against the term's Prompt
  const lost = mismatchLoss(run.score);
  await logGuess(tx, {
    run, promptId: term.prompt_id, position: term.position, startedAt, raw, normalized: null, method: "choice",
    answerId: null, distance: null, correct: false, points: -lost, hintUsed: false, tier: null, now,
  });
  run.score -= lost;
  board.mistakes += 1;
  const deadline = Date.parse(board.deadlineAt) - PAIRS_MISMATCH_PENALTY_MS;
  board.deadlineAt = new Date(deadline).toISOString();
  if (deadline <= now.getTime()) await closeBoard(tx, run, false, now); // the penalty ran the clock out
  else await saveRun(tx, run, now);
  return {
    result: { correct: false, pointsLost: lost, penaltyMs: PAIRS_MISMATCH_PENALTY_MS },
    state: await buildState(tx, run, now),
  };
}

// ---------------------------------------------------------------------------------------
// Internals

const positions = (board: number) => [(board - 1) * PAIRS_PER_BOARD + 1, board * PAIRS_PER_BOARD] as const;
const currentBoard = (run: Row) => run.mode_state.boards[run.current_position - 1];

/** Opaque card ids: a hash of the Prompt id (never sent), different for a term and its definition. */
const cardId = (run: Row, p: { prompt_id: string }, side: string) =>
  createHash("sha256").update(`${run.id}:${p.prompt_id}:${side}`).digest("hex").slice(0, 12);
const termId = (run: Row, p: { prompt_id: string }) => `t${cardId(run, p, "term")}`;
const definitionId = (run: Row, p: { prompt_id: string }) => `d${cardId(run, p, "definition")}`;

async function loadBoard(tx: Tx, run: Row, board = run.current_position): Promise<PairRow[]> {
  const [from, to] = positions(board);
  return tx<PairRow[]>`
    SELECT rp.position, rp.prompt_id, rp.started_at, rp.outcome, rp.points,
           p.text AS definition, a.canonical AS term, a.id AS answer_id, p.tier, p.explanation,
           coalesce(a.evidence_page_id, p.evidence_page_id) AS evidence_page_id, a.evidence_quote
      FROM run_prompts rp JOIN prompts p ON p.id = rp.prompt_id
      JOIN LATERAL (SELECT id, canonical, evidence_page_id, evidence_quote FROM answers WHERE prompt_id = p.id LIMIT 1) a ON true
     WHERE rp.run_id = ${run.id} AND rp.position BETWEEN ${from} AND ${to}
     ORDER BY rp.position`;
}

/** Any request after the Board's deadline (plus grace) closes it first. */
async function settle(tx: Tx, run: Row, now: Date): Promise<boolean> {
  if (run.status !== "in_progress") return false;
  const board = currentBoard(run);
  if (!board.deadlineAt || now.getTime() <= Date.parse(board.deadlineAt) + GRACE_MS) return false;
  await closeBoard(tx, run, false, now);
  return true;
}

/** Ends the current Board (cleared, or out of time); after the last one the Run is finished. */
async function closeBoard(tx: Tx, run: Row, cleared: boolean, now: Date, bonus = 0) {
  const [from, to] = positions(run.current_position);
  await tx`
    UPDATE run_prompts SET ended_at = ${now}, outcome = 'timeout'
     WHERE run_id = ${run.id} AND position BETWEEN ${from} AND ${to} AND outcome IS NULL`;
  const board = currentBoard(run);
  board.endedAt = now.toISOString();
  board.cleared = cleared;
  board.timeBonus = bonus;
  run.score += bonus;
  if (run.current_position >= PAIRS_BOARDS) {
    run.mode_state.outcome = run.mode_state.boards.every((b) => b.cleared) ? "cleared" : "time_up";
    await saveRun(tx, run, now, true);
  } else {
    run.current_position += 1;
    await saveRun(tx, run, now);
  }
}

async function buildState(tx: Tx, run: Row, now: Date): Promise<PairsRunState> {
  const s = run.mode_state;
  const board = currentBoard(run);
  const base: PairsRunState = {
    mode: "pairs", runId: run.id, gameId: run.game_id, status: run.status, score: run.score, serverNow: now.toISOString(),
    board: run.current_position, boardCount: PAIRS_BOARDS, pairsPerBoard: PAIRS_PER_BOARD,
    boardsCleared: s.boards.filter((b) => b.cleared).length, outcome: s.outcome,
    startedAt: null, deadlineAt: null, mistakes: board.mistakes, current: null,
  };
  if (run.status !== "in_progress" || !board.startedAt) return base;

  const rows = await loadBoard(tx, run);
  const seed = `${run.id}:${rows.map((r) => r.prompt_id).join(",")}`;
  return {
    ...base,
    startedAt: iso(board.startedAt),
    deadlineAt: iso(board.deadlineAt),
    current: {
      terms: seededShuffle(rows, `${seed}:terms`).map((p) => ({ id: termId(run, p), text: p.term, matched: p.outcome === "correct" })),
      definitions: seededShuffle(rows, `${seed}:definitions`).map((p) => ({ id: definitionId(run, p), text: p.definition, matched: p.outcome === "correct" })),
      matches: rows.filter((p) => p.outcome === "correct").map((p) => ({ termId: termId(run, p), definitionId: definitionId(run, p) })),
    },
  };
}

async function pairsSummary(tx: Tx, run: Row): Promise<RunSummary> {
  const s = run.mode_state;
  const [{ matches }] = await tx<{ matches: number }[]>`
    SELECT count(*)::int AS matches FROM run_prompts WHERE run_id = ${run.id} AND outcome = 'correct'`;
  return {
    mode: "pairs",
    score: run.score,
    finishedAt: run.finished_at!.toISOString(),
    outcome: s.outcome ?? "time_up",
    stats: {
      boardsCleared: s.boards.filter((b) => b.cleared).length,
      matches,
      mistakes: s.boards.reduce((n, b) => n + b.mistakes, 0),
      timeBonus: s.boards.reduce((n, b) => n + b.timeBonus, 0),
    },
  };
}

async function pairsReveal(tx: Tx, run: Row, base: RevealBase): Promise<PairsReveal> {
  const boards: PairsRevealBoard[] = [];
  const all: PairRow[][] = [];
  for (let b = 1; b <= PAIRS_BOARDS; b++) all.push(await loadBoard(tx, run, b));
  const evidence = await evidenceLookup(tx, all.flat().map((p) => p.evidence_page_id));
  all.forEach((rows, i) => {
    const s = run.mode_state.boards[i];
    const seconds = s.startedAt && s.endedAt ? Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 1000) : null;
    boards.push({
      board: i + 1,
      cleared: s.cleared,
      mistakes: s.mistakes,
      timeBonus: s.timeBonus,
      seconds,
      pairs: rows.map((p) => ({
        term: p.term,
        definition: p.definition,
        matched: p.outcome === "correct",
        points: p.points,
        explanation: p.explanation,
        evidence: evidence(p.evidence_page_id, p.evidence_quote),
      })),
    });
  });
  return { ...base, mode: "pairs", boards };
}
