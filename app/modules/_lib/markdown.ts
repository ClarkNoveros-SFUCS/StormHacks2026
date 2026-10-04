// A tiny, safe markdown parser for the file viewer. It parses the subset the upload pipeline
// writes (`#` headings, `- ` bullets, numbered lists, markdown tables, code fences, quotes,
// **bold**, *italic*, `code`, links) into a plain tree that MarkdownView renders as React
// elements. Nothing is ever injected as HTML, so text from a file can't run script or style.
// Pure and client-safe.

export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] };

export type ListItem = {
  depth: number;
  ordered: boolean;
  marker: string;
  c: Inline[];
};

export type Block =
  | { t: "h"; level: 1 | 2 | 3 | 4 | 5 | 6; c: Inline[] }
  | { t: "p"; lines: Inline[][] }
  | { t: "list"; items: ListItem[] }
  | { t: "table"; head: Inline[][]; rows: Inline[][][] }
  | { t: "code"; lang: string; v: string }
  | { t: "quote"; lines: Inline[][] }
  | { t: "notes"; lines: Inline[][] }
  | { t: "hr" };

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^(\s*)([-*+•])\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;
const FENCE = /^\s*(```|~~~)\s*([\w+-]*)\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const NOTES = /^\s*speaker notes:\s*(.*)$/i;

/** Parses a page of markdown into blocks. Never throws. */
export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++; // closing fence (or end of input)
      blocks.push({ t: "code", lang: fence[2] ?? "", v: body.join("\n") });
      continue;
    }

    const h = line.match(HEADING);
    if (h) {
      blocks.push({
        t: "h",
        level: h[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        c: parseInline(h[2]),
      });
      i++;
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }

    if (line.includes("|") && TABLE_SEP.test(lines[i + 1] ?? "")) {
      const head = splitRow(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        rows.push(splitRow(lines[i]).map(parseInline));
        i++;
      }
      blocks.push({ t: "table", head, rows });
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const items: ListItem[] = [];
      while (i < lines.length) {
        const b = lines[i].match(BULLET);
        const o = b ? null : lines[i].match(ORDERED);
        const m = b ?? o;
        if (!m) {
          // A wrapped continuation line belongs to the previous item.
          const cont = lines[i];
          if (cont.trim() && /^\s{2,}/.test(cont) && items.length) {
            items[items.length - 1].c.push({ t: "text", v: " " }, ...parseInline(cont.trim()));
            i++;
            continue;
          }
          break;
        }
        items.push({
          depth: Math.min(4, Math.floor(m[1].replace(/\t/g, "  ").length / 2)),
          ordered: !!o,
          marker: o ? `${m[2]}.` : "•",
          c: parseInline(m[3]),
        });
        i++;
      }
      blocks.push({ t: "list", items });
      continue;
    }

    if (line.trimStart().startsWith(">")) {
      const q: Inline[][] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        q.push(parseInline(lines[i].trimStart().replace(/^>\s?/, "")));
        i++;
      }
      blocks.push({ t: "quote", lines: q });
      continue;
    }

    const notes = line.match(NOTES);
    if (notes) {
      // PPTX speaker notes come last on a slide: everything after the label belongs to them.
      const n: Inline[][] = [];
      if (notes[1].trim()) n.push(parseInline(notes[1].trim()));
      i++;
      while (i < lines.length) {
        if (lines[i].trim()) n.push(parseInline(lines[i].trim()));
        i++;
      }
      blocks.push({ t: "notes", lines: n });
      continue;
    }

    // Paragraph: consecutive plain lines, line breaks kept (slides and PDFs are line-oriented).
    const para: Inline[][] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (
        !l.trim() ||
        FENCE.test(l) ||
        HEADING.test(l) ||
        BULLET.test(l) ||
        ORDERED.test(l) ||
        l.trimStart().startsWith(">") ||
        NOTES.test(l) ||
        (l.includes("|") && TABLE_SEP.test(lines[i + 1] ?? ""))
      )
        break;
      para.push(parseInline(l.trim()));
      i++;
    }
    if (para.length) blocks.push({ t: "p", lines: para });
    else i++; // safety: never loop forever
  }
  return blocks;
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

// `code` | **strong** | __strong__ | *em* | _em_ (not inside words, so snake_case survives) | [text](url)
const INLINE =
  /(`+)([^`]+?)\1|\*\*(.+?)\*\*|__(.+?)__|(?<![\w*])\*(?!\s)([^*]+?)\*(?![\w*])|(?<![\w_])_(?!\s)([^_]+?)_(?![\w_])|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Inline markdown → a flat-ish tree. Links keep only http(s) and mailto targets. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  // matchAll clones the regex, so the recursive calls below don't share its lastIndex.
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
    if (m[2] !== undefined) out.push({ t: "code", v: m[2] });
    else if (m[3] !== undefined || m[4] !== undefined) out.push({ t: "strong", c: parseInline(m[3] ?? m[4]) });
    else if (m[5] !== undefined || m[6] !== undefined) out.push({ t: "em", c: parseInline(m[5] ?? m[6]) });
    else if (m[7] !== undefined) {
      const href = safeHref(m[8]);
      out.push(href ? { t: "link", href, c: parseInline(m[7]) } : { t: "text", v: m[7] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

export function safeHref(href: string): string | null {
  return /^(https?:\/\/|mailto:)/i.test(href.trim()) ? href.trim() : null;
}

/** Plain text of an inline tree (for page titles and search). */
export function inlineText(c: Inline[]): string {
  return c.map((n) => (n.t === "text" || n.t === "code" ? n.v : inlineText(n.c))).join("");
}

/** A page's title for the page list: its first heading, else its first line, shortened. */
export function pageTitle(md: string, max = 60): string {
  const blocks = parseMarkdown(md);
  const h = blocks.find((b) => b.t === "h");
  let text = "";
  if (h && h.t === "h") text = inlineText(h.c);
  else {
    const first = blocks[0];
    if (first?.t === "p") text = inlineText(first.lines[0] ?? []);
    else if (first?.t === "list") text = inlineText(first.items[0]?.c ?? []);
    else if (first?.t === "table") text = first.head.map(inlineText).join(" · ");
    else if (first?.t === "notes") text = "Speaker notes";
  }
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return "Blank page";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Case-insensitive occurrences of `query` in `text` (non-overlapping). */
export function countMatches(text: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const hay = text.toLowerCase();
  let n = 0;
  for (let at = hay.indexOf(q); at !== -1; at = hay.indexOf(q, at + q.length)) n++;
  return n;
}

/** Splits text around case-insensitive matches of `query`, for highlighting. */
export function splitMatches(text: string, query: string): { v: string; hit: boolean }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [{ v: text, hit: false }];
  const hay = text.toLowerCase();
  const parts: { v: string; hit: boolean }[] = [];
  let last = 0;
  for (let at = hay.indexOf(q); at !== -1; at = hay.indexOf(q, at + q.length)) {
    if (at > last) parts.push({ v: text.slice(last, at), hit: false });
    parts.push({ v: text.slice(at, at + q.length), hit: true });
    last = at + q.length;
  }
  if (last < text.length) parts.push({ v: text.slice(last), hit: false });
  return parts;
}
