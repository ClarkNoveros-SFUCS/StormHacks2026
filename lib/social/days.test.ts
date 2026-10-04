import { describe, expect, it } from "vitest";
import { addDays, computeStreak, isDay, vancouverDay } from "./days";

describe("vancouverDay", () => {
  it("uses Vancouver's calendar, not UTC", () => {
    // 06:59Z on Oct 5 is 23:59 PDT on Oct 4; 07:00Z is midnight Oct 5
    expect(vancouverDay(new Date("2026-10-05T06:59:00Z"))).toBe("2026-10-04");
    expect(vancouverDay(new Date("2026-10-05T07:00:00Z"))).toBe("2026-10-05");
    // Winter (PST, UTC−8)
    expect(vancouverDay(new Date("2026-12-01T07:59:00Z"))).toBe("2026-11-30");
    expect(vancouverDay(new Date("2026-12-01T08:00:00Z"))).toBe("2026-12-01");
  });
});

describe("addDays / isDay", () => {
  it("does calendar arithmetic across months and leap days", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-01-01", -365)).toBe("2025-01-01");
  });
  it("accepts only real YYYY-MM-DD days", () => {
    expect(isDay("2026-10-04")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("2026-10-4")).toBe(false);
    expect(isDay("yesterday")).toBe(false);
  });
});

describe("computeStreak", () => {
  const today = "2026-10-10";

  it("is 0 with no play", () => {
    expect(computeStreak([], today)).toEqual({ current: 0, longest: 0, playedToday: false });
  });

  it("counts back from today once today is played", () => {
    expect(computeStreak(["2026-10-08", "2026-10-09", "2026-10-10"], today)).toEqual({ current: 3, longest: 3, playedToday: true });
  });

  it("stays lit through today when yesterday was played", () => {
    expect(computeStreak(["2026-10-08", "2026-10-09"], today)).toEqual({ current: 2, longest: 2, playedToday: false });
  });

  it("breaks after a missed day", () => {
    expect(computeStreak(["2026-10-07", "2026-10-08"], today)).toEqual({ current: 0, longest: 2, playedToday: false });
  });

  it("keeps the longest streak from the past", () => {
    const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-10-10"];
    expect(computeStreak(days, today)).toEqual({ current: 1, longest: 4, playedToday: true });
  });

  it("ignores duplicates and future days", () => {
    expect(computeStreak(["2026-10-10", "2026-10-10", "2026-10-11"], today)).toEqual({ current: 1, longest: 1, playedToday: true });
  });

  it("crosses month boundaries", () => {
    expect(computeStreak(["2026-09-30", "2026-10-01"], "2026-10-01").current).toBe(2);
  });
});
