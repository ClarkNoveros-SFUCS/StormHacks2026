// Leap's Run rules and scoring. Pure and client-safe (the UI can show the same numbers).
// Spec: docs/architecture/run-and-scoring.md § Leap. Applied by lib/runs/engines/leap.ts.
import type { RunSummary } from "@/lib/runs/types";

export const LEAP_QUESTIONS = 10;
export const LEAP_QUESTION_MS = 15_000;
export const LEAP_HEARTS = 3;
export const LEAP_BASE_POINTS = 100;
export const LEAP_MAX_SPEED_BONUS = 50;
/** Correct answers needed to pass (and the Run must not end in a fall). */
export const LEAP_PASS_CORRECT = 7;

/** The multiplier for a correct answer that makes `streak` in a row (this one included). */
export function streakMultiplier(streak: number): number {
  return streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1;
}

/** 0–50, linear on the time left on the question's clock. */
export function speedBonus(msLeft: number): number {
  const clamped = Math.min(Math.max(msLeft, 0), LEAP_QUESTION_MS);
  return Math.round((LEAP_MAX_SPEED_BONUS * clamped) / LEAP_QUESTION_MS);
}

/**
 * Points for a correct answer: (100 + speed bonus) × streak multiplier, halved if the 50/50
 * was used on this question, rounded to a whole number.
 */
export function leapPoints(msLeft: number, streak: number, halved: boolean) {
  const bonus = speedBonus(msLeft);
  const multiplier = streakMultiplier(streak);
  const points = Math.round((LEAP_BASE_POINTS + bonus) * multiplier * (halved ? 0.5 : 1));
  return { points, speedBonus: bonus, multiplier };
}

export function passed(summary: Extract<RunSummary, { mode: "leap" }>): boolean {
  return summary.outcome !== "fell" && summary.stats.correct >= LEAP_PASS_CORRECT;
}
