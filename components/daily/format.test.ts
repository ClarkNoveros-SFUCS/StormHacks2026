import { describe, expect, it } from "vitest";
import { clockParts, crowdCaption, dayLabel, findRateLookup, histogramPoints, lumenLine, metres } from "./format";

const streak = (current: number) => ({ current, longest: current, playedToday: false });
const me = (status: "not_played" | "in_progress" | "counted", daily = 0) => ({
  status,
  runId: null,
  result: null,
  streak: streak(0),
  dailyStreak: streak(daily),
});

describe("dayLabel / metres", () => {
  it("formats a Vancouver day without shifting it", () => {
    expect(dayLabel("2026-10-04")).toBe("Sunday, Oct 4");
    expect(dayLabel("2026-10-04", { weekday: false })).toBe("Oct 4");
  });
  it("shows depth with a true minus sign", () => {
    expect(metres(140)).toBe("−1,400 m");
    expect(metres(0)).toBe("0 m");
  });
});

describe("clockParts", () => {
  it("splits into zero-padded HH MM SS and never goes negative", () => {
    expect(clockParts(3_723_000)).toEqual(["01", "02", "03"]);
    expect(clockParts(-5)).toEqual(["00", "00", "00"]);
  });
});

describe("crowdCaption", () => {
  it("says better-than for a counted dive", () => {
    expect(crowdCaption({ players: 12, betterThanPct: 75 }, true)).toBe("BETTER THAN 75% OF TODAY'S PLAYERS");
  });
  it("marks practice and the first diver", () => {
    expect(crowdCaption({ players: 12, betterThanPct: 40 }, false)).toBe("PRACTICE · WOULD BEAT 40% OF TODAY'S PLAYERS");
    expect(crowdCaption({ players: 1, betterThanPct: 0 }, true)).toBe("YOU'RE THE FIRST DIVER TODAY");
    expect(crowdCaption({ players: 0, betterThanPct: null }, false)).toBe("NOBODY HAS COUNTED A DIVE YET TODAY");
  });
});

describe("histogramPoints", () => {
  it("weights bucket middles by count and skips empty buckets", () => {
    const h = histogramPoints({ bucketSize: 50, histogram: [{ bucket: 0, count: 0 }, { bucket: 50, count: 2 }, { bucket: 100, count: 1 }] });
    expect(h).toEqual({ values: [75, 125], weights: [2, 1] });
  });
});

describe("findRateLookup", () => {
  const crowd = {
    players: 4,
    answerFindRates: [
      { answerId: "a", position: 1, answer: "Quicksort", pct: 75 },
      { answerId: "b", position: 1, answer: "Bogosort", pct: 0 },
      { answerId: "c", position: 4, answer: "Alan Turing", pct: 50 },
    ],
  };
  it("matches an Open Answer by position and text, ignoring case", () => {
    expect(findRateLookup(crowd)(1, "quicksort")).toBe(75);
    expect(findRateLookup(crowd)(1, "Bogosort")).toBe(0);
  });
  it("matches a single-answer Prompt by position", () => {
    expect(findRateLookup(crowd)(4, "Turing")).toBe(50);
    expect(findRateLookup(crowd)(1, "Mergesort")).toBeNull();
  });
  it("is empty without a crowd", () => {
    expect(findRateLookup({ players: 0, answerFindRates: crowd.answerFindRates })(1, "Quicksort")).toBeNull();
    expect(findRateLookup(null)(1, "Quicksort")).toBeNull();
  });
});

describe("lumenLine", () => {
  it("covers signed out, each status and the crowd", () => {
    expect(lumenLine({ theme: "Computing", players: 0, me: null }, null)).toMatch(/Sign in/);
    expect(lumenLine({ theme: "Computing", players: 0, me: me("not_played") }, null)).toMatch(/Computing/);
    expect(lumenLine({ theme: "Computing", players: 0, me: me("not_played", 3) }, null)).toMatch(/3-day/);
    expect(lumenLine({ theme: "Computing", players: 0, me: me("in_progress") }, null)).toMatch(/still down there/);
    expect(lumenLine({ theme: "Computing", players: 1, me: me("counted") }, 0)).toMatch(/First one down/);
    expect(lumenLine({ theme: "Computing", players: 9, me: me("counted") }, 80)).toMatch(/80%/);
  });
});
