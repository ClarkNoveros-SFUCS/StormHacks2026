// Blitz's Run rules and scoring. Pure and client-safe.
// Spec: docs/architecture/run-and-scoring.md § Blitz. Applied by lib/runs/engines/blitz.ts.
import type { RunSummary } from "@/lib/runs/types";

export const BLITZ_MS = 60_000;
export const BLITZ_POINTS = 10;
/** After this many correct in a row, each further correct answer scores double. */
export const BLITZ_COMBO_AT = 5;
export const BLITZ_PENALTY_MS = 3_000;
/** The fewest statements a Blitz Game (and so a Run's deck) needs. */
export const BLITZ_MIN_DECK = 30;
/** A Run's deck is at most this many statements, drawn at random from the Game. */
export const BLITZ_MAX_DECK = 120;
export const BLITZ_PASS_SCORE = 150;

/** Points for a correct answer given the combo before it: 10, or 20 once 5+ in a row. */
export function blitzPoints(comboBefore: number): number {
  return comboBefore >= BLITZ_COMBO_AT ? BLITZ_POINTS * 2 : BLITZ_POINTS;
}

export function passed(summary: Extract<RunSummary, { mode: "blitz" }>): boolean {
  return summary.score >= BLITZ_PASS_SCORE;
}
