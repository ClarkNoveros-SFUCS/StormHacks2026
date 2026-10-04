import "server-only";
import { assertTopicUnlocked, recordTopicRun, topicReveal } from "@/lib/courses/progress";
import { dailyReveal, recordDailyRun } from "@/lib/daily/record";
import { onRunFinished } from "@/lib/social/xp";
import { isDiveFamily, MODES, type ModeId } from "@/lib/modes";
import { passedRun } from "@/lib/modes/rules";
import { blitzAnswer, blitzEngine } from "./engines/blitz";
import { lockRun, readRun, requireInProgress, revealProgress, RunError, UUID, type ModeEngine, type RunRow, type Tx } from "./engines/common";
import { diveEngine, diveGuess, diveHint } from "./engines/dive";
import { leapAnswer, leapEngine, leapLifeline } from "./engines/leap";
import { pairsEngine, pairsPair } from "./engines/pairs";
import type {
  AnswerResponse, GuessResponse, HintResponse, LifelineResponse, PairResponse, Reveal, RunState, RunSummary,
} from "./types";

// The Run state machine, for every Game Mode. Spec: docs/architecture/run-and-scoring.md
// Each command runs inside the caller's transaction, locks the Run row, and takes `now` from
// the caller, so the server owns the clock (and tests can move it). The Game's Mode picks the
// engine in lib/runs/engines/; Apogee uses Dive's.
//
// Every command that can finish a Run goes through `play()`, so whichever Mode or request
// finishes it, `afterFinish()` runs exactly once, in the same transaction: XP and Badges
// (F21's onRunFinished), on a Course Topic's practice Game the Topic Pass (F22), and on a
// Daily puzzle the Counted Run (F23).

export { RunError } from "./engines/common";
export { GRACE_MS, EARLY_TIMEOUT_MS } from "./engines/common";
export { MAX_GUESS_LENGTH } from "./engines/dive";
// Dive's rule values, re-exported for existing callers and tests
export { PENALTY_MS, PROMPT_MS, RUN_LENGTH } from "@/lib/modes/dive/rules";

const ENGINES: Record<(typeof MODES)[ModeId]["engine"], ModeEngine> = {
  dive: diveEngine,
  leap: leapEngine,
  pairs: pairsEngine,
  blitz: blitzEngine,
};

function engineFor(mode: ModeId): ModeEngine {
  return ENGINES[MODES[mode].engine];
}

// ---------------------------------------------------------------------------------------
// Every Mode

/**
 * Starts a Run of a ready Game the caller owns or that is public, abandoning their other
 * in-progress Runs. A Course Topic's practice Game is refused (403) while the Topic is locked.
 */
export async function createRun(tx: Tx, playerId: string, gameId: string, now: Date): Promise<{ runId: string }> {
  if (!UUID.test(gameId)) throw new RunError(404, "Game not found");
  const [game] = await tx<{ status: string; mode: ModeId }[]>`
    SELECT status, mode FROM games WHERE id = ${gameId} AND (player_id = ${playerId} OR visibility = 'public')`;
  if (!game) throw new RunError(404, "Game not found");
  if (game.status !== "ready") throw new RunError(409, "Game isn't ready yet");
  if (!MODES[game.mode]?.available) throw new RunError(409, "This Game Mode can't be played yet");
  await assertTopicUnlocked(tx, playerId, gameId);
  const engine = engineFor(game.mode);

  await tx`SELECT 1 FROM players WHERE id = ${playerId} FOR UPDATE`; // one Run created at a time per Player
  await tx`UPDATE runs SET status = 'abandoned' WHERE player_id = ${playerId} AND status = 'in_progress'`;

  const promptIds = await engine.draw(tx, gameId);
  const state = engine.initialState(promptIds.length);
  const [run] = await tx<{ id: string }[]>`
    INSERT INTO runs (player_id, game_id, status, started_at, mode_state)
    VALUES (${playerId}, ${gameId}, 'in_progress', ${now}, ${state === null ? null : tx.json(state as never)}) RETURNING id`;
  const rows = promptIds.map((id, i) => ({ run_id: run.id, position: i + 1, prompt_id: id }));
  await tx`INSERT INTO run_prompts ${tx(rows, "run_id", "position", "prompt_id")}`;
  return { runId: run.id };
}

/** GET /api/runs/[runId]: the current state (closes anything past its deadline first). */
export async function getRunState(tx: Tx, playerId: string, runId: string, now: Date): Promise<RunState> {
  const run = await lockRun(tx, playerId, runId);
  return play(tx, run, () => engineFor(run.mode).state(tx, run, now));
}

/** POST start-prompt: starts the current clock (a Prompt, a Pairs Board, or Blitz's 60 s). Idempotent. */
export async function startPrompt(tx: Tx, playerId: string, runId: string, now: Date): Promise<RunState> {
  const run = await lockRun(tx, playerId, runId);
  requireInProgress(run);
  return play(tx, run, () => engineFor(run.mode).start(tx, run, now));
}

/** POST timeout: the client's countdown hit zero. Checked against the server clock; an early call changes nothing. */
export async function timeoutPrompt(tx: Tx, playerId: string, runId: string, now: Date): Promise<RunState> {
  const run = await lockRun(tx, playerId, runId);
  return play(tx, run, () => engineFor(run.mode).timeout(tx, run, now));
}

// ---------------------------------------------------------------------------------------
// Mode-specific play

/** POST guess (Dive, Apogee): a typed answer, an order, or an odd-one-out option. */
export async function guess(tx: Tx, playerId: string, runId: string, body: unknown, now: Date): Promise<GuessResponse> {
  const run = await lockFor(tx, playerId, runId, ["dive", "apogee"], "guess");
  return play(tx, run, () => diveGuess(tx, run, body, now));
}

/** POST hint (Dive, Apogee): reveal the current single-answer Prompt's Hint. */
export async function revealHint(tx: Tx, playerId: string, runId: string, now: Date): Promise<HintResponse> {
  const run = await lockFor(tx, playerId, runId, ["dive", "apogee"], "hint");
  return play(tx, run, () => diveHint(tx, run, now));
}

/** POST answer: Leap `{ optionId, position? }` or Blitz `{ value, position? }`. */
export async function answer(tx: Tx, playerId: string, runId: string, body: unknown, now: Date): Promise<AnswerResponse> {
  const run = await lockFor(tx, playerId, runId, ["leap", "blitz"], "answer");
  return play<AnswerResponse>(tx, run, () => (run.mode === "leap" ? leapAnswer(tx, run, body, now) : blitzAnswer(tx, run, body, now)));
}

/** POST pair (Pairs): `{ termId, definitionId, board? }`. */
export async function pair(tx: Tx, playerId: string, runId: string, body: unknown, now: Date): Promise<PairResponse> {
  const run = await lockFor(tx, playerId, runId, ["pairs"], "pair");
  return play(tx, run, () => pairsPair(tx, run, body, now));
}

/** POST lifeline (Leap): the Run's one 50/50 on the current question. */
export async function applyLifeline(tx: Tx, playerId: string, runId: string, body: unknown, now: Date): Promise<LifelineResponse> {
  const run = await lockFor(tx, playerId, runId, ["leap"], "lifeline");
  return play(tx, run, () => leapLifeline(tx, run, body, now));
}

/** Locks the Run and checks it's in progress and of a Mode that takes this request (else 409). */
async function lockFor(tx: Tx, playerId: string, runId: string, modes: ModeId[], route: string): Promise<RunRow> {
  const run = await lockRun(tx, playerId, runId);
  const family = isDiveFamily(run.mode) ? ["dive", "apogee"] : [run.mode];
  if (!modes.some((m) => family.includes(m))) {
    throw new RunError(409, `A ${MODES[run.mode].name} Run doesn't take /${route}`);
  }
  requireInProgress(run);
  return run;
}

/**
 * Runs one engine command on a locked Run. If the command finished the Run (its row was
 * in progress before and is finished after), runs afterFinish in the same transaction.
 */
async function play<T>(tx: Tx, run: RunRow, command: () => Promise<T>): Promise<T> {
  const wasInProgress = run.status === "in_progress";
  const result = await command();
  if (wasInProgress && run.status === "finished") await afterFinish(tx, run);
  return result;
}

/** Once per finished Run (never an abandoned one): XP and Badges, the Course Topic, the Daily. */
async function afterFinish(tx: Tx, run: RunRow) {
  const summary = await engineFor(run.mode).summary(tx, run);
  await onRunFinished(run.player_id, { runId: run.id, ...summary }, tx);
  await recordTopicRun(tx, run.player_id, { id: run.id, gameId: run.game_id, finishedAt: run.finished_at! }, summary);
  await recordDailyRun(
    tx, { id: run.id, playerId: run.player_id, gameId: run.game_id, startedAt: run.started_at, finishedAt: run.finished_at! }, summary,
  );
}

// ---------------------------------------------------------------------------------------
// After the Run: only once it's finished, so Answers never leak early

/** A finished Run's Mode-agnostic summary (XP, leaderboards, Course passes). */
export async function getRunSummary(tx: Tx, playerId: string, runId: string): Promise<RunSummary> {
  const run = await readRun(tx, playerId, runId);
  if (run.status !== "finished") throw new RunError(409, "The Run isn't finished");
  return engineFor(run.mode).summary(tx, run);
}

/** GET reveal: every Prompt with its Answer, Evidence and your result, plus progress. */
export async function getReveal(tx: Tx, playerId: string, runId: string): Promise<Reveal> {
  const run = await readRun(tx, playerId, runId);
  if (run.status !== "finished") throw new RunError(409, "The Reveal opens once the Run is finished");
  const engine = engineFor(run.mode);
  const summary = await engine.summary(tx, run);
  const progress = await revealProgress(tx, playerId, run.id);
  const topic = await topicReveal(tx, playerId, { id: run.id, gameId: run.game_id }, summary);
  const { daily, crowd } = await dailyReveal(tx, playerId, { id: run.id, gameId: run.game_id, score: run.score });
  return engine.reveal(tx, run, {
    runId: run.id, gameId: run.game_id, score: run.score, summary, passed: passedRun(summary), progress, topic, daily, crowd,
  });
}
