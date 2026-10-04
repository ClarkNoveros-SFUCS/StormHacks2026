// Estimated Gemini cost for the generation scripts (generate:check, generate:eval).
// Not used by the app. Pure, so scripts can load it with plain Node.

import type { GeminiUsage } from "../gemini.ts";

/**
 * USD per 1M tokens, standard (non-batch) tier, prompts ≤ 200k tokens. Thinking tokens are
 * billed as output. Estimates only: check ai.google.dev/pricing before trusting a total.
 */
export const GEMINI_PRICES_USD_PER_M: Record<string, { input: number; output: number }> = {
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "gemini-3.7-flash": { input: 0.75, output: 3.75 },
  "gemini-3.6-flash": { input: 0.75, output: 3.75 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
};

/** Estimated USD for one call, or null for a model without a price above. */
export function estimateCostUsd(model: string, usage: GeminiUsage): number | null {
  const price = GEMINI_PRICES_USD_PER_M[model];
  if (!price) return null;
  return (usage.inputTokens * price.input + (usage.outputTokens + usage.thinkingTokens) * price.output) / 1e6;
}
