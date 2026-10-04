import { describe, expect, it } from "vitest";
import { assignOpenTiers, TIERS, type Tier } from "./tiers";

function counts(tiers: Tier[]) {
  return Object.fromEntries(TIERS.map((t) => [t, tiers.filter((x) => x === t).length]));
}

describe("assignOpenTiers", () => {
  // Examples from game-generation-pipeline.md § Tier assignment
  it("N = 4 → one of each Tier", () => {
    expect(assignOpenTiers(4)).toEqual(["common", "solid", "deep", "rare"]);
  });

  it("N = 11 → rare 1, deep 3, solid 4, common 3", () => {
    expect(counts(assignOpenTiers(11))).toEqual({ common: 3, solid: 4, deep: 3, rare: 1 });
  });

  it.each(Array.from({ length: 12 }, (_, i) => i + 4))(
    "N = %i: ordered obvious → obscure, exactly one rare (last), at least one common",
    (n) => {
      const tiers = assignOpenTiers(n);
      expect(tiers).toHaveLength(n);
      expect(tiers.at(-1)).toBe("rare");
      expect(counts(tiers).rare).toBe(1);
      expect(counts(tiers).common).toBeGreaterThanOrEqual(1);
      const ranks = tiers.map((t) => TIERS.indexOf(t));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    },
  );

  it.each([3, 16, 4.5])("rejects N = %s", (n) => {
    expect(() => assignOpenTiers(n)).toThrow();
  });
});
