// Gemini client for Game generation: one call per Source Document, structured JSON output.
// Spec: docs/architecture/game-generation-pipeline.md § Gemini call.
//
// Server only. It doesn't import "server-only" because scripts/generate-check.ts runs it
// with plain Node; GEMINI_API_KEY has no NEXT_PUBLIC_ prefix, so it never reaches a bundle.

import { ApiError, GoogleGenAI } from "@google/genai";
import { GAME_PROMPT_TEMPERATURE, GAME_RESPONSE_SCHEMA, GAME_SYSTEM_INSTRUCTION, gamePromptContents } from "./gemini/game-prompt.ts";
import type { GenerationRequest } from "./modes/generation.ts";

/** Dive's request (also Apogee's), the default. Other Modes pass their own (lib/modes/<mode>/generate.ts). */
const DIVE_REQUEST: GenerationRequest = {
  systemInstruction: GAME_SYSTEM_INSTRUCTION,
  responseSchema: GAME_RESPONSE_SCHEMA,
  temperature: GAME_PROMPT_TEMPERATURE,
  contents: gamePromptContents,
};

// Per attempt. Normal 3.6-flash calls take 40-120 s; a stalled one falls back instead (F31).
const TIMEOUT_MS = 150_000;
// Waits before each retry of a rate limit (429) or overload (5xx, e.g. 503 "high demand") on
// the last model to try. Earlier models get one quick retry: when GEMINI_MODEL is overloaded it
// usually stays so for minutes, and the fallback answers sooner than more retries (F31).
export const RETRY_DELAYS_MS = [2_000, 5_000, 12_000];
export const EARLY_RETRY_DELAYS_MS = [2_000];

export class GeminiError extends Error {}

export type GeminiUsage = { inputTokens: number; outputTokens: number; thinkingTokens: number };
export type GeneratedPrompts = { response: unknown; usage: GeminiUsage; model: string };
/** Per-call overrides: the models to try in order (default GEMINI_MODEL, then GEMINI_FALLBACK_MODEL) and the per-attempt timeout. */
export type GeminiCallOptions = { models?: string[]; timeoutMs?: number };

let client: GoogleGenAI | undefined;

function config() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) throw new GeminiError("GEMINI_API_KEY and GEMINI_MODEL must be set (see .env.example)");
  client ??= new GoogleGenAI({ apiKey });
  return { ai: client, model, fallback: process.env.GEMINI_FALLBACK_MODEL || null };
}

/**
 * The default models to try in order: GEMINI_MODEL, then the optional GEMINI_FALLBACK_MODEL,
 * used only when GEMINI_MODEL is still overloaded after its retries.
 */
export function defaultModels(): string[] {
  const { model, fallback } = config();
  return fallback && fallback !== model ? [model, fallback] : [model];
}

/**
 * Asks Gemini for one document's Prompts. Returns the parsed JSON unvalidated (validate.ts
 * checks it). Retries and falls back as `withFallback` says; throws GeminiError otherwise. `request` and `options` let other
 * calls (another Mode, the verification pass in lib/gemini/verify.ts) reuse the retries.
 */
export async function generateDocumentPrompts(
  title: string,
  pages: { pageNumber: number; contentMd: string }[],
  mode: GenerationRequest = DIVE_REQUEST,
  options: GeminiCallOptions = {},
): Promise<GeneratedPrompts> {
  const { ai } = config();
  const models = options.models?.length ? [...new Set(options.models)] : defaultModels();
  const request = (model: string) =>
    ai.models.generateContent({
      model,
      contents: mode.contents(title, pages),
      config: {
        systemInstruction: mode.systemInstruction,
        temperature: mode.temperature,
        responseMimeType: "application/json",
        responseJsonSchema: mode.responseSchema,
        httpOptions: { timeout: options.timeoutMs ?? TIMEOUT_MS },
      },
    });

  const { result: res, model } = await withFallback(models, request);

  const text = res.text;
  const finish = res.candidates?.[0]?.finishReason;
  if (!text) throw new GeminiError(`Gemini returned no text (finish reason ${finish ?? "unknown"})`);
  let response: unknown;
  try {
    response = JSON.parse(text);
  } catch {
    throw new GeminiError(`Gemini returned invalid JSON (finish reason ${finish ?? "unknown"}, ${text.length} chars)`);
  }
  const u = res.usageMetadata;
  return {
    response,
    model,
    usage: { inputTokens: u?.promptTokenCount ?? 0, outputTokens: u?.candidatesTokenCount ?? 0, thinkingTokens: u?.thoughtsTokenCount ?? 0 },
  };
}

/**
 * How a failed attempt is handled: "overloaded" (429, 408, 5xx, or the network) is retried,
 * "timeout" (the per-attempt timeout aborted it) moves on to the next model, "fatal" throws.
 */
export function failureKind(err: unknown): "overloaded" | "timeout" | "fatal" {
  if (err instanceof ApiError) return err.status === 429 || err.status === 408 || err.status >= 500 ? "overloaded" : "fatal";
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) return "timeout";
  if (err instanceof TypeError && /fetch failed/i.test(err.message)) return "overloaded";
  return "fatal";
}

/**
 * Tries `attempt` with each model in order. An overloaded model is retried after each of
 * EARLY_RETRY_DELAYS_MS (RETRY_DELAYS_MS for the last model), then the next model is tried; a
 * timed-out attempt moves to the next model at once. Throws GeminiError when the last model
 * fails too, or at once on a fatal error (e.g. 400). `sleep` is a seam for tests.
 */
export async function withFallback<T>(
  models: string[],
  attempt: (model: string) => Promise<T>,
  { sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) }: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<{ result: T; model: string }> {
  if (!models.length) throw new GeminiError("No Gemini model to try");
  for (const [m, model] of models.entries()) {
    const last = m === models.length - 1;
    const delays = last ? RETRY_DELAYS_MS : EARLY_RETRY_DELAYS_MS;
    for (let tries = 0; ; tries++) {
      try {
        return { result: await attempt(model), model };
      } catch (err) {
        const kind = failureKind(err);
        if (kind === "fatal" || (last && (kind === "timeout" || tries >= delays.length))) throw wrap(err);
        if (kind === "timeout" || tries >= delays.length) {
          console.warn(`Gemini ${model} ${kind === "timeout" ? "timed out" : "still unavailable after retries"}; falling back to ${models[m + 1]}`);
          break;
        }
        await sleep(delays[tries]);
      }
    }
  }
  throw new GeminiError("unreachable: the last model returns or throws");
}

function wrap(err: unknown): GeminiError {
  if (err instanceof GeminiError) return err;
  const status = err instanceof ApiError ? ` ${err.status}` : "";
  return new GeminiError(`Gemini request failed${status}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
}
