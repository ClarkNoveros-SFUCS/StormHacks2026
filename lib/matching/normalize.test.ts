import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";

describe("normalize", () => {
  // Worked examples table, docs/architecture/answer-matching.md §3
  it.each([
    ["Dijkstra's", "dijkstra"],
    ["bellman fod", "bellman fod"],
    ["breadth first search", "breadth first search"],
    ["dfs", "dfs"],
    ["shortest path algorithm", "shortest path algorithm"],
    ["A*", "a"],
  ])("spec example %j → %j", (raw, expected) => {
    expect(normalize(raw)).toBe(expected);
  });

  it.each([
    ["Borůvka", "boruvka"], //                   1. accents stripped
    ["Ｂｏｒůｖｋａ", "boruvka"], //             1. NFKD folds full-width letters
    ["KRUSKAL", "kruskal"], //                   2.
    ["Dijkstra’s", "dijkstra"], //               3. curly apostrophe
    ["“Prim”", "prim"], //                       3. curly double quotes
    ["AT&T", "at and t"], //                     3. ampersand
    ["Kruskal's MST", "kruskal mst"], //         4. possessive on one word
    ["Prim's and Kruskal's", "prim and kruskal"], // 4. on each word
    ["O'Neil", "oneil"], //                      5. other apostrophes dropped
    ["bellman-ford", "bellman ford"], //         6.
    ["A* search", "a search"], //                6.
    ["  depth   first\tsearch\n", "depth first search"], // 7.
    ["negatives", "negatives"], //               no stemming
  ])("%j → %j", (raw, expected) => {
    expect(normalize(raw)).toBe(expected);
  });

  it.each(["", "   ", "***", "'s"])("%j → empty", (raw) => {
    expect(normalize(raw)).toBe("");
  });

  it("is idempotent", () => {
    for (const raw of ["Dijkstra's", "Bellman-Ford", "Borůvka", "AT&T"]) {
      expect(normalize(normalize(raw))).toBe(normalize(raw));
    }
  });
});
