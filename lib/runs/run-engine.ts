import "server-only";
import type postgres from "postgres";
import { matchGuess } from "@/lib/matching/match-guess";
import { normalize } from "@/lib/matching/normalize";
import { openPoints, singlePoints } from "@/lib/scoring/points";
import { TIER_POINTS, type Tier } from "@/lib/scoring/tiers";
import { seededShuffle, shuffleOutOfOrder } from "./shuffle";
import type {
  Evidence, GuessResponse, GuessResult, HintResponse, PromptKind, PromptOutcome,
  Reveal, RevealPrompt, RunState, RunStatus,
} from "./types";

// The Run state machine. Spec: docs/architecture/run-and-scoring.md
// Every function runs inside the caller's transaction and takes `now` from the caller,
// so the server owns the clock (and tests can move it).

export const RUN_LENGTH = 7;
export const PROMPT_MS = 25_000;
export const PENALTY_MS = 3_000;
export const GRACE_MS = 500; //          a guess this late after the deadline still counts
export const EARLY_TIMEOUT_MS = 250; //  /timeout may arrive this early (client clock drift)
export const MAX_GUESS_LENGTH = 500;

type Tx = postgres.TransactionSql;

export class RunError extends Error {
  constructor(public status: 400 | 404 | 409, message: string) {
    super(message);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPED_KINDS: PromptKind[] = ["open", "cloze", "definition_to_term"];

type RunRow = { id: string; player_id: string; game_id: string; status: RunStatus; current_position: number; score: number; started_at: Date };

type CurrentPrompt = {
  position: number;
  prompt_id: string;
  started_at: Date | null;
  deadline_at: Date | null;
  ended_at: Date | null;
  hint_used: boolean;
  kind: PromptKind;
  text: string;
  tier: Tier | null;
  hint: string | null;
  items: string[] | null;
  options: string[] | null;
};

// ---------------------------------------------------------------------------------------
// Commands

export async function createRun(tx: Tx, playerId: string, gameId: string, now: Date): Promise<{ runId: string }> {
  if (!UUID.test(gameId)) throw new RunError(404, "Game not found");
  const [game] = await tx<{ status: string }[]>`SELECT status FROM games WHERE id = ${gameId} AND player_id = ${playerId}`;
  if (!game) throw new RunError(404, "Game not found");
  if (game.status !== "ready") throw new RunError(409, "Game isn't ready yet");

  await tx`SELECT 1 FROM players WHERE id = ${playerId} FOR UPDATE`; // one Run created at a time per Player
  await tx`UPDATE runs SET status = 'abandoned' WHERE player_id = ${playerId} AND status = 'in_progress'`;

  const prompts = await tx<{ id: string }[]>`
    SELECT id FROM prompts WHERE game_id = ${gameId} ORDER BY random() LIMIT ${RUN_LENGTH}`;
  if (prompts.length < RUN_LENGTH) throw new RunError(409, `Game has fewer than ${RUN_LENGTH} Prompts`);

  const [run] = await tx<{ id: string }[]>`
    INSERT INTO runs (player_id, game_id, status, started_at)
    VALUES (${playerId}, ${gameId}, 'in_progress', ${now}) RETURNING id`;
  const rows = prompts.map((p, i) => ({ run_id: run.id, position: i + 1, prompt_id: p.id }));
  await tx`INSERT INTO run_prompts ${tx(rows, "run_id", "position", "prompt_id")}`;
  return { runId: run.id };
}

export async function getRunState(tx: Tx, playerId: string, runId: string, now: Date): Promise<RunState> {
  const run = await lockRun(tx, playerId, runId);
  await settle(tx, run, now);
  return buildState(tx, run, now);
}

export async function startPrompt(tx: Tx, playerId: string, runId: string, now: Date): Promise<RunState> {
  const run = await lockRun(tx, playerId, runId);
  requireInProgress(run);
  // If this closed an expired Prompt, don't start the next one's clock in the same call:
  // the client shows the timeout first, then asks again.
  if (!(await settle(tx, run, now))) {
    await tx`
      UPDATE run_prompts SET started_at = ${now}, deadline_at = ${new Date(now.getTime() + PROMPT_MS)}
       WHERE run_id = ${run.id} AND position = ${run.current_position} AND started_at IS NULL`;
  }
  return buildState(tx, run, now);
}

export async function guess(tx: Tx, playerId: string, runId: string, body: unknown, now: Date): Promise<GuessResponse> {
  const input = parseGuessBody(body);
  const run = await lockRun(tx, playerId, runId);
  requireInProgress(run);
  if (await settle(tx, run, now)) {
    return { result: { correct: false, timedOut: true }, state: await buildState(tx, run, now) };
  }
  if (input.position !== undefined && input.position !== run.current_position) {
    throw new RunError(409, "That Prompt is already closed");
  }
  const cur = await loadCurrent(tx, run);
  if (!cur.started_at || !cur.deadline_at) throw new RunError(409, "Prompt hasn't started");

  const result = TYPED_KINDS.includes(cur.kind)
    ? await typedGuess(tx, run, cur, input, now)
    : await oneShotGuess(tx, run, cur, input, now);
  return { result, state: await buildState(tx, run, now) };
}

export async function revealHint(tx: Tx, playerId: string, runId: string, now: Date): Promise<HintResponse> {
  const run = await lockRun(tx, playerId, runId);
  requireInProgress(run);
  if (await settle(tx, run, now)) throw new RunError(409, "That Prompt timed out");
  const cur = await loadCurrent(tx, run);
  if (!cur.started_at) throw new RunError(409, "Prompt hasn't started");
  if (cur.kind === "open" || cur.hint === null) throw new RunError(409, "This Prompt has no Hint");
  if (!cur.hint_used) {
    await tx`UPDATE run_prompts SET hint_used = true WHERE run_id = ${run.id} AND position = ${cur.position}`;
  }
  return { hint: cur.hint, state: await buildState(tx, run, now) };
}

// The client's countdown hit zero. Checked against the server clock; an early call changes nothing.
export async function timeoutPrompt(tx: Tx, playerId: string, runId: string, now: Date): Promise<RunState> {
  const run = await lockRun(tx, playerId, runId);
  if (run.status === "in_progress" && !(await settle(tx, run, now))) {
    const cur = await loadCurrent(tx, run);
    if (cur.deadline_at && now.getTime() >= cur.deadline_at.getTime() - EARLY_TIMEOUT_MS) {
      await closePrompt(tx, run, "timeout", 0, null, now);
    }
  }
  return buildState(tx, run, now);
}

// ---------------------------------------------------------------------------------------
// Guessing

type GuessInput = { text?: string; order?: string[]; option?: string; position?: number };

function parseGuessBody(body: unknown): GuessInput {
  if (typeof body !== "object" || body === null) throw new RunError(400, "Expected a JSON object");
  const b = body as Record<string, unknown>;
  const given = ["text", "order", "option"].filter((k) => b[k] !== undefined);
  if (given.length !== 1) throw new RunError(400, "Send exactly one of text, order or option");
  if (b.text !== undefined && typeof b.text !== "string") throw new RunError(400, "text must be a string");
  if (b.option !== undefined && typeof b.option !== "string") throw new RunError(400, "option must be a string");
  if (b.order !== undefined && !(Array.isArray(b.order) && b.order.every((x) => typeof x === "string"))) {
    throw new RunError(400, "order must be an array of strings");
  }
  if (b.position !== undefined && !Number.isInteger(b.position)) throw new RunError(400, "position must be an integer");
  return b as GuessInput;
}

async function typedGuess(tx: Tx, run: RunRow, cur: CurrentPrompt, input: GuessInput, now: Date): Promise<GuessResult> {
  if (input.text === undefined) throw new RunError(400, "This Prompt takes a typed answer");
  if (input.text.length > MAX_GUESS_LENGTH) throw new RunError(400, "Guess is too long");
  const raw = input.text.replace(/\0/g, ""); // Postgres text can't hold NUL
  const normalized = normalize(raw);
  if (normalized === "") throw new RunError(400, "Empty guess");

  const match = await matchGuess(cur.prompt_id, raw, tx);
  const event = { run, cur, raw, normalized, now };

  if (!match.matched) {
    await logGuess(tx, { ...event, method: match.method, answerId: null, distance: null, correct: false, points: 0, tier: null });
    const deadline = new Date(cur.deadline_at!.getTime() - PENALTY_MS);
    await tx`UPDATE run_prompts SET deadline_at = ${deadline} WHERE run_id = ${run.id} AND position = ${cur.position}`;
    if (deadline.getTime() <= now.getTime()) await closePrompt(tx, run, "timeout", 0, null, now); // the penalty ran the clock out
    return { correct: false, penaltyMs: PENALTY_MS };
  }

  const [answer] = await tx<{ canonical: string; tier: Tier }[]>`SELECT canonical, tier FROM answers WHERE id = ${match.answerId}`;
  let points: number;
  let earlierRuns = 0;
  if (cur.kind === "open") {
    [{ n: earlierRuns }] = await tx<{ n: number }[]>`
      SELECT count(DISTINCT run_id)::int AS n FROM guess_events
       WHERE player_id = ${run.player_id} AND prompt_id = ${cur.prompt_id}
         AND matched_answer_id = ${match.answerId} AND is_correct AND run_id <> ${run.id}`;
    points = openPoints(answer.tier, earlierRuns);
  } else {
    points = singlePoints(cur.tier!, cur.hint_used);
  }
  await logGuess(tx, { ...event, method: match.method, answerId: match.answerId, distance: match.distance, correct: true, points, tier: answer.tier });
  await closePrompt(tx, run, "correct", points, match.answerId, now);
  return { correct: true, points, answer: answer.canonical, tier: cur.tier ?? answer.tier, stale: earlierRuns > 0 };
}

// Put-in-order and odd-one-out: one submission, right or wrong, then the Prompt ends.
async function oneShotGuess(tx: Tx, run: RunRow, cur: CurrentPrompt, input: GuessInput, now: Date): Promise<GuessResult> {
  const [answer] = await tx<{ id: string; canonical: string }[]>`
    SELECT id, canonical FROM answers WHERE prompt_id = ${cur.prompt_id} LIMIT 1`;
  let correct: boolean;
  let raw: string;
  let shown: string;
  const correctOrder = cur.kind === "ordered_recall" ? cur.items! : undefined;

  if (cur.kind === "ordered_recall") {
    if (input.order === undefined) throw new RunError(400, "This Prompt takes an order");
    const items = cur.items!;
    if (input.order.length !== items.length || [...input.order].sort().join("\0") !== [...items].sort().join("\0")) {
      throw new RunError(400, "order must contain each item once");
    }
    correct = input.order.every((x, i) => x === items[i]);
    raw = JSON.stringify(input.order);
    shown = items.join(" → ");
  } else {
    if (input.option === undefined) throw new RunError(400, "This Prompt takes an option");
    if (!cur.options!.includes(input.option)) throw new RunError(400, "option must be one of the choices");
    correct = input.option === answer.canonical;
    raw = JSON.stringify(input.option);
    shown = answer.canonical;
  }

  const points = correct ? singlePoints(cur.tier!, cur.hint_used) : 0;
  await logGuess(tx, {
    run, cur, raw, normalized: null, now, method: "choice", answerId: correct ? answer.id : null,
    distance: null, correct, points, tier: correct ? cur.tier : null,
  });
  await closePrompt(tx, run, correct ? "correct" : "wrong", points, correct ? answer.id : null, now);
  return correct
    ? { correct: true, points, answer: shown, tier: cur.tier!, stale: false }
    : { correct: false, answer: shown, ...(correctOrder && { correctOrder }) };
}

async function logGuess(tx: Tx, e: {
  run: RunRow; cur: CurrentPrompt; raw: string; normalized: string | null; now: Date;
  method: "exact" | "typo" | "ambiguous" | "none" | "choice"; answerId: string | null; distance: number | null;
  correct: boolean; points: number; tier: Tier | null;
}) {
  await tx`
    INSERT INTO guess_events (created_at, player_id, game_id, run_id, prompt_id, position, raw_text, normalized,
                              matched_answer_id, match_method, distance, is_correct, points, ms_into_prompt, hint_used, tier)
    VALUES (${e.now}, ${e.run.player_id}, ${e.run.game_id}, ${e.run.id}, ${e.cur.prompt_id}, ${e.cur.position}, ${e.raw},
            ${e.normalized}, ${e.answerId}, ${e.method}, ${e.distance}, ${e.correct}, ${e.points},
            ${Math.max(0, e.now.getTime() - e.cur.started_at!.getTime())}, ${e.cur.hint_used}, ${e.tier})`;
}

// ---------------------------------------------------------------------------------------
// State machine internals

async function lockRun(tx: Tx, playerId: string, runId: string): Promise<RunRow> {
  if (!UUID.test(runId)) throw new RunError(404, "Run not found");
  const [run] = await tx<RunRow[]>`
    SELECT id, player_id, game_id, status, current_position, score, started_at
      FROM runs WHERE id = ${runId} AND player_id = ${playerId} FOR UPDATE`;
  if (!run) throw new RunError(404, "Run not found");
  return run;
}

function requireInProgress(run: RunRow) {
  if (run.status !== "in_progress") throw new RunError(409, `Run is ${run.status}`);
}

async function loadCurrent(tx: Tx, run: RunRow): Promise<CurrentPrompt> {
  const [cur] = await tx<CurrentPrompt[]>`
    SELECT rp.position, rp.prompt_id, rp.started_at, rp.deadline_at, rp.ended_at, rp.hint_used,
           p.kind, p.text, p.tier, p.hint, p.items, p.options
      FROM run_prompts rp JOIN prompts p ON p.id = rp.prompt_id
     WHERE rp.run_id = ${run.id} AND rp.position = ${run.current_position}`;
  return cur;
}

// Any request that arrives after the current Prompt's deadline (plus grace) closes it as a
// timeout first, so closing the tab can't freeze the clock. Returns whether it did.
async function settle(tx: Tx, run: RunRow, now: Date): Promise<boolean> {
  if (run.status !== "in_progress") return false;
  const cur = await loadCurrent(tx, run);
  if (!cur.deadline_at || now.getTime() <= cur.deadline_at.getTime() + GRACE_MS) return false;
  await closePrompt(tx, run, "timeout", 0, null, now);
  return true;
}

// Ends the current Prompt and moves on; after the last one the Run is finished.
async function closePrompt(tx: Tx, run: RunRow, outcome: PromptOutcome, points: number, answerId: string | null, now: Date) {
  await tx`
    UPDATE run_prompts SET ended_at = ${now}, outcome = ${outcome}, points = ${points}, answer_id = ${answerId}
     WHERE run_id = ${run.id} AND position = ${run.current_position}`;
  run.score += points;
  if (run.current_position >= RUN_LENGTH) {
    run.status = "finished";
    await tx`UPDATE runs SET status = 'finished', finished_at = ${now}, score = ${run.score} WHERE id = ${run.id}`;
  } else {
    run.current_position += 1;
    await tx`UPDATE runs SET current_position = ${run.current_position}, score = ${run.score} WHERE id = ${run.id}`;
  }
}

async function buildState(tx: Tx, run: RunRow, now: Date): Promise<RunState> {
  const base = {
    runId: run.id, status: run.status, position: run.current_position, promptCount: RUN_LENGTH,
    score: run.score, serverNow: now.toISOString(),
  };
  if (run.status !== "in_progress") return { ...base, prompt: null };

  const cur = await loadCurrent(tx, run);
  // Seeded by the Prompt id, which the client never sees, so it can't undo the shuffle
  // to recover the correct order (a seed from runId + position could be replayed).
  const seed = `${run.id}:${cur.prompt_id}`;
  const hintAvailable = cur.kind !== "open" && cur.hint !== null;
  return {
    ...base,
    prompt: {
      kind: cur.kind,
      text: cur.text,
      ...(cur.options && { options: seededShuffle(cur.options, seed) }),
      ...(cur.items && { items: shuffleOutOfOrder(cur.items, seed) }),
      hintAvailable,
      hintUsed: cur.hint_used,
      ...(cur.hint_used && cur.hint !== null && { hint: cur.hint }),
      startedAt: cur.started_at?.toISOString() ?? null,
      deadlineAt: cur.deadline_at?.toISOString() ?? null,
    },
  };
}

// ---------------------------------------------------------------------------------------
// Reveal: only once the Run is finished, so Answers never leak early

export async function getReveal(tx: Tx, playerId: string, runId: string): Promise<Reveal> {
  if (!UUID.test(runId)) throw new RunError(404, "Run not found");
  const [run] = await tx<RunRow[]>`
    SELECT id, player_id, game_id, status, current_position, score, started_at
      FROM runs WHERE id = ${runId} AND player_id = ${playerId}`;
  if (!run) throw new RunError(404, "Run not found");
  if (run.status !== "finished") throw new RunError(409, "The Reveal opens once the Run is finished");

  const prompts = await tx<{
    position: number; prompt_id: string; outcome: PromptOutcome | null; points: number; hint_used: boolean;
    answer_id: string | null; kind: PromptKind; text: string; tier: Tier | null; explanation: string | null;
    items: string[] | null; evidence_page_id: string | null;
  }[]>`
    SELECT rp.position, rp.prompt_id, rp.outcome, rp.points, rp.hint_used, rp.answer_id,
           p.kind, p.text, p.tier, p.explanation, p.items, p.evidence_page_id
      FROM run_prompts rp JOIN prompts p ON p.id = rp.prompt_id
     WHERE rp.run_id = ${run.id} ORDER BY rp.position`;
  const promptIds = prompts.map((p) => p.prompt_id);

  const answers = await tx<{
    id: string; prompt_id: string; canonical: string; tier: Tier; rarity_rank: number | null;
    evidence_page_id: string | null; evidence_quote: string | null;
  }[]>`
    SELECT id, prompt_id, canonical, tier, rarity_rank, evidence_page_id, evidence_quote
      FROM answers WHERE prompt_id = ANY(${promptIds}::uuid[]) ORDER BY rarity_rank NULLS LAST, canonical`;

  const pageIds = [...answers.map((a) => a.evidence_page_id), ...prompts.map((p) => p.evidence_page_id)].filter((x): x is string => !!x);
  const pages = new Map(
    (await tx<{ id: string; page_number: number; filename: string }[]>`
      SELECT sp.id, sp.page_number, sd.filename
        FROM source_pages sp JOIN source_documents sd ON sd.id = sp.source_document_id
       WHERE sp.id = ANY(${pageIds}::uuid[])`).map((p) => [p.id, p]),
  );
  const evidence = (pageId: string | null, quote: string | null): Evidence => {
    const page = pageId ? pages.get(pageId) : undefined;
    return page ? { documentTitle: page.filename, pageNumber: page.page_number, quote } : null;
  };

  // Last submission per Prompt, for "what you answered" on wrong or timed-out Prompts
  const lastGuesses = new Map(
    (await tx<{ position: number; raw_text: string }[]>`
      SELECT DISTINCT ON (position) position, raw_text FROM guess_events
       WHERE player_id = ${playerId} AND run_id = ${run.id} AND created_at >= ${run.started_at}
       ORDER BY position, created_at DESC`).map((g) => [g.position, g.raw_text]),
  );

  const revealPrompts: RevealPrompt[] = prompts.map((p) => {
    const own = answers.filter((a) => a.prompt_id === p.prompt_id);
    const matched = own.find((a) => a.id === p.answer_id);
    const oneShot = p.kind === "ordered_recall" || p.kind === "odd_one_out";
    const last = lastGuesses.get(p.position);
    const lastShown = last === undefined ? null : oneShot ? formatChoice(JSON.parse(last)) : last;
    const base = {
      position: p.position, kind: p.kind, text: p.text, outcome: p.outcome, points: p.points, hintUsed: p.hint_used,
      stale: p.kind === "open" && !!matched && p.points < TIER_POINTS[matched.tier],
    };

    if (p.kind === "open") {
      return {
        ...base,
        yourAnswer: matched?.canonical ?? lastShown,
        answers: own.map((a) => ({ answer: a.canonical, tier: a.tier, found: a.id === p.answer_id, evidence: evidence(a.evidence_page_id, a.evidence_quote) })),
      };
    }
    const answer = own[0];
    const correctAnswer = p.kind === "ordered_recall" ? p.items!.join(" → ") : answer.canonical;
    return {
      ...base,
      yourAnswer: matched ? correctAnswer : lastShown,
      tier: p.tier!,
      correctAnswer,
      ...(p.kind === "ordered_recall" && { correctOrder: p.items! }),
      explanation: p.explanation,
      evidence: evidence(answer.evidence_page_id ?? p.evidence_page_id, answer.evidence_quote),
    };
  });

  return { runId: run.id, gameId: run.game_id, score: run.score, prompts: revealPrompts, progress: null };
}

function formatChoice(choice: unknown): string {
  return Array.isArray(choice) ? choice.join(" → ") : String(choice);
}
