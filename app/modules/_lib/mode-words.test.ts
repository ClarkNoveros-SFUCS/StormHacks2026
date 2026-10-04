import { describe, expect, it } from "vitest";
import { bestInWords, sortModes, thinMaterialHint } from "./mode-words";

describe("bestInWords", () => {
  it("speaks each Mode's metaphor", () => {
    expect(bestInWords("dive", 120).value).toBe("−1,200 m");
    expect(bestInWords("dive", 0).value).toBe("0 m");
    expect(bestInWords("apogee", 340).value).toBe("340 km");
    expect(bestInWords("leap", 1450)).toEqual({
      label: "Best climb",
      value: "1,450 pts",
    });
    expect(bestInWords("pairs", 600).label).toBe("Best table");
    expect(bestInWords("blitz", 230).label).toBe("Best blitz");
  });
});

describe("thinMaterialHint", () => {
  it("hints when a Mode may not find enough material, never otherwise", () => {
    expect(thinMaterialHint("pairs", 3, 1)).toMatch(/12 term–definition pairs/);
    expect(thinMaterialHint("blitz", 4, 1)).toMatch(/30 true\/false/);
    expect(thinMaterialHint("pairs", 20, 2)).toBeNull();
    expect(thinMaterialHint("dive", 12, 1)).toBeNull();
    expect(thinMaterialHint("blitz", 0, 0)).toBeNull();
  });
});

it("sorts Modes in MODES order", () => {
  expect(sortModes(["blitz", "dive", "pairs", "apogee"])).toEqual(["dive", "apogee", "pairs", "blitz"]);
});
