import { describe, expect, it } from "vitest";
import { bktStep, effective, evidenceFor, replay, statusOf, type Observation } from "./model";
import type { Concept } from "./types";

describe("evidenceFor", () => {
  it("sets guess and slip by Mode, kind and hint", () => {
    expect(evidenceFor("dive", "open", false)).toEqual({ guess: 0.05, slip: 0.1 });
    expect(evidenceFor("apogee", "cloze", false)).toEqual({ guess: 0.05, slip: 0.1 });
    expect(evidenceFor("dive", "odd_one_out", false)).toEqual({ guess: 0.25, slip: 0.1 });
    expect(evidenceFor("dive", "open", true)).toEqual({ guess: 0.3, slip: 0.1 });
    expect(evidenceFor("dive", "ordered_recall", false)).toEqual({ guess: 0.05, slip: 0.15 });
    expect(evidenceFor("leap", "multiple_choice", false)).toEqual({ guess: 0.25, slip: 0.1 });
    expect(evidenceFor("leap", "multiple_choice", true)).toEqual({ guess: 0.5, slip: 0.1 });
    expect(evidenceFor("arena", "multiple_choice", false)).toEqual({ guess: 0.25, slip: 0.1 });
    expect(evidenceFor("blitz", "true_false", false)).toEqual({ guess: 0.5, slip: 0.15 });
    expect(evidenceFor("pairs", "definition_to_term", false)).toEqual({ guess: 0.2, slip: 0.1 });
  });
});

describe("bktStep (noisy-AND)", () => {
  it("matches the spec's worked example: a Leap miss on for_loops 0.80 + range 0.60", () => {
    const { next, blame } = bktStep([0.8, 0.6], false, { guess: 0.25, slip: 0.1 }, 0.1);
    expect(next[0]).toBeCloseTo(0.69, 2);
    expect(next[1]).toBeCloseTo(0.38, 2);
    expect(blame[1]).toBeCloseTo(2 / 3, 2);
    expect(blame[0] + blame[1]).toBeCloseTo(1, 9);
  });

  it("matches classic single-Concept BKT", () => {
    // P(L|right) = 0.3·0.9 / (0.3·0.9 + 0.7·0.05)
    const post = (0.3 * 0.9) / (0.3 * 0.9 + 0.7 * 0.05);
    expect(bktStep([0.3], true, { guess: 0.05, slip: 0.1 }).next[0]).toBeCloseTo(post + (1 - post) * 0.1, 9);
  });

  it("gives no blame on a right answer", () => {
    expect(bktStep([0.5, 0.5, 0.5], true, { guess: 0.25, slip: 0.1 }).blame).toEqual([0, 0, 0]);
  });
});

describe("forgetting and status", () => {
  it("halves every 72 hours", () => {
    const now = new Date("2026-10-04T12:00:00Z");
    expect(effective(0.8, new Date(now.getTime() - 72 * 3_600_000), now)).toBeCloseTo(0.4, 9);
    expect(effective(0.8, null, now)).toBe(0.8);
  });
  it("labels status", () => {
    expect(statusOf(0.9, 0)).toBe("unseen");
    expect(statusOf(0.9, 2)).toBe("learning");
    expect(statusOf(0.9, 3)).toBe("mastered");
    expect(statusOf(0.6, 5)).toBe("learning");
    expect(statusOf(0.4, 5)).toBe("weak");
  });
});

describe("replay", () => {
  const graph: Concept[] = [
    { id: "a", name: "A", topicSlug: "t", summary: "", pages: [] },
    { id: "b", name: "B", topicSlug: "t", summary: "", pages: [] },
  ];
  const now = new Date("2026-10-04T12:00:00Z");
  const obs = (concepts: string[], correct: boolean, fallback = false): Observation => ({
    at: now, concepts, fallback, correct, mode: "dive", kind: "open", hintUsed: false,
  });

  it("counts, raises p on right, lowers it on wrong, records blame", () => {
    const r = replay(graph, [obs(["a"], true), obs(["a"], true), obs(["a", "b"], false)], now);
    const [a, b] = r.concepts;
    expect(a.n).toBe(3);
    expect(a.right).toBe(2);
    expect(b.wrong).toBe(1);
    expect(r.misses).toHaveLength(1);
    expect(r.misses[0].on).toBe("a");
    expect(a.blame + b.blame).toBeCloseTo(1, 9);
    expect(b.blame).toBeGreaterThan(a.blame); // b was weaker
    expect(r.modesSeen.a).toEqual(["dive"]);
  });

  it("credits a fallback observation to the Topic's weakest Concept, at half weight", () => {
    const first = replay(graph, [obs(["a"], true)], now).concepts[0].p;
    const r = replay(graph, [obs(["a"], true), obs(["a", "b"], true, true)], now);
    expect(r.concepts[0].p).toBe(first); // a untouched
    expect(r.concepts[1].n).toBe(1);
    const full = replay(graph, [obs(["b"], true)], now).concepts[1].p;
    expect(r.concepts[1].p).toBeCloseTo(0.3 + 0.5 * (full - 0.3), 9);
  });
});
