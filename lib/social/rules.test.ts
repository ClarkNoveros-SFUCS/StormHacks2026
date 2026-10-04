import { describe, expect, it } from "vitest";
import { heatLevel, levelFor, levelStartXp, rankFor, xpForDaily, xpForRun } from "./rules";

describe("xpForRun", () => {
  it("is floor(score / 5), at least 5 and at most 200", () => {
    expect(xpForRun(0)).toBe(5);
    expect(xpForRun(24)).toBe(5);
    expect(xpForRun(29)).toBe(5);
    expect(xpForRun(30)).toBe(6);
    expect(xpForRun(149)).toBe(29);
    expect(xpForRun(500)).toBe(100);
    expect(xpForRun(1000)).toBe(200);
    expect(xpForRun(5000)).toBe(200);
    expect(xpForRun(-20)).toBe(5);
  });
});

describe("xpForDaily", () => {
  it("is 50 plus 5 per streak day, the bonus capped at 50", () => {
    expect(xpForDaily(0)).toBe(50);
    expect(xpForDaily(1)).toBe(55);
    expect(xpForDaily(4)).toBe(70);
    expect(xpForDaily(10)).toBe(100);
    expect(xpForDaily(40)).toBe(100);
  });
});

describe("levels", () => {
  it("start at 0, 100, 300, 600, 1000 …", () => {
    expect([1, 2, 3, 4, 5, 6].map(levelStartXp)).toEqual([0, 100, 300, 600, 1000, 1500]);
  });

  it("levelFor finds the level and progress inside it", () => {
    expect(levelFor(0)).toMatchObject({ level: 1, xpIntoLevel: 0, xpForNext: 100, nextLevelXp: 100, rank: "Plankton" });
    expect(levelFor(99)).toMatchObject({ level: 1, xpIntoLevel: 99 });
    expect(levelFor(100)).toMatchObject({ level: 2, xpIntoLevel: 0, xpForNext: 200 });
    expect(levelFor(299)).toMatchObject({ level: 2, xpIntoLevel: 199 });
    expect(levelFor(300)).toMatchObject({ level: 3, levelStartXp: 300, nextLevelXp: 600, rank: "Shrimp" });
    expect(levelFor(1000)).toMatchObject({ level: 5, rank: "Reef Fish" });
    expect(levelFor(-5)).toMatchObject({ level: 1, totalXp: 0 });
  });

  it("is exact at every boundary up to level 60", () => {
    for (let n = 1; n <= 60; n++) {
      expect(levelFor(levelStartXp(n)).level).toBe(n);
      if (n > 1) expect(levelFor(levelStartXp(n) - 1).level).toBe(n - 1);
    }
  });
});

describe("rankFor", () => {
  it("maps levels to ocean Ranks", () => {
    const at = (l: number) => rankFor(l);
    expect([1, 2].map(at)).toEqual(["Plankton", "Plankton"]);
    expect([3, 4].map(at)).toEqual(["Shrimp", "Shrimp"]);
    expect([5, 7].map(at)).toEqual(["Reef Fish", "Reef Fish"]);
    expect([8, 11].map(at)).toEqual(["Dolphin", "Dolphin"]);
    expect([12, 16].map(at)).toEqual(["Orca", "Orca"]);
    expect([17, 99].map(at)).toEqual(["Leviathan", "Leviathan"]);
  });
});

describe("heatLevel", () => {
  it("buckets a day's XP into 0–4", () => {
    expect([0, 1, 39, 40, 99, 100, 199, 200, 900].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});
