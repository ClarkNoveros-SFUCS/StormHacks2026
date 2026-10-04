import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, plainText, slugify } from "./markdown";
import { tokenizePython } from "./python-highlight";
import { bestLabel, passLabel } from "./modes";

describe("parseMarkdown", () => {
  it("parses headings, paragraphs and fenced code", () => {
    const blocks = parseMarkdown("# Your first program\n\nPython reads\nlines.\n\n```python\nprint(\"hi\")\n```\n");
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "code"]);
    expect(blocks[1]).toEqual({ type: "paragraph", children: [{ type: "text", text: "Python reads lines." }] });
    expect(blocks[2]).toEqual({ type: "code", lang: "python", code: 'print("hi")' });
  });

  it("turns a **Common mistakes** quote into a mistakes callout with a list", () => {
    const [q] = parseMarkdown("> **Common mistakes**\n> - Writing `Print(\"hi\")`: a NameError.\n> - Forgetting the colon.");
    expect(q.type).toBe("quote");
    if (q.type !== "quote") return;
    expect(q.variant).toBe("mistakes");
    expect(q.title).toBe("Common mistakes");
    expect(q.blocks).toHaveLength(1);
    const list = q.blocks[0];
    expect(list.type === "list" && list.items.length).toBe(2);
  });

  it("parses ordered lists with their start number", () => {
    const [l] = parseMarkdown("1. Parentheses ()\n2. Exponentiation **\n3. not");
    expect(l).toMatchObject({ type: "list", ordered: true, start: 1 });
    if (l.type === "list") expect(plainText(l.items[1])).toBe("Exponentiation **");
  });

  it("keeps Python operators in prose literal (no stray bold)", () => {
    const text = "except ** which groups right to left: 2 ** 3 ** 2 is 2 ** 9. Exponentiation (**): 2 ** 3 is 8.";
    expect(parseInline(text)).toEqual([{ type: "text", text }]);
  });

  it("parses inline code, bold and links", () => {
    expect(parseInline("Use `print()` and **really** read [docs](https://docs.python.org/3/).")).toEqual([
      { type: "text", text: "Use " },
      { type: "code", text: "print()" },
      { type: "text", text: " and " },
      { type: "bold", children: [{ type: "text", text: "really" }] },
      { type: "text", text: " read " },
      { type: "link", href: "https://docs.python.org/3/", children: [{ type: "text", text: "docs" }] },
      { type: "text", text: "." },
    ]);
  });

  it("slugifies headings", () => {
    expect(slugify("Indentation & blocks!")).toBe("indentation-blocks");
  });
});

describe("tokenizePython", () => {
  const kinds = (code: string) => tokenizePython(code).filter((t) => t.text.trim()).map((t) => [t.kind, t.text.trim()]);

  it("round-trips the source exactly", () => {
    const code = 'def greet(name="x"):\n    """Doc."""\n    return f"hi {name}"  # done\nprint(2 ** 10, 3.5e2)';
    expect(tokenizePython(code).map((t) => t.text).join("")).toBe(code);
  });

  it("classifies keywords, builtins, functions, strings, numbers and comments", () => {
    expect(kinds('def area(r):\n    return 3.14 * r ** 2  # pi r squared\nprint(area(2), True)')).toEqual([
      ["keyword", "def"],
      ["function", "area"],
      ["punct", "("],
      ["plain", "r"],
      ["punct", "):"],
      ["keyword", "return"],
      ["number", "3.14"],
      ["operator", "*"],
      ["plain", "r"],
      ["operator", "**"],
      ["number", "2"],
      ["comment", "# pi r squared"],
      ["builtin", "print"],
      ["punct", "("],
      ["function", "area"],
      ["punct", "("],
      ["number", "2"],
      ["punct", "),"],
      ["constant", "True"],
      ["punct", ")"],
    ]);
  });

  it("keeps # inside strings out of comments", () => {
    expect(kinds("s = 'a # b'")).toEqual([
      ["plain", "s"],
      ["operator", "="],
      ["string", "'a # b'"],
    ]);
  });
});

describe("mode labels", () => {
  it("shows the pass bar per Mode", () => {
    expect(passLabel("dive")).toBe("Reach −1,500 m");
    expect(passLabel("leap")).toBe("7/10 without falling");
    expect(passLabel("pairs")).toBe("Clear both boards");
    expect(passLabel("blitz")).toBe("150 points");
  });
  it("formats bests in the Mode's unit", () => {
    expect(bestLabel("dive", 152)).toBe("−1,520 m");
    expect(bestLabel("apogee", 88)).toBe("88 km");
    expect(bestLabel("blitz", 40)).toBe("40 pts");
    expect(bestLabel("pairs", null)).toBe("—");
  });
});
