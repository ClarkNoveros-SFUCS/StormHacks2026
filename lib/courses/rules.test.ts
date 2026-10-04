import { describe, expect, it } from "vitest";
import type { RunSummary } from "@/lib/runs/types";
import { lockedTopics, nextTopicIndex, recordRun, sortModes } from "./rules";

const at = "2026-10-04T12:00:00.000Z";
const dive = (score: number): RunSummary => ({ mode: "dive", score, finishedAt: at, outcome: "finished", stats: { prompts: 7, correct: 3, hintsUsed: 0 } });
const apogee = (score: number): RunSummary => ({ ...dive(score), mode: "apogee" }) as RunSummary;
const leap = (correct: number, outcome: "cleared" | "fell"): RunSummary => ({
  mode: "leap", score: correct * 100, finishedAt: at, outcome,
  stats: { questions: 10, correct, wrong: 10 - correct, timeouts: 0, heartsLeft: outcome === "fell" ? 0 : 1, bestStreak: correct, lifelineUsed: false },
});
const pairs = (outcome: "cleared" | "time_up", score = 600): RunSummary => ({
  mode: "pairs", score, finishedAt: at, outcome, stats: { boardsCleared: outcome === "cleared" ? 2 : 1, matches: 12, mistakes: 0, timeBonus: 0 },
});
const blitz = (score: number): RunSummary => ({
  mode: "blitz", score, finishedAt: at, outcome: "time_up", stats: { answered: 20, correct: 15, wrong: 5, bestCombo: 6 },
});

describe("unlock rule", () => {
  it("unlocks Topic 1 always and Topic N+1 once Topic N is passed", () => {
    expect(lockedTopics([false, false, false])).toEqual([false, true, true]);
    expect(lockedTopics([true, false, false])).toEqual([false, false, true]);
    expect(lockedTopics([true, true, true])).toEqual([false, false, false]);
    expect(lockedTopics([])).toEqual([]);
  });

  it("never locks a passed Topic, even if the one before isn't passed", () => {
    // e.g. a Topic inserted before it by a later seed
    expect(lockedTopics([false, true, false])).toEqual([false, false, false]);
  });

  it("points Continue at the first unlocked Topic not passed yet", () => {
    expect(nextTopicIndex([false, false])).toBe(0);
    expect(nextTopicIndex([true, false, false])).toBe(1);
    expect(nextTopicIndex([true, true])).toBeNull();
    expect(nextTopicIndex([])).toBeNull();
  });
});

describe("recordRun (pass dispatch per Mode)", () => {
  it("applies each Mode's pass bar", () => {
    expect(recordRun({}, dive(150)).passed).toBe(true);
    expect(recordRun({}, dive(149)).passed).toBe(false);
    expect(recordRun({}, apogee(200)).passed).toBe(true);
    expect(recordRun({}, leap(7, "cleared")).passed).toBe(true);
    expect(recordRun({}, leap(6, "cleared")).passed).toBe(false);
    expect(recordRun({}, leap(8, "fell")).passed).toBe(false);
    expect(recordRun({}, pairs("cleared")).passed).toBe(true);
    expect(recordRun({}, pairs("time_up", 900)).passed).toBe(false);
    expect(recordRun({}, blitz(150)).passed).toBe(true);
    expect(recordRun({}, blitz(140)).passed).toBe(false);
  });

  it("keeps the best score and a pass per Mode, and counts Runs", () => {
    let { modes } = recordRun({}, dive(160));
    expect(modes).toEqual({ dive: { best: 160, passed: true, runs: 1 } });
    ({ modes } = recordRun(modes, dive(40)));
    expect(modes.dive).toEqual({ best: 160, passed: true, runs: 2 }); // a worse Run never undoes a pass
    ({ modes } = recordRun(modes, leap(3, "fell")));
    expect(modes).toEqual({ dive: { best: 160, passed: true, runs: 2 }, leap: { best: 300, passed: false, runs: 1 } });
  });

  it("records a first Run scoring 0 as best 0", () => {
    expect(recordRun({}, blitz(0)).modes.blitz).toEqual({ best: 0, passed: false, runs: 1 });
  });
});

describe("sortModes", () => {
  it("orders by MODES order", () => {
    const rows = [{ mode: "blitz" }, { mode: "dive" }, { mode: "pairs" }, { mode: "apogee" }, { mode: "leap" }] as const;
    expect(sortModes([...rows]).map((r) => r.mode)).toEqual(["dive", "apogee", "leap", "pairs", "blitz"]);
  });
});
