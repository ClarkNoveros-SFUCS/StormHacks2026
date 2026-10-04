import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractPages } from "./index.ts";
import { ALLOWED_TYPES } from "../parsed-pages.ts";
import { dropRepeatedLines, toLines, toMarkdown } from "./pdf.ts";
import { slideToMarkdown } from "./pptx.ts";
import { htmlToMarkdown, paginate } from "./docx.ts";

// Fixtures: lecture.pdf (2 pages, rendered by Chrome), deck.pptx (3 slides whose file
// order differs from deck order, a table, speaker notes), styled.docx (Word heading
// styles, a nested list, a table, a page break).
const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url)).then((b) => new Uint8Array(b));

test("PDF: headings by size, table columns kept, one string per page", async () => {
  const pages = await extractPages(await fixture("lecture.pdf"), ALLOWED_TYPES.pdf);
  assert.equal(pages.length, 2);
  assert.match(pages[0], /^# Week 9: Minimum Spanning Trees$/m);
  assert.match(pages[0], /^## Algorithms$/m);
  assert.match(pages[0], /Borůvka's algorithm merges components in rounds\./);
  assert.match(pages[0], /^Kruskal \| O\(E log E\)$/m);
  assert.match(pages[1], /^# Week 10: Shortest Paths$/m);
});

test("PPTX: deck order, title, nested bullets, table, notes; footers dropped", async () => {
  const pages = await extractPages(await fixture("deck.pptx"), ALLOWED_TYPES.pptx);
  assert.deepEqual(pages, [
    "# Graph Algorithms\n\nCMPT 307 · Week 9",
    "# Minimum Spanning Trees\n\n- Kruskal's algorithm sorts edges by weight\n  - Uses union–find\n- Prim's algorithm grows one tree\n- Borůvka merges components\n\nSpeaker notes:\nMention that Kruskal & Prim are both greedy.",
    "# Running times\n\n| Algorithm | Time |\n| --- | --- |\n| Kruskal | O(E log E) |\n| Prim | O(E log V) |",
  ]);
});

test("DOCX: heading styles, nested list, table, split at the page break", async () => {
  const pages = await extractPages(await fixture("styled.docx"), ALLOWED_TYPES.docx);
  assert.equal(pages.length, 2);
  assert.match(pages[0], /^# Week 9: Minimum Spanning Trees$/m);
  assert.match(pages[0], /^- Kruskal's algorithm sorts edges by weight\.\n {2}- Uses a union–find structure\.$/m);
  assert.match(pages[0], /^\| Kruskal \| O\(E log E\) \|$/m);
  assert.match(pages[1], /^# Week 10: Shortest Paths$/m);
  assert.match(pages[1], /negative weights & detects/);
});

test("a damaged file gives a readable error", async () => {
  const junk = new TextEncoder().encode("not really a pdf");
  await assert.rejects(extractPages(junk, ALLOWED_TYPES.pdf), /couldn't open this file/);
  await assert.rejects(extractPages(junk, ALLOWED_TYPES.pptx), /couldn't open this file/);
});

test("PDF lines: bullets become list items, big text becomes headings", () => {
  const item = (str: string, x: number, y: number, h: number) => ({ str, x, y, w: str.length * h * 0.5, h, eol: false });
  const md = toMarkdown(toLines([item("Title", 50, 700, 24), item("• first point", 50, 650, 12), item("• second", 50, 635, 12), item("plain text", 50, 600, 12)]));
  assert.equal(md, "# Title\n\n- first point\n- second\n\nplain text");
});

test("PPTX slide: sldNum/footer placeholders skipped, entities decoded", () => {
  const sp = (type: string, t: string) => `<p:sp><p:nvSpPr><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`;
  assert.equal(slideToMarkdown(sp("title", "A &amp; B") + sp("sldNum", "7") + sp("ftr", "CMPT 307")), "# A & B");
});

test("DOCX: long text without breaks is packed into ~3000-char sections at headings", () => {
  const section = (n: number) => `## Part ${n}\n\n${"word ".repeat(400).trim()}`;
  const pages = paginate(htmlToMarkdown("") + [1, 2, 3, 4].map(section).join("\n\n"));
  assert.ok(pages.length >= 2 && pages.every((p) => p.length <= 3000));
  assert.ok(pages.every((p) => p.startsWith("## Part")));
});

test("PDF lines: symbol-font bullets, negative numbers stay numbers", () => {
  const line = (text: string, y: number) => ({ text, y, h: 12 });
  assert.equal(toMarkdown([line("\uF0A7 Course info", 700), line("\uF0A7 Python basics", 685)]), "- Course info\n- Python basics");
  assert.equal(toMarkdown([line("-1, -2, -3", 700)]), "-1, -2, -3");
  assert.equal(toMarkdown([line("- dash bullet", 700)]), "- dash bullet");
});

test("PDF: running footers and page-number lines are dropped", () => {
  const line = (text: string) => ({ text, y: 0, h: 12 });
  const pages = [1, 2, 3, 4, 5, 6].map((n) => [line(`Topic ${"ABCDEF"[n - 1]}`), line(String(n)), line(`Page ${n} of 6`), line("6.100L Lecture 1")]);
  pages[2].push(line("YOU TRY IT!"));
  pages[4].push(line("YOU TRY IT!"));
  const out = dropRepeatedLines(pages).map((p) => p.map((l) => l.text));
  assert.deepEqual(out[0], ["Topic A"]);
  assert.deepEqual(out[2], ["Topic C", "YOU TRY IT!"]);
});
