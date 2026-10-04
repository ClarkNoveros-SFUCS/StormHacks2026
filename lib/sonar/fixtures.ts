// Sonar (F32): a fake SonarModel and chat reply with the demo story, so the UI can be built
// before the model and the agent exist. Not used in production code paths.

import graph from "@/db/seed/courses/python-basics.sonar.json";
import type { ChatResponse, ConceptState, ConceptStatus, SonarModel } from "./types";

// The demo story: Topics 1–2 strong, Topic 3 passed but comparisons weak, Loops misses trace back to it.
const P: Record<string, number> = {
  print_output: 0.93, comments: 0.95, indentation_syntax: 0.9, errors_basics: 0.86,
  variables_assignment: 0.92, data_types: 0.88, type_conversion: 0.84, strings_basics: 0.87,
  arithmetic_ops: 0.81, comparison_ops: 0.41, boolean_logic: 0.66, operator_precedence: 0.74,
  if_elif_else: 0.71, conditions_truthiness: 0.63,
  range_fn: 0.52, for_loops: 0.72, while_loops: 0.44,
};
const BLAME: Record<string, number> = { comparison_ops: 0.48, while_loops: 0.22, range_fn: 0.18, for_loops: 0.12 };

function status(p: number, n: number): ConceptStatus {
  if (n === 0) return "unseen";
  return p >= 0.85 ? "mastered" : p >= 0.5 ? "learning" : "weak";
}

const concepts: ConceptState[] = graph.concepts.map((c) => {
  const p = P[c.id] ?? 0.3;
  const n = c.id in P ? 6 : 0;
  return {
    id: c.id, name: c.name, topicSlug: c.topic, summary: c.summary, pages: c.pages,
    p, pEff: p, n, right: Math.round(n * p), wrong: n - Math.round(n * p),
    lastSeen: n ? "2026-10-04T15:00:00.000Z" : null, status: status(p, n), blame: BLAME[c.id] ?? 0,
  };
});

export const FIXTURE_MODEL: SonarModel = {
  courseSlug: "python-basics",
  concepts,
  edges: graph.edges as [string, string][],
  topics: [
    { slug: "hello-world-syntax", number: 1, title: "Hello World & Syntax", coursePassed: true, sonarMastery: 0.91 },
    { slug: "variables-types", number: 2, title: "Variables & Types", coursePassed: true, sonarMastery: 0.88 },
    { slug: "operators-expressions", number: 3, title: "Operators & Expressions", coursePassed: true, sonarMastery: 0.66 },
    { slug: "control-flow", number: 4, title: "Control Flow", coursePassed: true, sonarMastery: 0.67 },
    { slug: "loops", number: 5, title: "Loops", coursePassed: false, sonarMastery: 0.42 },
    { slug: "functions", number: 6, title: "Functions", coursePassed: false, sonarMastery: 0 },
  ],
  rootCause: { conceptId: "comparison_ops", blameShare: 0.48, missedOn: ["while_loops", "range_fn"], misses: 3 },
  actions: [
    {
      kind: "play", gameId: "00000000-0000-0000-0000-000000000003", mode: "blitz", title: "Operators & Expressions · Blitz",
      conceptId: "comparison_ops", topicSlug: "operators-expressions",
      why: "3 of your last 4 misses trace back to comparison boundaries (< vs <=).", source: "planner", rank: 0,
    },
    {
      kind: "play", gameId: "00000000-0000-0000-0000-000000000005", mode: "leap", title: "Loops · Leap",
      conceptId: "while_loops", topicSlug: "loops",
      why: "while loops are your weakest Concept once comparisons are fixed.", source: "planner", rank: 1,
    },
    {
      kind: "read", href: "/explore/python-basics/operators-expressions", title: "Re-read: Comparison operators",
      why: "Page 2 of the reading covers exactly the boundary cases you missed.", source: "planner",
    },
  ],
  observations: 96,
};

export const FIXTURE_CHAT: ChatResponse = {
  reply:
    "You're flying through syntax and variables. Loops look shaky, but I don't think loops are the real problem: " +
    "3 of your last 4 misses were boundary comparisons, like `n > 0` vs `n >= 0`. The Course marked Operators as passed, " +
    "but that's the gap. Do a quick Blitz on comparisons first, and loops will click.",
  actions: [FIXTURE_MODEL.actions[0]],
};
