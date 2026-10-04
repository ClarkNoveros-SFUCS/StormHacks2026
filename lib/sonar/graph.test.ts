import { describe, expect, it } from "vitest";
import graph from "@/db/seed/courses/python-basics.sonar.json";
import { ancestors, descendants, prerequisites, topoOrder, type Edge } from "./graph";

const edges: Edge[] = graph.edges as [string, string][];

describe("Concept graph", () => {
  it("finds indirect prerequisites and dependants", () => {
    expect(ancestors("while_loops", edges)).toEqual(new Set(["indentation_syntax", "variables_assignment", "comparison_ops", "conditions_truthiness", "data_types", "boolean_logic"]));
    expect(descendants("comparison_ops", edges).has("break_continue")).toBe(true);
    expect(prerequisites("range_fn", edges).sort()).toEqual(["arithmetic_ops", "comparison_ops"]);
  });

  it("orders prerequisites first", () => {
    const order = topoOrder(graph.concepts.map((c) => c.id), edges);
    expect(order).toHaveLength(graph.concepts.length);
    for (const [a, b] of edges) expect(order.indexOf(a)).toBeLessThan(order.indexOf(b));
  });

  it("throws on a cycle", () => {
    expect(() => topoOrder(["a", "b"], [["a", "b"], ["b", "a"]])).toThrow();
  });
});
