// Arena's Run rules and scoring. Pure and client-safe (the UI shows the same numbers).
// Spec: docs/architecture/run-and-scoring.md § Arena. Applied by lib/runs/engines/arena.ts.
//
// Arena plays Leap's multiple-choice questions as targets in a first-person room: a hit is an
// answer. The right target scores like Leap (speed bonus × streak multiplier); a wrong target
// shatters, costs 3 s and 25 points off that question's score, and the question stays open.
import type { RunSummary } from "@/lib/runs/types";
import { streakMultiplier } from "../leap/rules";

export { streakMultiplier };

export const ARENA_QUESTIONS = 10;
export const ARENA_QUESTION_MS = 20_000;
export const ARENA_BASE_POINTS = 100;
export const ARENA_MAX_SPEED_BONUS = 50;
/** Taken off the question's clock per wrong hit. */
export const ARENA_PENALTY_MS = 3_000;
/** Taken off the question's points per wrong hit (before the floor). */
export const ARENA_WRONG_HIT_POINTS = 25;
/** A correct hit never scores less than this. */
export const ARENA_MIN_POINTS = 25;
/** Correct questions needed to pass. */
export const ARENA_PASS_CORRECT = 7;

/** 0–50, linear on the time left on the question's clock (out of 20 s). */
export function arenaSpeedBonus(msLeft: number): number {
  const clamped = Math.min(Math.max(msLeft, 0), ARENA_QUESTION_MS);
  return Math.round((ARENA_MAX_SPEED_BONUS * clamped) / ARENA_QUESTION_MS);
}

/**
 * Points for hitting the right target: (100 + speed bonus) × streak multiplier, rounded, then
 * −25 per wrong hit on this question, never below 25. `streak` includes this hit.
 */
export function arenaPoints(msLeft: number, streak: number, wrongHits: number) {
  const bonus = arenaSpeedBonus(msLeft);
  const multiplier = streakMultiplier(streak);
  const raw = Math.round((ARENA_BASE_POINTS + bonus) * multiplier);
  const points = Math.max(ARENA_MIN_POINTS, raw - ARENA_WRONG_HIT_POINTS * Math.max(0, wrongHits));
  return { points, speedBonus: bonus, multiplier };
}

/** Correct hits over every hit (wrong ones included); 0 with no hits. Misses that hit no target aren't counted. */
export function accuracy(correct: number, wrongHits: number): number {
  const shots = correct + wrongHits;
  return shots === 0 ? 0 : correct / shots;
}

export function passed(summary: Extract<RunSummary, { mode: "arena" }>): boolean {
  return summary.stats.correct >= ARENA_PASS_CORRECT;
}
