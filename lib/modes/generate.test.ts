import { describe, expect, it } from "vitest";
import fixture from "@/db/seed/graph-algorithms.json";
import modesFixture from "@/db/seed/graph-algorithms-modes.json";
import type { DocumentPage } from "@/lib/games/validate";
import { balanceTrueFalse, blitzGenerator, validateBlitz } from "./blitz/generate";
import type { GeneratedPrompt, Tagged } from "./generation";
import { generatorFor } from "./generators";
import { validateLeap } from "./leap/generate";
import { dedupeTerms, validatePairs } from "./pairs/generate";

const pages: DocumentPage[] = fixture.document.pages.map((p) => ({ pageNumber: p.page_number, contentMd: p.content_md }));
const seeded = (mode: string) => modesFixture.games.find((g) => g.mode === mode)!.prompts!;

const mcq = (extra: Record<string, unknown> = {}) => ({
  kind: "multiple_choice",
  text: "Which data structure does BFS use to decide which vertex to visit next?",
  options: ["A queue", "A stack", "A min-heap", "Union-find"],
  correct_option: "A queue",
  explanation: "BFS uses a queue.",
  tier: "common",
  evidence_page: 2,
  evidence_quote: "It uses a queue: take the vertex at the front, then add its unvisited neighbors to the back.",
  ...extra,
});
const tf = (text: string, isTrue: boolean, extra: Record<string, unknown> = {}) => ({
  kind: "true_false", text, is_true: isTrue, explanation: "x", tier: "solid", evidence_page: 7,
  evidence_quote: "Handles negative edge weights, but not negative cycles.", ...extra,
});
const reasons = (r: { dropped: { reason: string }[] }) => r.dropped.map((d) => d.reason);

describe("generatorFor", () => {
  it("Apogee uses Dive's generator; Arena uses Leap's checks; unknown Modes have none", () => {
    expect(generatorFor("apogee")).toBe(generatorFor("dive"));
    expect(generatorFor("nope")).toBeNull();
    expect(generatorFor("leap")!.minPrompts).toBe(10);
    expect(generatorFor("pairs")!.minPrompts).toBe(12);
    expect(blitzGenerator.minPrompts).toBe(30);
    const arena = generatorFor("arena")!;
    const leap = generatorFor("leap")!;
    expect(arena.validate).toBe(leap.validate);
    expect(arena.request).toBe(leap.request);
    expect(arena.minPrompts).toBe(10);
    expect(arena.notEnough(4)).toMatch(/an? Arena Game needs 10 questions and only 4 passed/);
  });

  it("every seeded Mode Game passes its own checks", () => {
    // Arena's seeded Game reuses the Leap questions ("prompts_from": "leap")
    for (const mode of ["leap", "pairs", "blitz", "arena"]) {
      const g = generatorFor(mode)!;
      const r = g.validate({ prompts: seeded(mode === "arena" ? "leap" : mode) }, pages);
      expect(r.dropped, mode).toEqual([]);
      expect(r.prompts.length).toBeGreaterThanOrEqual(g.minPrompts);
    }
  });
});

describe("Leap checks (multiple_choice)", () => {
  it("keeps a good question: 4 options, the correct one as its single Answer, quote verified", () => {
    const r = validateLeap({ prompts: [mcq()] }, pages);
    expect(r.dropped).toEqual([]);
    expect(r.prompts[0]).toMatchObject({
      kind: "multiple_choice", tier: "common", options: ["A queue", "A stack", "A min-heap", "Union-find"], evidencePage: 2, isTrue: null,
      answers: [{ canonical: "A queue", keys: [], evidencePage: 2, evidenceQuote: expect.stringContaining("It uses a queue") }],
    });
  });

  it("drops bad shapes, a missing correct option and all-of-the-above", () => {
    const r = validateLeap({ prompts: [
      mcq({ options: ["A queue", "A stack", "A min-heap"] }),
      mcq({ options: ["A queue", "a  queue", "A min-heap", "Union-find"] }),
      mcq({ correct_option: "A deque" }),
      mcq({ options: ["A queue", "A stack", "A min-heap", "All of the above"] }),
    ] }, pages);
    expect(r.prompts).toHaveLength(0);
    expect(reasons(r)).toEqual([
      "has 3 options (need 4)", "options aren't 4 distinct options", "correct_option isn't one of the options", 'uses "all/none of the above"',
    ]);
  });

  it("treats options that differ only in symbols as distinct (O(V + E) vs O(V * E))", () => {
    const r = validateLeap({ prompts: [mcq({ options: ["O(V + E)", "O(V * E)", "O(V^2)", "O(E log V)"], correct_option: "O(V + E)", evidence_page: 2, evidence_quote: "Running time: O(V + E)." })] }, pages);
    expect(r.dropped).toEqual([]);
  });

  it("matches correct_option up to case and spacing", () => {
    const r = validateLeap({ prompts: [mcq({ correct_option: "a  QUEUE" })] }, pages);
    expect(r.prompts[0].answers[0].canonical).toBe("A queue");
  });

  it("requires Evidence: an existing page and a verbatim quote", () => {
    const r = validateLeap({ prompts: [mcq({ evidence_page: 99 }), mcq({ evidence_quote: "BFS uses a deque." }), mcq({ evidence_quote: "" })] }, pages);
    expect(reasons(r)).toEqual(["cites missing page 99", "evidence quote isn't verbatim on page 2", "evidence quote isn't verbatim on page 2"]);
  });

  it("drops a stem that names the correct option and no other", () => {
    const r = validateLeap({ prompts: [mcq({ text: "BFS uses a queue. What does BFS use?" })] }, pages);
    expect(reasons(r)).toEqual(["the stem gives away the answer"]);
  });
});

describe("Pairs checks (definition_to_term)", () => {
  const pair = (text: string, canonical: string, page: number, aliases: string[] = []) => ({
    kind: "definition_to_term", text, tier: "solid", explanation: "x",
    answers: [{ canonical, aliases, exact_only: false, evidence_page: page, evidence_quote: "" }],
  });

  it("reuses Dive's Evidence check and adds card checks", () => {
    const r = validatePairs({ prompts: [
      pair("Traversal that explores level by level", "BFS", 2, ["breadth-first search"]),
      pair("Traversal that explores level by level", "Kruskal", 2), //            term not on its page (Dive's check 2)
      pair("BFS explores a graph level by level", "BFS", 2), //                    names its own term
      pair("x ".repeat(120), "DFS", 3), //                                         too long for a card
      { kind: "cloze", text: "BFS uses a ______", tier: "solid", hint: "", explanation: "", answers: [{ canonical: "queue", aliases: [], exact_only: false, evidence_page: 2, evidence_quote: "" }] },
    ] }, pages);
    expect(r.prompts.map((p) => p.answers[0].canonical)).toEqual(["BFS"]);
    expect(r.prompts[0].hint).toBeNull();
    expect(reasons(r)).toEqual([
      "page 2 doesn't mention it or an Alias", "its Answer was dropped",
      "the definition names its own term", "definition is over 200 characters", "Pairs only uses definition_to_term, not cloze",
    ]);
  });

  it("keeps one Prompt per term across the Game", () => {
    const r = validatePairs({ prompts: [pair("Explores level by level", "BFS", 2), pair("Uses a queue to traverse", "bfs", 2)] }, pages);
    const { kept, dropped } = dedupeTerms(r.prompts.map((prompt) => ({ doc: 1, prompt })));
    expect(kept).toHaveLength(1);
    expect(dropped[0].reason).toBe('term "bfs" repeats another pair');
  });
});

describe("Blitz checks (true_false)", () => {
  it("keeps statements with Evidence and stores the truth as is_true and the Answer", () => {
    const r = validateBlitz({ prompts: [tf("Floyd-Warshall handles negative edge weights.", true), tf("Floyd-Warshall handles negative cycles.", false)] }, pages);
    expect(r.dropped).toEqual([]);
    expect(r.prompts.map((p) => [p.isTrue, p.answers[0].canonical])).toEqual([[true, "True"], [false, "False"]]);
  });

  it("drops a missing quote, a long statement, and a 'false' one copied from the notes", () => {
    const r = validateBlitz({ prompts: [
      tf("Floyd-Warshall runs in O(V^3).", true, { evidence_quote: "made up" }),
      tf("x ".repeat(120), true),
      tf("Handles negative edge weights", false),
      { kind: "true_false", text: "No truth value" },
    ] }, pages);
    expect(r.prompts).toHaveLength(0);
    expect(reasons(r).slice(0, 3)).toEqual([
      "evidence quote isn't verbatim on page 7", "statement is over 200 characters", "a false statement that appears verbatim in the notes",
    ]);
    expect(reasons(r)[3]).toMatch(/^schema: is_true/);
  });

  it("balances true and false: the larger side keeps at most 1.5× the smaller", () => {
    const tagged = (isTrue: boolean, i: number): Tagged<number> => ({ doc: 0, prompt: { text: `s${i}`, isTrue } as GeneratedPrompt });
    const kept = [...Array.from({ length: 10 }, (_, i) => tagged(true, i)), ...Array.from({ length: 4 }, (_, i) => tagged(false, 10 + i))];
    const r = balanceTrueFalse(kept);
    expect(r.kept.filter((k) => k.prompt.isTrue)).toHaveLength(6);
    expect(r.kept.filter((k) => !k.prompt.isTrue)).toHaveLength(4);
    expect(r.dropped).toHaveLength(4);
    expect(r.dropped[0].reason).toBe("too many true statements (balance)");
    expect(balanceTrueFalse(kept.slice(0, 3)).kept).toHaveLength(0); // all true: nothing balances them
  });
});
