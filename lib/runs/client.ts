// Browser helpers for the Run API (every Mode). Client-safe: plain fetch, no server imports.
// Spec: docs/architecture/run-and-scoring.md § API. Errors come back as RunApiError with the
// HTTP status and the server's `{ error }` message.
import type { GuessBody, GuessResponse, HintResponse, PairBody, PairResponse, Reveal, RunState } from "./types";
import type { AnswerBody, AnswerResponse, BlitzAnswerBody, BlitzAnswerResponse, LeapAnswerBody, LeapAnswerResponse, LifelineResponse } from "./types";

export class RunApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Server clock offset in ms: add it to Date.now() to get the server's time. */
export type Clock = { offset: number };

async function call<T>(path: string, init?: RequestInit, clock?: Clock): Promise<T> {
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: init?.body ? { "content-type": "application/json" } : undefined,
      cache: "no-store",
    });
  } catch {
    throw new RunApiError(0, "Connection lost");
  }
  const t1 = Date.now();
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; serverNow?: string; state?: { serverNow?: string } };
  if (!res.ok) throw new RunApiError(res.status, data.error ?? `Request failed (${res.status})`);
  // Every state carries serverNow; assume it was stamped halfway through the round trip.
  const serverNow = data.serverNow ?? data.state?.serverNow;
  if (clock && serverNow) clock.offset = Date.parse(serverNow) - (t0 + t1) / 2;
  return data;
}

const post = (body?: unknown): RequestInit => ({ method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

function answerCall(runId: string, body: LeapAnswerBody, clock?: Clock): Promise<LeapAnswerResponse>;
function answerCall(runId: string, body: BlitzAnswerBody, clock?: Clock): Promise<BlitzAnswerResponse>;
function answerCall(runId: string, body: AnswerBody, clock?: Clock): Promise<AnswerResponse> {
  return call<AnswerResponse>(`/api/runs/${runId}/answer`, post(body), clock);
}

export const runApi = {
  /** POST /api/games/[gameId]/runs → { runId } (abandons your other in-progress Runs). */
  create: (gameId: string) => call<{ runId: string }>(`/api/games/${gameId}/runs`, post()),
  state: <S extends RunState = RunState>(runId: string, clock?: Clock) => call<S>(`/api/runs/${runId}`, undefined, clock),
  startPrompt: <S extends RunState = RunState>(runId: string, clock?: Clock) => call<S>(`/api/runs/${runId}/start-prompt`, post(), clock),
  timeout: <S extends RunState = RunState>(runId: string, clock?: Clock) => call<S>(`/api/runs/${runId}/timeout`, post(), clock),
  guess: (runId: string, body: GuessBody, clock?: Clock) => call<GuessResponse>(`/api/runs/${runId}/guess`, post(body), clock),
  hint: (runId: string, clock?: Clock) => call<HintResponse>(`/api/runs/${runId}/hint`, post(), clock),
  /** Leap `{ optionId }` → LeapAnswerResponse; Blitz `{ value }` → BlitzAnswerResponse. */
  answer: answerCall,
  /** Leap's one 50/50 on the current question → { hiddenOptionIds, state }. */
  lifeline: (runId: string, clock?: Clock, position?: number) => call<LifelineResponse>(`/api/runs/${runId}/lifeline`, post(position === undefined ? undefined : { position }), clock),
  reveal: <R extends Reveal = Reveal>(runId: string) => call<R>(`/api/runs/${runId}/reveal`),
  /** Pairs: POST /pair { termId, definitionId, board? } (F25). */
  pair: (runId: string, body: PairBody, clock?: Clock) => call<PairResponse>(`/api/runs/${runId}/pair`, post(body), clock),
  /** Blitz: POST /answer { value, position? } (F25). Leap's /answer body is LeapAnswerBody. */
  blitzAnswer: (runId: string, body: BlitzAnswerBody, clock?: Clock) => call<BlitzAnswerResponse>(`/api/runs/${runId}/answer`, post(body), clock),
};

/** Milliseconds left until an ISO deadline, by the server's clock. */
export function msUntil(deadlineAt: string, clock: Clock): number {
  return Date.parse(deadlineAt) - (Date.now() + clock.offset);
}
