// A tiny markdown parser for Topic readings (db/seed/courses/*.json). Pure and client-safe.
// Supports exactly what the seeded readings use: headings, paragraphs, fenced code, "-"/"*"
// and "1." lists, blockquotes (a "**Common mistakes**" quote becomes a callout), and inline
// `code`, **bold** and [links](url). No raw HTML: the renderer builds React elements.
// Single "*" is never emphasis, because readings write Python operators like "*" and "**" in prose.

export type Inline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "bold"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: number; text: string; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "code"; lang: string; code: string }
  | { type: "list"; ordered: boolean; start: number; items: Inline[][] }
  | { type: "quote"; variant: "mistakes" | "note"; title: string | null; blocks: Block[] };

const FENCE = /^```\s*([\w+-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const UL = /^\s*[-*]\s+(.*)$/;
const OL = /^\s*(\d+)\.\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "paragraph", children: parseInline(para.join(" ").trim()) });
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence (or end of input)
      blocks.push({ type: "code", lang: fence[1].toLowerCase(), code: body.join("\n") });
      continue;
    }
    if (line.trim() === "") {
      flush();
      i++;
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flush();
      const text = h[2].trim();
      blocks.push({ type: "heading", level: h[1].length, text: plainText(parseInline(text)), children: parseInline(text) });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      flush();
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(QUOTE.exec(lines[i++])![1]);
      blocks.push(quoteBlock(body));
      continue;
    }
    const ul = UL.exec(line);
    const ol = OL.exec(line);
    if (ul || ol) {
      flush();
      const ordered = !ul;
      const re = ordered ? OL : UL;
      const items: string[] = [];
      const start = ordered ? Number(ol![1]) : 1;
      while (i < lines.length) {
        const m = re.exec(lines[i]);
        if (m) {
          items.push(ordered ? m[2] : m[1]);
          i++;
        } else if (items.length && /^\s{2,}\S/.test(lines[i])) {
          items[items.length - 1] += " " + lines[i].trim(); // continuation line
          i++;
        } else break;
      }
      blocks.push({ type: "list", ordered, start, items: items.map((t) => parseInline(t.trim())) });
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flush();
  return blocks;
}

function quoteBlock(lines: string[]): Block {
  const inner = parseMarkdown(lines.join("\n"));
  let title: string | null = null;
  // A first paragraph that is only bold text is the callout's title ("**Common mistakes**").
  const first = inner[0];
  if (first?.type === "paragraph" && first.children.length === 1 && first.children[0].type === "bold") {
    title = plainText(first.children[0].children);
    inner.shift();
  }
  const variant = title && /common mistakes?/i.test(title) ? "mistakes" : "note";
  return { type: "quote", variant, title, blocks: inner };
}

// Bold must hug its text ("**word ... word**"), so prose like "2 ** 3" or "(**)" stays literal.
const INLINE = /`([^`]+)`|\*\*([A-Za-z0-9`"'(][^*\n]*?[^\s*])\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ type: "text", text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ type: "code", text: m[1] });
    else if (m[2] !== undefined) out.push({ type: "bold", children: parseInline(m[2]) });
    else out.push({ type: "link", href: m[4], children: parseInline(m[3]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

export function plainText(nodes: Inline[]): string {
  return nodes.map((n) => (n.type === "text" || n.type === "code" ? n.text : plainText(n.children))).join("");
}

/** The page's first heading, used for the reading's page index. */
export function pageTitle(blocks: Block[], fallback: string): string {
  const h = blocks.find((b) => b.type === "heading");
  return h && h.type === "heading" ? h.text : fallback;
}

/** "your-first-program" */
export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
