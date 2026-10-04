import { describe, expect, it } from "vitest";
import fixture from "@/db/seed/graph-algorithms.json";
import { normalize } from "@/lib/matching/normalize";
import { answerOverlap, quality, selectPrompts, SELECT_MAX, textSimilarity } from "./select";
import { validateDocument, type DocumentPage, type ValidAnswer, type ValidPrompt } from "./validate";

const pages: DocumentPage[] = fixture.document.pages.map((p) => ({ pageNumber: p.page_number, contentMd: p.content_md }));
/** The seed deck's 12 checked Prompts: 3 open, 3 cloze, 2 definition_to_term, 2 ordered_recall, 2 odd_one_out. */
const seed = validateDocument({ prompts: fixture.game.prompts }, pages).prompts;

const answer = (canonical: string, page = 1, quote: string | null = "a quote"): ValidAnswer => ({
  canonical, keys: [normalize(canonical)], exactOnly: false, evidencePage: page, evidenceQuote: quote, tier: "common", rarityRank: null,
});
const base = { tier: null, hint: null, explanation: null, items: null, options: null, evidencePage: null };
const open = (text: string, names: string[], page = 1): ValidPrompt => ({ ...base, kind: "open", text, answers: names.map((n) => answer(n, page)) });
const cloze = (text: string, term: string, page = 1, opts: { hint?: string | null; quote?: string | null } = {}): ValidPrompt => ({
  ...base, kind: "cloze", text, tier: "solid", hint: opts.hint === undefined ? "a clue" : opts.hint, answers: [answer(term, page, opts.quote === undefined ? "a quote" : opts.quote)],
});
const definition = (text: string, term: string, page = 1): ValidPrompt => ({ ...cloze(text, term, page), kind: "definition_to_term" });
/** n distinct Open Prompts, each on its own page with its own four Answers. */
const distinctOpens = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => open(`Name a ${["red", "blue", "green", "gold", "teal", "pink", "gray", "navy", "lime", "plum", "rust", "sand", "jade", "ruby", "onyx", "opal", "iris", "fern", "moss", "pearl", "amber", "coral", "ivory", "olive", "slate", "umber", "wine", "zinc"][i + from]} widget`, [0, 1, 2, 3].map((k) => `w${i + from}x${k}`), i + from + 1));

describe("textSimilarity", () => {
  it("ignores question words, case, punctuation and plurals", () => {
    expect(textSimilarity("Name a shortest-path algorithm", "Name an algorithm for shortest paths")).toBe(1);
    expect(textSimilarity("Put the steps of Dijkstra's algorithm in order.", "Put the steps of Kruskal's algorithm in order.")).toBe(0.5);
    expect(textSimilarity("Name a sorting algorithm", "Name a heap property")).toBe(0);
  });
});

describe("answerOverlap", () => {
  it("compares Open Answers as sets: a narrow Prompt inside a broad one overlaps a little", () => {
    expect(answerOverlap(open("A", ["x", "y", "z", "w"]), open("B", ["W", "z", "y", "x"]))).toBe(1);
    expect(answerOverlap(seed[0], seed[1])).toBeLessThan(0.5); // "Name a graph algorithm" vs MST algorithms
  });

  it("treats the same term in two single-answer Prompts as the same fact asked twice", () => {
    expect(answerOverlap(cloze("Kruskal uses ______.", "union-find"), definition("Tracks components.", "Union-Find"))).toBe(1);
    expect(answerOverlap(cloze("Kruskal uses ______.", "union-find"), open("Name a structure", ["union-find", "heap", "queue", "stack"]))).toBe(0);
  });

  it("compares ordered_recall steps and odd_one_out options", () => {
    expect(answerOverlap(seed[8], seed[8])).toBe(1);
    expect(answerOverlap(seed[10], { ...seed[10], options: [...seed[10].options!.slice(0, 3), "Other"] })).toBeCloseTo(3 / 5);
  });
});

describe("quality", () => {
  it("rewards Open Answers and penalizes missing quotes, removed Hints and weaker verification", () => {
    expect(quality(open("A", ["a", "b", "c", "d"]))).toBe(1);
    expect(quality(open("A", ["a", "b", "c", "d", "e", "f", "g", "h"]))).toBeCloseTo(1.4);
    expect(quality(cloze("A ______", "x"))).toBe(1);
    expect(quality(cloze("A ______", "x", 1, { hint: null, quote: null }))).toBeCloseTo(0.6);
    expect(quality(cloze("A ______", "x"), "trimmed")).toBeCloseTo(0.85);
    expect(quality(cloze("A ______", "x"), "unverified")).toBeCloseTo(0.95);
  });
});

describe("selectPrompts", () => {
  it("keeps the seed deck's 12 distinct Prompts, in order, when there are fewer than 15", () => {
    const out = selectPrompts(seed);
    expect(out.prompts).toEqual(seed);
    expect(out.dropped).toEqual([]);
  });

  it("keeps at most 20, in document order, and says why the rest were dropped", () => {
    const candidates = distinctOpens(25);
    const out = selectPrompts(candidates);
    expect(out.prompts).toHaveLength(SELECT_MAX);
    const idx = out.prompts.map((p) => candidates.indexOf(p));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(out.dropped).toHaveLength(5);
    expect(out.dropped[0].reason).toMatch(/^select: not among the best 20 \(score -?\d\.\d\d\)$/);
  });

  it("prefers Open Prompts with more Answers", () => {
    const few = open("Name a fruit", ["apple", "pear", "plum", "fig"], 1);
    const many = open("Name a vegetable", ["kale", "leek", "okra", "corn", "bean", "beet", "pea", "yam"], 2);
    expect(selectPrompts([few, many], { min: 1, max: 1 }).prompts).toEqual([many]);
  });

  it("balances kinds: a lone cloze beats a fifth Open Prompt", () => {
    const opens = distinctOpens(5);
    const lone = cloze("Kruskal uses ______ to detect cycles.", "union-find", 30);
    const out = selectPrompts([...opens, lone], { min: 4, max: 4 });
    expect(out.prompts).toContain(lone);
  });

  it("prefers pages no kept Prompt cites yet", () => {
    const first = cloze("Prim grows one ______.", "tree", 1);
    const samePage = cloze("Dijkstra keeps a ______ queue.", "priority", 1);
    const newPage = cloze("BFS uses a ______.", "queue", 2);
    expect(selectPrompts([first, samePage, newPage], { min: 2, max: 2 }).prompts).toEqual([first, newPage]);
  });

  it("never keeps a near-duplicate, even below the minimum", () => {
    const a = open("Name a shortest-path algorithm", ["Dijkstra", "BFS", "Bellman-Ford", "Floyd-Warshall"], 5);
    const reworded = open("Name an algorithm for shortest paths", ["SPFA", "A*", "Johnson", "Yen"], 6);
    const sameAnswers = open("Give an example of a path-finding method", ["Dijkstra", "BFS", "Bellman-Ford", "Floyd-Warshall"], 7);
    const sameTerm = definition("Tracks which vertices share a component.", "union-find", 9);
    const clozeTerm = cloze("Kruskal uses ______ to detect cycles.", "Union-Find", 9);
    const out = selectPrompts([a, reworded, sameAnswers, clozeTerm, sameTerm]);
    expect(out.prompts).toEqual([a, clozeTerm]);
    expect(out.dropped.map((d) => d.reason)).toEqual([
      'select: near-duplicate of "Name a shortest-path algorithm"',
      'select: near-duplicate of "Name a shortest-path algorithm"',
      'select: near-duplicate of "Kruskal uses ______ to detect cycles."',
    ]);
  });

  it("ranks Prompts the verification pass trimmed or couldn't judge below verified ones", () => {
    const x = cloze("BFS uses a ______.", "queue", 1);
    const y = cloze("DFS uses a ______.", "stack", 2);
    expect(selectPrompts([x, y], { min: 1, max: 1, verification: ["unverified", "verified"] }).prompts).toEqual([y]);
    expect(selectPrompts([x, y], { min: 1, max: 1, verification: ["verified", "trimmed"] }).prompts).toEqual([x]);
  });

  it("above the minimum, stops when only weak candidates are left", () => {
    const good = [cloze("BFS uses a ______.", "queue", 1), cloze("DFS uses a ______.", "stack", 2)];
    const weak = cloze("Heaps support ______ in log time.", "insert", 1, { hint: null, quote: null });
    expect(selectPrompts([...good, weak], { min: 2, max: 5 }).prompts).toEqual(good);
    expect(selectPrompts([...good, weak], { min: 3, max: 5 }).prompts).toEqual([...good, weak]);
  });
});
