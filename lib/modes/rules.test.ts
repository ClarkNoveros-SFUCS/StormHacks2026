import { describe, expect, it } from "vitest";
import type { RunSummary } from "@/lib/runs/types";
import { blitzPoints } from "./blitz/rules";
import { MODES, isModeId, isDiveFamily } from "./index";
import { leapPoints, speedBonus, streakMultiplier } from "./leap/rules";
import { mismatchLoss, timeBonus } from "./pairs/rules";
import { passedRun } from "./rules";

const at = "2026-10-04T12:00:00.000Z";

describe("MODES", () => {
  it("lists the five playable Modes and reserves Arena", () => {
    expect(Object.keys(MODES)).toEqual(["dive", "apogee", "leap", "pairs", "blitz", "arena"]);
    for (const m of ["dive", "apogee", "leap", "pairs", "blitz"]) expect(isModeId(m)).toBe(true);
    expect(isModeId("arena")).toBe(false);
    expect(isModeId("toString")).toBe(false);
    expect(isModeId(undefined)).toBe(false);
  });

  it("Apogee shares Dive's engine, kinds and minimum", () => {
    expect(isDiveFamily("apogee")).toBe(true);
    expect(MODES.apogee.kinds).toEqual(MODES.dive.kinds);
    expect(MODES.apogee.minPrompts).toBe(7);
    expect(isDiveFamily("leap")).toBe(false);
  });
});

describe("Leap scoring", () => {
  it("speed bonus is linear on time left, 0-50", () => {
    expect(speedBonus(15_000)).toBe(50);
    expect(speedBonus(7_500)).toBe(25);
    expect(speedBonus(0)).toBe(0);
    expect(speedBonus(-400)).toBe(0); // answered in the grace period
    expect(speedBonus(20_000)).toBe(50);
  });

  it("streak multiplier: ×1.5 from the 3rd in a row, ×2 from the 5th", () => {
    expect([1, 2, 3, 4, 5, 9].map(streakMultiplier)).toEqual([1, 1, 1.5, 1.5, 2, 2]);
  });

  it("points = (100 + speed bonus) × multiplier, halved after a 50/50", () => {
    expect(leapPoints(15_000, 1, false)).toEqual({ points: 150, speedBonus: 50, multiplier: 1 });
    expect(leapPoints(0, 1, false).points).toBe(100);
    expect(leapPoints(7_500, 3, false).points).toBe(188); // 125 × 1.5 = 187.5 → 188
    expect(leapPoints(15_000, 5, false).points).toBe(300);
    expect(leapPoints(15_000, 5, true).points).toBe(150);
  });
});

describe("Pairs scoring", () => {
  it("time bonus: 5 per whole second left", () => {
    expect(timeBonus(12_999)).toBe(60);
    expect(timeBonus(999)).toBe(0);
    expect(timeBonus(-5)).toBe(0);
  });

  it("a mismatch costs 10 but never takes the score below 0", () => {
    expect(mismatchLoss(100)).toBe(10);
    expect(mismatchLoss(4)).toBe(4);
    expect(mismatchLoss(0)).toBe(0);
  });
});

describe("Blitz scoring", () => {
  it("10 per correct, 20 once 5 are already in a row", () => {
    expect([0, 1, 4, 5, 12].map(blitzPoints)).toEqual([10, 10, 10, 20, 20]);
  });
});

describe("pass bars", () => {
  const dive = (score: number): RunSummary => ({ mode: "dive", score, finishedAt: at, outcome: "finished", stats: { prompts: 7, correct: 3, hintsUsed: 0 } });
  const leap = (correct: number, outcome: "cleared" | "fell"): RunSummary => ({
    mode: "leap", score: 0, finishedAt: at, outcome,
    stats: { questions: 10, correct, wrong: 10 - correct, timeouts: 0, heartsLeft: outcome === "fell" ? 0 : 1, bestStreak: 0, lifelineUsed: false },
  });
  const pairs = (boardsCleared: number): RunSummary => ({
    mode: "pairs", score: 0, finishedAt: at, outcome: boardsCleared === 2 ? "cleared" : "time_up",
    stats: { boardsCleared, matches: 6 * boardsCleared, mistakes: 0, timeBonus: 0 },
  });
  const blitz = (score: number): RunSummary => ({ mode: "blitz", score, finishedAt: at, outcome: "time_up", stats: { answered: 0, correct: 0, wrong: 0, bestCombo: 0 } });

  it("Dive and Apogee: score ≥ 150", () => {
    expect(passedRun(dive(150))).toBe(true);
    expect(passedRun(dive(149))).toBe(false);
    expect(passedRun({ mode: "apogee", score: 200, finishedAt: at, outcome: "finished", stats: { prompts: 7, correct: 4, hintsUsed: 1 } })).toBe(true);
  });
  it("Leap: ≥ 7 correct and not fallen", () => {
    expect(passedRun(leap(7, "cleared"))).toBe(true);
    expect(passedRun(leap(6, "cleared"))).toBe(false);
    expect(passedRun(leap(7, "fell"))).toBe(false);
  });
  it("Pairs: both Boards cleared", () => {
    expect(passedRun(pairs(2))).toBe(true);
    expect(passedRun(pairs(1))).toBe(false);
  });
  it("Blitz: ≥ 150 points", () => {
    expect(passedRun(blitz(150))).toBe(true);
    expect(passedRun(blitz(140))).toBe(false);
  });
});
