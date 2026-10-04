import "server-only";
import type postgres from "postgres";
import type { ModeId } from "@/lib/modes";
import { runProgress } from "@/lib/progress";
import type { Tier } from "@/lib/scoring/tiers";
import type { TopicReveal } from "@/lib/courses/types";
import type { CrowdReveal, DailyReveal } from "@/lib/daily/types";
import type { Evidence, Reveal, RevealProgress, RunState, RunStatus, RunSummary } from "../types";

// What every Mode's run engine shares: the Run row and its lock, RunError, guess_events
// logging, Evidence lookups and the Reveal's progress block. Spec: run-and-scoring.md.

export type Tx = postgres.TransactionSql;

export const GRACE_MS = 500; //          a request this late after a deadline still counts
export const EARLY_TIMEOUT_MS = 250; //  /timeout may arrive this early (client clock drift)

export class RunError extends Error {
  constructor(public status: 400 | 403 | 404 | 409, message: string) {
    super(message);
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A Run row with its Game's Mode. `mode_state` is the Mode's own jsonb (null for Dive). */
export type RunRow<S = unknown> = {
  id: string;
  player_id: string;
  game_id: string;
  mode: ModeId;
  status: RunStatus;
  current_position: number;
  score: number;
  started_at: Date;
  finished_at: Date | null;
  mode_state: S;
};

/**
 * One Mode's state machine. Every command runs inside the caller's transaction with the Run
 * row locked, and takes `now` from the caller, so the server owns the clock.
 */
export type ModeEngine = {
  /** Prompt ids for a new Run, in play order. Throws 409 if the Game has too few. */
  draw(tx: Tx, gameId: string): Promise<string[]>;
  /** runs.mode_state for a new Run. */
  initialState(promptCount: number): unknown;
  /** Current state; first closes anything whose deadline has passed. */
  state(tx: Tx, run: RunRow, now: Date): Promise<RunState>;
  /** POST start-prompt: start the current clock (idempotent). */
  start(tx: Tx, run: RunRow, now: Date): Promise<RunState>;
  /** POST timeout: the client's countdown hit zero; checked against the server clock. */
  timeout(tx: Tx, run: RunRow, now: Date): Promise<RunState>;
  /** A finished Run's summary. */
  summary(tx: Tx, run: RunRow): Promise<RunSummary>;
  /** The Mode-specific part of a finished Run's Reveal. */
  reveal(tx: Tx, run: RunRow, base: RevealBase): Promise<Reveal>;
};

export type RevealBase = {
  runId: string;
  gameId: string;
  score: number;
  summary: RunSummary;
  passed: boolean;
  progress: RevealProgress;
  topic: TopicReveal | null;
  daily: DailyReveal | null;
  crowd: CrowdReveal | null;
};

/** The caller's Run, locked for this transaction, or 404. */
export async function lockRun(tx: Tx, playerId: string, runId: string): Promise<RunRow> {
  if (!UUID.test(runId)) throw new RunError(404, "Run not found");
  const [run] = await tx<RunRow[]>`
    SELECT r.id, r.player_id, r.game_id, g.mode, r.status, r.current_position, r.score, r.started_at, r.finished_at, r.mode_state
      FROM runs r JOIN games g ON g.id = r.game_id
     WHERE r.id = ${runId} AND r.player_id = ${playerId} FOR UPDATE OF r`;
  if (!run) throw new RunError(404, "Run not found");
  return run;
}

/** The caller's Run without a lock (Reveal, summary), or 404. */
export async function readRun(tx: Tx, playerId: string, runId: string): Promise<RunRow> {
  if (!UUID.test(runId)) throw new RunError(404, "Run not found");
  const [run] = await tx<RunRow[]>`
    SELECT r.id, r.player_id, r.game_id, g.mode, r.status, r.current_position, r.score, r.started_at, r.finished_at, r.mode_state
      FROM runs r JOIN games g ON g.id = r.game_id
     WHERE r.id = ${runId} AND r.player_id = ${playerId}`;
  if (!run) throw new RunError(404, "Run not found");
  return run;
}

export function requireInProgress(run: RunRow) {
  if (run.status !== "in_progress") throw new RunError(409, `Run is ${run.status}`);
}

/** Saves the Run's position, score and mode_state; finishes it when `finish` is set. */
export async function saveRun(tx: Tx, run: RunRow, now: Date, finish = false) {
  const state = run.mode_state === null ? null : tx.json(run.mode_state as postgres.JSONValue);
  if (finish) {
    run.status = "finished";
    run.finished_at = now;
    await tx`
      UPDATE runs SET status = 'finished', finished_at = ${now}, score = ${run.score},
                      current_position = ${run.current_position}, mode_state = ${state}
       WHERE id = ${run.id}`;
  } else {
    await tx`
      UPDATE runs SET score = ${run.score}, current_position = ${run.current_position}, mode_state = ${state}
       WHERE id = ${run.id}`;
  }
}

export type GuessEvent = {
  run: RunRow;
  promptId: string;
  position: number;
  /** When the clock this guess was played against started (the Prompt, Board or Run). */
  startedAt: Date;
  raw: string;
  normalized: string | null;
  method: "exact" | "typo" | "ambiguous" | "none" | "choice";
  answerId: string | null;
  distance: number | null;
  correct: boolean;
  points: number;
  hintUsed: boolean;
  tier: Tier | null;
  now: Date;
};

/** One row in the guess_events hypertable (Mastery, Staleness, stats). */
export async function logGuess(tx: Tx, e: GuessEvent) {
  await tx`
    INSERT INTO guess_events (created_at, player_id, game_id, run_id, prompt_id, position, raw_text, normalized,
                              matched_answer_id, match_method, distance, is_correct, points, ms_into_prompt, hint_used, tier)
    VALUES (${e.now}, ${e.run.player_id}, ${e.run.game_id}, ${e.run.id}, ${e.promptId}, ${e.position}, ${e.raw},
            ${e.normalized}, ${e.answerId}, ${e.method}, ${e.distance}, ${e.correct}, ${e.points},
            ${Math.max(0, e.now.getTime() - e.startedAt.getTime())}, ${e.hintUsed}, ${e.tier})`;
}

/** Looks up Evidence pages in one query; returns `(pageId, quote) → Evidence`. */
export async function evidenceLookup(tx: Tx, pageIds: (string | null)[]) {
  const ids = [...new Set(pageIds.filter((x): x is string => !!x))];
  const pages = new Map(
    (await tx<{ id: string; page_number: number; filename: string }[]>`
      SELECT sp.id, sp.page_number, sd.filename
        FROM source_pages sp JOIN source_documents sd ON sd.id = sp.source_document_id
       WHERE sp.id = ANY(${ids}::uuid[])`).map((p) => [p.id, p]),
  );
  return (pageId: string | null, quote: string | null): Evidence => {
    const page = pageId ? pages.get(pageId) : undefined;
    return page ? { documentTitle: page.filename, pageNumber: page.page_number, quote } : null;
  };
}

/** Personal Best and Mastery before → after, the same for every Mode (lib/progress.ts). */
export async function revealProgress(tx: Tx, playerId: string, runId: string): Promise<RevealProgress> {
  const p = await runProgress(playerId, runId, tx);
  return (
    p && {
      personalBest: Math.max(p.score, p.previousBest ?? 0), // as of this Run
      isNewPersonalBest: p.isNewBest,
      masteryBefore: p.masteryBefore.pct,
      masteryAfter: p.masteryAfter.pct,
    }
  );
}

/** Up to `limit` random Prompts of `kinds` from the Game; 409 below `min`. */
export async function drawPrompts(tx: Tx, gameId: string, kinds: readonly string[] | null, limit: number, min: number, what: string) {
  const prompts = kinds
    ? await tx<{ id: string }[]>`
        SELECT id FROM prompts WHERE game_id = ${gameId} AND kind = ANY(${kinds as string[]}::text[]) ORDER BY random() LIMIT ${limit}`
    : await tx<{ id: string }[]>`SELECT id FROM prompts WHERE game_id = ${gameId} ORDER BY random() LIMIT ${limit}`;
  if (prompts.length < min) throw new RunError(409, `Game has fewer than ${min} ${what}`);
  return prompts.map((p) => p.id);
}

/** Request body as an object, or 400. */
export function bodyObject(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new RunError(400, "Expected a JSON object");
  return body as Record<string, unknown>;
}

/** Optional integer field, or 400. */
export function optionalInt(b: Record<string, unknown>, key: string): number | undefined {
  if (b[key] === undefined) return undefined;
  if (!Number.isInteger(b[key])) throw new RunError(400, `${key} must be an integer`);
  return b[key] as number;
}

export const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
