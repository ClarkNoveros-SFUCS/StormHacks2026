// Pairs' Run rules and scoring. Pure and client-safe.
// Spec: docs/architecture/run-and-scoring.md § Pairs. Applied by lib/runs/engines/pairs.ts.
import type { RunSummary } from "@/lib/runs/types";

export const PAIRS_BOARDS = 2;
export const PAIRS_PER_BOARD = 6;
export const PAIRS_BOARD_MS = 60_000;
export const PAIRS_MATCH_POINTS = 50;
export const PAIRS_MISMATCH_POINTS = 10;
export const PAIRS_MISMATCH_PENALTY_MS = 2_000;
export const PAIRS_BONUS_PER_SECOND = 5;

/** Bonus for clearing a Board: 5 points per whole second left on its clock. */
export function timeBonus(msLeft: number): number {
  return PAIRS_BONUS_PER_SECOND * Math.max(0, Math.floor(msLeft / 1000));
}

/** Points a mismatch takes: 10, but the Run's score never goes below 0. */
export function mismatchLoss(score: number): number {
  return Math.min(PAIRS_MISMATCH_POINTS, Math.max(0, score));
}

export function passed(summary: Extract<RunSummary, { mode: "pairs" }>): boolean {
  return summary.stats.boardsCleared >= PAIRS_BOARDS;
}
