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

const TIMEOUT_MS = 240_000; // a long deck with thinking can take a couple of minutes
// Waits before each retry of a rate limit (429) or overload (5xx, e.g. 503 "high demand").
const RETRY_DELAYS_MS = [2_000, 5_000, 12_000];

export class GeminiError extends Error {}

export type GeminiUsage = { inputTokens: number; outputTokens: number; thinkingTokens: number };
export type GeneratedPrompts = { response: unknown; usage: GeminiUsage; model: string };

let client: GoogleGenAI | undefined;

function config() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) throw new GeminiError("GEMINI_API_KEY and GEMINI_MODEL must be set (see .env.example)");
  client ??= new GoogleGenAI({ apiKey });
  // Optional second model, used only when GEMINI_MODEL is still overloaded after its retries
  const fallback = process.env.GEMINI_FALLBACK_MODEL || null;
  return { ai: client, models: fallback && fallback !== model ? [model, fallback] : [model] };
}

/**
 * Asks Gemini for one document's Prompts. Returns the parsed JSON unvalidated (validate.ts
 * checks it). Retries a rate limit or server error up to 3 times, then tries
 * GEMINI_FALLBACK_MODEL if set; throws GeminiError otherwise.
 */
export async function generateDocumentPrompts(
  title: string,
  pages: { pageNumber: number; contentMd: string }[],
  mode: GenerationRequest = DIVE_REQUEST,
): Promise<GeneratedPrompts> {
  const { ai, models } = config();
  const request = (model: string) =>
    ai.models.generateContent({
      model,
      contents: mode.contents(title, pages),
      config: {
        systemInstruction: mode.systemInstruction,
        temperature: mode.temperature,
        responseMimeType: "application/json",
        responseJsonSchema: mode.responseSchema,
        httpOptions: { timeout: TIMEOUT_MS },
      },
    });

  let res;
  let model = models[0];
  models: for (const [m, candidate] of models.entries()) {
    model = candidate;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await request(model);
        break models;
      } catch (err) {
        if (!retryable(err)) throw wrap(err);
        if (attempt >= RETRY_DELAYS_MS.length) {
          if (m === models.length - 1) throw wrap(err);
          console.warn(`Gemini ${model} still unavailable after retries; falling back to ${models[m + 1]}`);
          continue models;
        }
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  if (!res) throw new GeminiError("Gemini returned no response");

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

function retryable(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 429 || err.status >= 500);
}

function wrap(err: unknown): GeminiError {
  if (err instanceof GeminiError) return err;
  const status = err instanceof ApiError ? ` ${err.status}` : "";
  return new GeminiError(`Gemini request failed${status}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
}
