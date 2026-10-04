import { describe, expect, it } from "vitest";
import fixture from "@/db/seed/graph-algorithms.json";
import { dedupeAcrossDocuments, validateDocument, type DocumentPage } from "./validate";

const pages: DocumentPage[] = fixture.document.pages.map((p) => ({ pageNumber: p.page_number, contentMd: p.content_md }));

const PAGES: DocumentPage[] = [
  { pageNumber: 1, contentMd: "# Traversal\n- BFS (breadth-first search) visits neighbours level by level.\n- DFS (depth-first search) goes deep first." },
  { pageNumber: 2, contentMd: "Dijkstra's algorithm finds shortest paths. Prim and Kruskal build a minimum spanning tree.\nBellman-Ford allows negative edges." },
];

const ans = (canonical: string, page: number, extra: Record<string, unknown> = {}) => ({
  canonical,
  aliases: [],
  exact_only: false,
  evidence_page: page,
  evidence_quote: "",
  ...extra,
});

const open = (answers: unknown[], text = "Name a graph algorithm") => ({ kind: "open", text, answers });
const run = (...prompts: unknown[]) => validateDocument({ prompts }, PAGES);

describe("validateDocument", () => {
  it("keeps every Prompt of the seed fixture (known-good input)", () => {
    const result = validateDocument({ prompts: fixture.game.prompts }, pages);
    expect(result.dropped).toEqual([]);
    expect(result.quotesCleared).toBe(0);
    expect(result.prompts).toHaveLength(fixture.game.prompts.length);
  });

  it("assigns Open Prompt Tiers and rarity ranks from the answer order", () => {
    const { prompts } = run(open([ans("BFS", 1), ans("DFS", 1), ans("Dijkstra", 2), ans("Prim", 2)]));
    expect(prompts[0].answers.map((a) => [a.canonical, a.tier, a.rarityRank])).toEqual([
      ["BFS", "common", 1],
      ["DFS", "solid", 2],
      ["Dijkstra", "deep", 3],
      ["Prim", "rare", 4],
    ]);
  });

  it("drops a Prompt that fails the schema, not the document", () => {
    const { prompts, dropped } = run({ kind: "riddle", text: "?" }, open([ans("BFS", 1), ans("DFS", 1), ans("Dijkstra", 2), ans("Prim", 2)]));
    expect(prompts).toHaveLength(1);
    expect(dropped[0].reason).toMatch(/^schema/);
  });

  it("returns nothing for a response without prompts", () => {
    expect(validateDocument({ nope: 1 }, PAGES).prompts).toEqual([]);
  });

  it("check 1: drops an Answer citing a missing page", () => {
    const { prompts, dropped } = run(open([ans("BFS", 1), ans("DFS", 1), ans("Dijkstra", 2), ans("Prim", 2), ans("Kruskal", 9)]));
    expect(prompts[0].answers.map((a) => a.canonical)).not.toContain("Kruskal");
    expect(dropped).toEqual([expect.objectContaining({ reason: "cites missing page 9" })]);
  });

  it("check 2: drops an Answer its page doesn't mention, but accepts a mention through an Alias", () => {
    const { prompts } = run(
      open([ans("BFS", 1), ans("DFS", 1), ans("Dijkstra", 2), ans("Prim", 2), ans("A*", 2), ans("Breadth first", 2, { aliases: ["Kruskal"] })]),
    );
    const names = prompts[0].answers.map((a) => a.canonical);
    expect(names).not.toContain("A*");
    expect(names).toContain("Breadth first");
  });

  it("rejects a name that normalizes to one character ('A*' → 'a') but keeps a real one-letter name ('C')", () => {
    const langs = [{ pageNumber: 1, contentMd: "Languages: C, A* search is not a language, Python, Java, Rust" }];
    const { prompts, dropped } = validateDocument(
      { prompts: [open([ans("C", 1), ans("Python", 1), ans("Java", 1), ans("Rust", 1), ans("A*", 1)], "Name a language")] },
      langs,
    );
    expect(prompts[0].answers.map((a) => a.keys)).toEqual([["c"], ["python"], ["java"], ["rust"]]);
    expect(dropped).toEqual([expect.objectContaining({ what: 'answer "A*"', reason: "its name is lost when normalized" })]);
  });

  it("check 2: whole words only ('prim' is not in 'primary')", () => {
    const pagesWithPrimary = [{ pageNumber: 1, contentMd: "The primary key" }];
    const { prompts } = validateDocument({ prompts: [{ kind: "cloze", text: "____ builds an MST", tier: "solid", answers: [ans("Prim", 1)] }] }, pagesWithPrimary);
    expect(prompts).toEqual([]);
  });

  it("check 3: a key shared by two Answers is removed from both; a clashing canonical drops its Answer", () => {
    const { prompts, dropped } = run(
      open([
        ans("BFS", 1, { aliases: ["search"] }),
        ans("DFS", 1, { aliases: ["search", "depth-first search"] }),
        ans("Dijkstra", 2),
        ans("Prim", 2),
        ans("Kruskal", 2, { aliases: ["Prim"] }),
      ]),
    );
    const byName = Object.fromEntries(prompts[0].answers.map((a) => [a.canonical, a.keys]));
    expect(byName.BFS).toEqual(["bfs"]);
    expect(byName.DFS).toEqual(["dfs", "depth first search"]);
    expect(byName).not.toHaveProperty("Prim");
    expect(byName.Kruskal).toEqual(["kruskal"]);
    expect(dropped.map((d) => d.what)).toEqual(['answer "Prim"']);
  });

  it("check 3: a repeated canonical keeps the first", () => {
    const { prompts } = run(open([ans("BFS", 1), ans("DFS", 1), ans("bfs", 1), ans("Dijkstra", 2), ans("Prim", 2)]));
    expect(prompts[0].answers.map((a) => a.canonical)).toEqual(["BFS", "DFS", "Dijkstra", "Prim"]);
  });

  it("check 4: drops an Open Prompt left with fewer than 4 Answers", () => {
    const { prompts, dropped } = run(open([ans("BFS", 1), ans("DFS", 1), ans("Dijkstra", 2), ans("A*", 2)]));
    expect(prompts).toEqual([]);
    expect(dropped.at(-1)?.reason).toMatch(/only 3 usable Answers/);
  });

  it("check 4: keeps the 15 most obvious of more than 15 Answers", () => {
    const names = Array.from({ length: 17 }, (_, i) => `Algo${i}`);
    const { prompts } = validateDocument({ prompts: [open(names.map((n) => ans(n, 1)))] }, [{ pageNumber: 1, contentMd: names.join(" ") }]);
    expect(prompts[0].answers).toHaveLength(15);
    expect(prompts[0].answers.at(-1)).toMatchObject({ canonical: "Algo14", tier: "rare" });
  });

  it("check 5: removes a Hint that names the Answer or an Alias, keeps an honest one", () => {
    const cloze = (hint: string) => ({ kind: "cloze", text: "____ finds shortest paths", tier: "solid", hint, explanation: "x", answers: [ans("Dijkstra", 2, { aliases: ["Dijkstra's algorithm"] })] });
    const { prompts } = run(cloze("Think Dijkstra's"), { ...cloze("A Dutch computer scientist"), text: "Another ____" });
    expect(prompts.map((p) => p.hint)).toEqual([null, "A Dutch computer scientist"]);
  });

  it("check 5: odd_one_out Hint can't name the correct option", () => {
    const { prompts } = run({
      kind: "odd_one_out",
      text: "Which is not a traversal?",
      tier: "deep",
      hint: "Bellman-Ford is the odd one",
      options: ["BFS", "DFS", "Bellman-Ford", "Dijkstra"],
      correct_option: "Bellman-Ford",
      evidence_page: 2,
    });
    expect(prompts[0].hint).toBeNull();
    expect(prompts[0].answers).toEqual([expect.objectContaining({ canonical: "Bellman-Ford", keys: [], tier: "deep" })]);
  });

  it("check 6: ordered_recall needs 3-6 distinct items; odd_one_out needs 4 distinct options including the correct one", () => {
    const ordered = (items: string[]) => ({ kind: "ordered_recall", text: `Order ${items.length}`, tier: "solid", items, evidence_page: 1 });
    const odd = (options: string[], correct: string, text: string) => ({ kind: "odd_one_out", text, tier: "solid", options, correct_option: correct, evidence_page: 2 });
    const { prompts, dropped } = run(
      ordered(["a", "b"]),
      ordered(["a", "b", "b"]),
      ordered(["a", "b", "c"]),
      odd(["Prim", "Kruskal", "Dijkstra"], "Dijkstra", "Three options"),
      odd(["Prim", "Kruskal", "Dijkstra", "prim"], "Dijkstra", "Duplicate options"),
      odd(["Prim", "Kruskal", "Dijkstra", "Bellman-Ford"], "dijkstra", "Wrong case"),
      odd(["Prim", "Kruskal", "Dijkstra", "Bellman-Ford"], "Dijkstra", "Good one"),
    );
    expect(prompts.map((p) => p.text)).toEqual(["Order 3", "Good one"]);
    expect(prompts[0].answers[0].canonical).toBe("correct order");
    expect(dropped).toHaveLength(5);
  });

  it("drops a single-answer Prompt without a tier or with more than one Answer", () => {
    const { prompts } = run(
      { kind: "cloze", text: "No tier ____", answers: [ans("Dijkstra", 2)] },
      { kind: "definition_to_term", text: "Two answers", tier: "solid", answers: [ans("Prim", 2), ans("Kruskal", 2)] },
    );
    expect(prompts).toEqual([]);
  });

  it("keeps an Answer whose quote isn't on its page, without the quote", () => {
    const { prompts, quotesCleared } = run({
      kind: "cloze",
      text: "____ allows negative edges",
      tier: "deep",
      answers: [ans("Bellman-Ford", 2, { evidence_quote: "Bellman-Ford  allows\nnegative edges." })],
    }, {
      kind: "cloze",
      text: "Paraphrased ____",
      tier: "deep",
      answers: [ans("Bellman-Ford", 2, { evidence_quote: "Bellman-Ford supports negative weights" })],
    });
    expect(prompts.map((p) => p.answers[0].evidenceQuote)).toEqual(["Bellman-Ford allows negative edges.", null]);
    expect(quotesCleared).toBe(1);
  });
});

describe("dedupeAcrossDocuments (check 7)", () => {
  it("keeps the first of two Prompts with the same normalized text", () => {
    const p = (text: string) => run(open([ans("BFS", 1), ans("DFS", 1), ans("Dijkstra", 2), ans("Prim", 2)], text)).prompts[0];
    const { kept, dropped } = dedupeAcrossDocuments([
      { doc: "a", prompts: [p("Name a graph algorithm")] },
      { doc: "b", prompts: [p("Name a graph algorithm!"), p("Name an MST algorithm")] },
    ]);
    expect(kept.map((k) => [k.doc, k.prompt.text])).toEqual([
      ["a", "Name a graph algorithm"],
      ["b", "Name an MST algorithm"],
    ]);
    expect(dropped).toHaveLength(1);
  });
});
