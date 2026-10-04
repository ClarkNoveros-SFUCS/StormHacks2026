import "server-only";
import { matchGuess } from "@/lib/matching/match-guess";
import { normalize } from "@/lib/matching/normalize";
import { openPoints, PENALTY_MS, PROMPT_MS, RUN_LENGTH, singlePoints, TIER_POINTS } from "@/lib/modes/dive/rules";
import type { DiveFamilyModeId } from "@/lib/modes";
import type { Tier } from "@/lib/scoring/tiers";
import { seededShuffle, shuffleOutOfOrder } from "../shuffle";
import type {
  DiveReveal, DiveRunState, GuessResponse, GuessResult, HintResponse, PromptKind, PromptOutcome, RevealPrompt, RunSummary,
} from "../types";
import {
  drawPrompts, EARLY_TIMEOUT_MS, evidenceLookup, GRACE_MS, logGuess, RunError, saveRun,
  type ModeEngine, type RevealBase, type RunRow, type Tx,
} from "./common";

// Dive's state machine; Apogee plays by exactly the same rules. Spec: run-and-scoring.md
// § Dive and Apogee. 7 Prompts, 25 s each; typed Prompts take guesses until correct (−3 s per
// wrong one), put-in-order and odd-one-out take one submission; Hints drop a Tier.

export const MAX_GUESS_LENGTH = 500;
const TYPED_KINDS: PromptKind[] = ["open", "cloze", "definition_to_term"];

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

export const diveEngine: ModeEngine = {
  draw: (tx, gameId) => drawPrompts(tx, gameId, null, RUN_LENGTH, RUN_LENGTH, "Prompts"),
  initialState: () => null,

  async state(tx, run, now) {
    await settle(tx, run, now);
    return buildState(tx, run, now);
  },

  async start(tx, run, now) {
    // If this closed an expired Prompt, don't start the next one's clock in the same call:
    // the client shows the timeout first, then asks again.
    if (!(await settle(tx, run, now))) {
      await tx`
        UPDATE run_prompts SET started_at = ${now}, deadline_at = ${new Date(now.getTime() + PROMPT_MS)}
         WHERE run_id = ${run.id} AND position = ${run.current_position} AND started_at IS NULL`;
    }
    return buildState(tx, run, now);
  },

  async timeout(tx, run, now) {
    if (run.status === "in_progress" && !(await settle(tx, run, now))) {
      const cur = await loadCurrent(tx, run);
      if (cur.deadline_at && now.getTime() >= cur.deadline_at.getTime() - EARLY_TIMEOUT_MS) {
        await closePrompt(tx, run, "timeout", 0, null, now);
      }
    }
    return buildState(tx, run, now);
  },

  summary: (tx, run) => diveSummary(tx, run),
  reveal: (tx, run, base) => diveReveal(tx, run, base),
};

// ---------------------------------------------------------------------------------------
// Guessing (POST /guess, /hint)

export async function diveGuess(tx: Tx, run: RunRow, body: unknown, now: Date): Promise<GuessResponse> {
  const input = parseGuessBody(body);
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

export async function diveHint(tx: Tx, run: RunRow, now: Date): Promise<HintResponse> {
  if (await settle(tx, run, now)) throw new RunError(409, "That Prompt timed out");
  const cur = await loadCurrent(tx, run);
  if (!cur.started_at) throw new RunError(409, "Prompt hasn't started");
  if (cur.kind === "open" || cur.hint === null) throw new RunError(409, "This Prompt has no Hint");
  if (!cur.hint_used) {
    await tx`UPDATE run_prompts SET hint_used = true WHERE run_id = ${run.id} AND position = ${cur.position}`;
  }
  return { hint: cur.hint, state: await buildState(tx, run, now) };
}

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
  const event = { run, promptId: cur.prompt_id, position: cur.position, startedAt: cur.started_at!, hintUsed: cur.hint_used, raw, normalized, now };

  if (!match.matched) {
    await logGuess(tx, { ...event, method: match.method, answerId: null, distance: null, correct: false, points: 0, tier: null });
    const deadline = new Date(cur.deadline_at!.getTime() - PENALTY_MS);
    await tx`UPDATE run_prompts SET deadline_at = ${deadline} WHERE run_id = ${run.id} AND position = ${cur.position}`;
    if (deadline.getTime() <= now.getTime()) await closePrompt(tx, run, "timeout", 0, null, now); // the penalty ran the clock out
    return { correct: false, penaltyMs: PENALTY_MS as 3000 };
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
    run, promptId: cur.prompt_id, position: cur.position, startedAt: cur.started_at!, hintUsed: cur.hint_used,
    raw, normalized: null, now, method: "choice", answerId: correct ? answer.id : null,
    distance: null, correct, points, tier: correct ? cur.tier : null,
  });
  await closePrompt(tx, run, correct ? "correct" : "wrong", points, correct ? answer.id : null, now);
  return correct
    ? { correct: true, points, answer: shown, tier: cur.tier!, stale: false }
    : { correct: false, answer: shown, ...(correctOrder && { correctOrder }) };
}

// ---------------------------------------------------------------------------------------
// State machine internals

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
    await saveRun(tx, run, now, true);
  } else {
    run.current_position += 1;
    await saveRun(tx, run, now);
  }
}

async function buildState(tx: Tx, run: RunRow, now: Date): Promise<DiveRunState> {
  const base = {
    runId: run.id, gameId: run.game_id, mode: run.mode as DiveFamilyModeId, status: run.status,
    position: run.current_position, promptCount: RUN_LENGTH, score: run.score, serverNow: now.toISOString(),
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
      ...(cur.kind !== "open" && cur.tier && { tier: cur.tier }),
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
// Summary and Reveal (only once the Run is finished, so Answers never leak early)

async function diveSummary(tx: Tx, run: RunRow): Promise<RunSummary> {
  const [s] = await tx<{ correct: number; hints: number }[]>`
    SELECT count(*) FILTER (WHERE outcome = 'correct')::int AS correct, count(*) FILTER (WHERE hint_used)::int AS hints
      FROM run_prompts WHERE run_id = ${run.id}`;
  return {
    mode: run.mode as DiveFamilyModeId,
    score: run.score,
    finishedAt: run.finished_at!.toISOString(),
    outcome: "finished",
    stats: { prompts: RUN_LENGTH, correct: s.correct, hintsUsed: s.hints },
  };
}

async function diveReveal(tx: Tx, run: RunRow, base: RevealBase): Promise<DiveReveal> {
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

  const evidence = await evidenceLookup(tx, [...answers.map((a) => a.evidence_page_id), ...prompts.map((p) => p.evidence_page_id)]);

  // Last submission per Prompt, for "what you answered" on wrong or timed-out Prompts
  const lastGuesses = new Map(
    (await tx<{ position: number; raw_text: string }[]>`
      SELECT DISTINCT ON (position) position, raw_text FROM guess_events
       WHERE player_id = ${run.player_id} AND run_id = ${run.id} AND created_at >= ${run.started_at}
       ORDER BY position, created_at DESC`).map((g) => [g.position, g.raw_text]),
  );

  const revealPrompts: RevealPrompt[] = prompts.map((p) => {
    const own = answers.filter((a) => a.prompt_id === p.prompt_id);
    const matched = own.find((a) => a.id === p.answer_id);
    const oneShot = p.kind === "ordered_recall" || p.kind === "odd_one_out";
    const last = lastGuesses.get(p.position);
    const lastShown = last === undefined ? null : oneShot ? formatChoice(JSON.parse(last)) : last;
    const common = {
      position: p.position, kind: p.kind, text: p.text, outcome: p.outcome, points: p.points, hintUsed: p.hint_used,
      stale: p.kind === "open" && !!matched && p.points < TIER_POINTS[matched.tier],
    };

    if (p.kind === "open") {
      return {
        ...common,
        yourAnswer: matched?.canonical ?? lastShown,
        answers: own.map((a) => ({ answer: a.canonical, tier: a.tier, found: a.id === p.answer_id, evidence: evidence(a.evidence_page_id, a.evidence_quote) })),
      };
    }
    const answer = own[0];
    const correctAnswer = p.kind === "ordered_recall" ? p.items!.join(" → ") : answer.canonical;
    return {
      ...common,
      yourAnswer: matched ? correctAnswer : lastShown,
      tier: p.tier!,
      correctAnswer,
      ...(p.kind === "ordered_recall" && { correctOrder: p.items! }),
      explanation: p.explanation,
      evidence: evidence(answer.evidence_page_id ?? p.evidence_page_id, answer.evidence_quote),
    };
  });

  return { ...base, mode: run.mode as DiveFamilyModeId, prompts: revealPrompts };
}

function formatChoice(choice: unknown): string {
  return Array.isArray(choice) ? choice.join(" → ") : String(choice);
}
