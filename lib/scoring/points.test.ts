import { describe, expect, it } from "vitest";
import { openPoints, singlePoints } from "./points";

describe("openPoints", () => {
  it("halves a common Answer per earlier Run, never below 1", () => {
    expect([0, 1, 2, 3, 4, 10].map((n) => openPoints("common", n))).toEqual([10, 5, 2, 1, 1, 1]);
  });

  it.each([
    ["solid", 25, 12],
    ["deep", 60, 30],
    ["rare", 100, 50],
  ] as const)("%s: %i fresh, %i once stale", (tier, fresh, once) => {
    expect(openPoints(tier, 0)).toBe(fresh);
    expect(openPoints(tier, 1)).toBe(once);
  });
});

describe("singlePoints", () => {
  it.each([
    ["common", 10, 5],
    ["solid", 25, 10],
    ["deep", 60, 25],
    ["rare", 100, 60],
  ] as const)("%s: %i, or %i with the Hint", (tier, plain, hinted) => {
    expect(singlePoints(tier, false)).toBe(plain);
    expect(singlePoints(tier, true)).toBe(hinted);
  });
});
