import { describe, expect, it } from "vitest";
import { diagnose } from "./diagnose";
import type { Edge } from "./graph";
import type { Miss } from "./model";
import type { ConceptState, ConceptStatus } from "./types";

const edges: Edge[] = [["comparison_ops", "while_loops"], ["comparison_ops", "range_fn"], ["range_fn", "for_loops"]];
const state = (id: string, status: ConceptStatus): ConceptState => ({
  id, name: id, topicSlug: "t", summary: "", pages: [], p: 0.4, pEff: 0.4, n: 5, right: 2, wrong: 3, lastSeen: null, status, blame: 0,
});
const miss = (on: string, blame: Record<string, number>): Miss => ({ at: new Date(), on, blame });

describe("diagnose", () => {
  const concepts = [state("comparison_ops", "learning"), state("while_loops", "weak"), state("range_fn", "weak"), state("for_loops", "learning")];

  it("finds a prerequisite that holds most of the blame for misses on its dependants", () => {
    const misses = [
      miss("while_loops", { while_loops: 0.3, comparison_ops: 0.7 }),
      miss("for_loops", { for_loops: 0.4, comparison_ops: 0.6 }),
      miss("while_loops", { while_loops: 1 }),
    ];
    const rc = diagnose(concepts, misses, edges);
    expect(rc?.conceptId).toBe("comparison_ops");
    expect(rc?.blameShare).toBeCloseTo(1.3 / 3, 9);
    expect(rc?.missedOn.sort()).toEqual(["for_loops", "while_loops"]);
    expect(rc?.misses).toBe(2);
  });

  it("needs ≥ 40 % of the blame", () => {
    const misses = [miss("while_loops", { while_loops: 0.7, comparison_ops: 0.3 }), miss("while_loops", { while_loops: 1 })];
    expect(diagnose(concepts, misses, edges)).toBeNull();
  });

  it("ignores mastered Concepts and Concepts that aren't prerequisites of a miss", () => {
    const mastered = concepts.map((c) => (c.id === "comparison_ops" ? { ...c, status: "mastered" as const } : c));
    const misses = [miss("while_loops", { while_loops: 0.2, comparison_ops: 0.8 })];
    expect(diagnose(mastered, misses, edges)).toBeNull();
    expect(diagnose(concepts, [miss("comparison_ops", { comparison_ops: 1 })], edges)).toBeNull();
  });

  it("only looks at the last 10 misses", () => {
    const old = Array.from({ length: 10 }, () => miss("while_loops", { while_loops: 0.1, comparison_ops: 0.9 }));
    const fresh = Array.from({ length: 10 }, () => miss("while_loops", { while_loops: 1 }));
    expect(diagnose(concepts, [...old, ...fresh], edges)).toBeNull();
  });
});
