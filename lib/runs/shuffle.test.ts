import { describe, expect, it } from "vitest";
import { seededShuffle, shuffleOutOfOrder } from "./shuffle";

const items = ["a", "b", "c", "d", "e"];

describe("seededShuffle", () => {
  it("is a permutation and stable for a seed", () => {
    const once = seededShuffle(items, "run:1");
    expect([...once].sort()).toEqual(items);
    expect(seededShuffle(items, "run:1")).toEqual(once);
  });

  it("varies with the seed", () => {
    const orders = new Set(Array.from({ length: 20 }, (_, i) => seededShuffle(items, `run:${i}`).join("")));
    expect(orders.size).toBeGreaterThan(5);
  });
});

describe("shuffleOutOfOrder", () => {
  it("never returns the correct order", () => {
    for (let i = 0; i < 500; i++) {
      expect(shuffleOutOfOrder(["x", "y"], `s${i}`)).toEqual(["y", "x"]);
      expect(shuffleOutOfOrder(items, `s${i}`)).not.toEqual(items);
    }
  });

  it("leaves a single item alone", () => {
    expect(shuffleOutOfOrder(["only"], "s")).toEqual(["only"]);
  });
});
