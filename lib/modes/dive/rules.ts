// Dive's Run rules and scoring (Apogee shares them unchanged). Pure and client-safe.
// Spec: docs/architecture/run-and-scoring.md § Dive and Apogee. The state machine that applies
// them is lib/runs/engines/dive.ts.
import type { RunSummary } from "@/lib/runs/types";

export { openPoints, singlePoints } from "@/lib/scoring/points";
export { TIER_POINTS } from "@/lib/scoring/tiers";

export const RUN_LENGTH = 7;
export const PROMPT_MS = 25_000;
/** A wrong typed guess moves the deadline this much earlier. */
export const PENALTY_MS = 3_000;

/** Pass bar (Courses): a Run scoring at least this much (−1,500 m in Dive). */
export const PASS_SCORE = 150;

export function passed(summary: Extract<RunSummary, { mode: "dive" | "apogee" }>): boolean {
  return summary.score >= PASS_SCORE;
}
