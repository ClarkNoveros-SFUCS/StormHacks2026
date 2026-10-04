import { describe, expect, it } from "vitest";
import { lumenLine, modeRunStats, scoreBuckets, wordsFor } from "./model";

describe("wordsFor", () => {
  it("gives each Mode its Play wording and score metaphor", () => {
    expect(wordsFor("dive").play).toBe("▼ BEGIN DESCENT ▼");
    expect(wordsFor("dive").score(120)).toBe("−1,200 m");
    expect(wordsFor("apogee").play).toBe("LAUNCH");
    expect(wordsFor("apogee").score(345)).toBe("345 km");
    expect(wordsFor("leap").play).toBe("JUMP IN");
    expect(wordsFor("pairs").play).toBe("START MATCHING");
    expect(wordsFor("blitz").play).toBe("GO");
    expect(wordsFor("blitz").score(1234)).toBe("1,234 pts");
  });
});

describe("modeRunStats", () => {
  it("is all zeros with no Runs", () => {
    expect(modeRunStats([])).toEqual({
      bestStreak: 0,
      heartsLeftOnBest: null,
      summits: 0,
      bestClearMs: null,
      clears: 0,
      bestCombo: 0,
      bestCorrect: 0,
    });
  });

  it("ignores Dive Runs (null state)", () => {
    expect(modeRunStats([{ score: 300, outcome: null, state: null }]).heartsLeftOnBest).toBeNull();
  });

  it("folds Leap Runs: best streak, Hearts on the best Run, summits", () => {
    const s = modeRunStats([
      { score: 900, outcome: "fell", state: { hearts: 0, bestStreak: 6, correct: 6 } },
      { score: 1400, outcome: "cleared", state: { hearts: 2, bestStreak: 4, correct: 9 } },
      { score: 1100, outcome: "cleared", state: { hearts: 3, bestStreak: 5, correct: 10 } },
    ]);
    expect(s.bestStreak).toBe(6);
    expect(s.heartsLeftOnBest).toBe(2);
    expect(s.summits).toBe(2);
    expect(s.clears).toBe(0);
  });

  it("folds Pairs Runs: fastest clear of both Boards", () => {
    const board = (start: string, end: string) => ({ startedAt: start, endedAt: end, cleared: true });
    const s = modeRunStats([
      {
        score: 700,
        outcome: "cleared",
        state: { boards: [board("2026-10-04T10:00:00Z", "2026-10-04T10:00:40Z"), board("2026-10-04T10:01:00Z", "2026-10-04T10:01:35Z")] },
      },
      {
        score: 650,
        outcome: "cleared",
        state: { boards: [board("2026-10-04T11:00:00Z", "2026-10-04T11:00:30Z"), board("2026-10-04T11:01:00Z", "2026-10-04T11:01:31Z")] },
      },
      { score: 300, outcome: "time_up", state: { boards: [board("2026-10-04T12:00:00Z", "2026-10-04T12:00:05Z")] } },
    ]);
    expect(s.clears).toBe(2);
    expect(s.bestClearMs).toBe(61_000);
    expect(s.summits).toBe(0);
  });

  it("folds Blitz Runs: best combo and most correct", () => {
    const s = modeRunStats([
      { score: 120, outcome: "time_up", state: { bestCombo: 7, correct: 11 } },
      { score: 160, outcome: "time_up", state: { bestCombo: 4, correct: 14 } },
    ]);
    expect(s.bestCombo).toBe(7);
    expect(s.bestCorrect).toBe(14);
  });
});

describe("scoreBuckets", () => {
  it("puts every score in one of the buckets", () => {
    const b = scoreBuckets([0, 50, 99, 100], 10);
    expect(b).toHaveLength(10);
    expect(b.reduce((n, x) => n + x.n, 0)).toBe(4);
    expect(b[9].n).toBe(2); // 99 and the top score (100) share the last bucket
  });
});

describe("lumenLine", () => {
  it("greets a first Run in the Mode's voice", () => {
    expect(lumenLine({ mode: "apogee", runCount: 0, masteryPct: 0, lastWasBest: false })).toMatch(/pad/);
  });
  it("cheers a new best", () => {
    expect(lumenLine({ mode: "dive", runCount: 3, masteryPct: 20, lastWasBest: true })).toMatch(/best yet/);
  });
  it("explains a locked Topic", () => {
    expect(lumenLine({ mode: "leap", runCount: 0, masteryPct: 0, lastWasBest: false, locked: true })).toMatch(/locked/);
  });
});
