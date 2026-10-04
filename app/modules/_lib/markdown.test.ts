import { describe, expect, it } from "vitest";
import { countMatches, inlineText, pageTitle, parseInline, parseMarkdown, safeHref, splitMatches } from "./markdown";

describe("parseMarkdown", () => {
  it("parses headings, bullets and paragraphs with line breaks", () => {
    const blocks = parseMarkdown("# Graphs\n\n- BFS uses a queue\n  - level by level\n- DFS uses a stack\n\nLine one\nLine two");
    expect(blocks.map((b) => b.t)).toEqual(["h", "list", "p"]);
    const list = blocks[1];
    if (list.t !== "list") throw new Error();
    expect(list.items.map((i) => [i.depth, inlineText(i.c)])).toEqual([
      [0, "BFS uses a queue"],
      [1, "level by level"],
      [0, "DFS uses a stack"],
    ]);
    const p = blocks[2];
    if (p.t !== "p") throw new Error();
    expect(p.lines).toHaveLength(2);
  });

  it("parses numbered lists and markdown tables", () => {
    const blocks = parseMarkdown("1. First\n2. Second\n\n| Algo | Time |\n|---|---|\n| BFS | O(V+E) |\n| Dijkstra | O(E log V) |");
    expect(blocks[0]).toMatchObject({ t: "list", items: [{ ordered: true, marker: "1." }, { ordered: true, marker: "2." }] });
    const table = blocks[1];
    if (table.t !== "table") throw new Error();
    expect(table.head.map(inlineText)).toEqual(["Algo", "Time"]);
    expect(table.rows.map((r) => r.map(inlineText))).toEqual([
      ["BFS", "O(V+E)"],
      ["Dijkstra", "O(E log V)"],
    ]);
  });

  it("keeps code fences verbatim and collects speaker notes", () => {
    const blocks = parseMarkdown("```python\nfor v in graph:\n    visit(v)\n```\nSpeaker notes: mention the queue\nand the visited set");
    expect(blocks[0]).toEqual({ t: "code", lang: "python", v: "for v in graph:\n    visit(v)" });
    const notes = blocks[1];
    if (notes.t !== "notes") throw new Error();
    expect(notes.lines.map(inlineText)).toEqual(["mention the queue", "and the visited set"]);
  });

  it("never produces raw HTML: tags stay text", () => {
    const blocks = parseMarkdown('<script>alert(1)</script>\n<img src=x onerror="alert(1)">');
    expect(blocks).toHaveLength(1);
    const p = blocks[0];
    if (p.t !== "p") throw new Error();
    expect(p.lines.map(inlineText)).toEqual(["<script>alert(1)</script>", '<img src=x onerror="alert(1)">']);
  });

  it("handles empty and odd input without looping", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("\n\n   \n")).toEqual([]);
    expect(parseMarkdown("---\n***").map((b) => b.t)).toEqual(["hr", "hr"]);
    expect(parseMarkdown("```\nunclosed").map((b) => b.t)).toEqual(["code"]);
  });
});

describe("parseInline", () => {
  it("parses bold, italic, code and safe links", () => {
    const c = parseInline("**BFS** is *fast*, see `queue` and [notes](https://example.com)");
    expect(c.map((n) => n.t)).toEqual(["strong", "text", "em", "text", "code", "text", "link"]);
  });

  it("leaves snake_case and unsafe links alone", () => {
    expect(parseInline("visited_set and max_depth")).toEqual([{ t: "text", v: "visited_set and max_depth" }]);
    expect(parseInline("[x](javascript:alert(1))").some((n) => n.t === "link")).toBe(false);
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("https://a.b")).toBe("https://a.b");
  });
});

describe("page titles and search", () => {
  it("uses the first heading, else the first line", () => {
    expect(pageTitle("intro text\n# Heading later")).toBe("Heading later");
    expect(pageTitle("Just a line\nand more")).toBe("Just a line");
    expect(pageTitle("")).toBe("Blank page");
    expect(pageTitle("# " + "x".repeat(100), 20)).toHaveLength(20);
  });

  it("counts and splits case-insensitive matches", () => {
    expect(countMatches("BFS bfs Bfs", "bfs")).toBe(3);
    expect(countMatches("anything", "  ")).toBe(0);
    expect(splitMatches("A queue, a Queue", "queue")).toEqual([
      { v: "A ", hit: false },
      { v: "queue", hit: true },
      { v: ", a ", hit: false },
      { v: "Queue", hit: true },
    ]);
  });
});
