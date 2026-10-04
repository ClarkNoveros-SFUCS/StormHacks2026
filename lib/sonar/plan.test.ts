import { describe, expect, it } from "vitest";
import type { ModeId } from "@/lib/modes";
import { lockedTopics } from "@/lib/courses/rules";
import type { Edge } from "./graph";
import { planActions, type PlanTopic } from "./plan";
import { statusOf } from "./model";
import type { ConceptState } from "./types";

const MODES: ModeId[] = ["dive", "apogee", "leap", "pairs", "blitz"];
const slugs = ["t1", "t2", "t3"];
const topics = (passed: boolean[]): PlanTopic[] => {
  const locked = lockedTopics(passed);
  return slugs.map((slug, i) => ({
    slug, number: i + 1, title: `Topic ${i + 1}`, coursePassed: passed[i], locked: locked[i],
    games: MODES.map((mode) => ({ gameId: `${slug}-${mode}`, mode, title: `${slug} · ${mode}` })),
  }));
};
const c = (id: string, topicSlug: string, pEff: number, n = 5, p = pEff): ConceptState => ({
  id, name: id.toUpperCase(), topicSlug, summary: "", pages: [2], p, pEff, n, right: 0, wrong: 0, lastSeen: null, status: statusOf(pEff, n), blame: 0,
});
const edges: Edge[] = [["a", "b"], ["b", "c"], ["a", "d"]];

describe("planActions", () => {
  it("sends a new Player to the first unpassed Topic", () => {
    const actions = planActions({
      concepts: [c("a", "t1", 0.3, 0)], edges, topics: topics([true, false, false]), rootCause: null, observations: 0, modesSeen: {},
    });
    expect(actions[0]).toMatchObject({ kind: "play", gameId: "t2-leap", rank: 0, source: "planner" });
    expect(actions.some((a) => a.kind === "read" && a.href === "/explore/python-basics/t2")).toBe(true);
    expect(actions.length).toBeLessThanOrEqual(3);
  });

  it("puts the Root cause first, in Leap with the reading when weak", () => {
    const concepts = [c("a", "t1", 0.4), c("b", "t2", 0.5), c("c", "t3", 0.3, 0), c("d", "t2", 0.6)];
    const actions = planActions({
      concepts, edges, topics: topics([true, true, false]), observations: 40, modesSeen: {},
      rootCause: { conceptId: "a", blameShare: 0.55, missedOn: ["b"], misses: 4 },
    });
    expect(actions[0]).toMatchObject({ kind: "play", gameId: "t1-leap", conceptId: "a", rank: 0 });
    expect(actions[0].why).toContain("55%");
    expect(actions[1]).toMatchObject({ kind: "read", href: "/explore/python-basics/t1" });
    expect(actions).toHaveLength(3);
  });

  it("picks the frontier: learning → Dive, never a locked Topic", () => {
    const concepts = [c("a", "t1", 0.9), c("b", "t2", 0.6), c("c", "t3", 0.3, 0), c("d", "t2", 0.75)];
    const actions = planActions({ concepts, edges, topics: topics([true, false, false]), rootCause: null, observations: 30, modesSeen: {} });
    expect(actions[0]).toMatchObject({ kind: "play", gameId: "t2-dive", conceptId: "b" });
    expect(actions.every((a) => a.kind !== "play" || a.topicSlug !== "t3")).toBe(true);
  });

  it("confirms a Concept mastered only in Blitz or Leap with Dive", () => {
    const concepts = [c("a", "t1", 0.6), c("b", "t1", 0.9)];
    const actions = planActions({
      concepts, edges: [], topics: topics([false, false, false]), observations: 10, modesSeen: { b: ["blitz"] },
      rootCause: null,
    });
    expect(actions[0]).toMatchObject({ gameId: "t1-dive", conceptId: "a" });
  });

  it("offers a quick review of a fading Concept", () => {
    const concepts = [c("a", "t1", 0.5, 6, 0.95)];
    const actions = planActions({ concepts, edges: [], topics: topics([true, false, false]), rootCause: null, observations: 6, modesSeen: { a: ["dive"] } });
    expect(actions.some((a) => a.kind === "play" && a.mode === "blitz" && a.why.includes("faded"))).toBe(true);
  });
});
