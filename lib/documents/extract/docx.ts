import mammoth from "mammoth";

// DOCX → markdown "pages". Word files have no fixed pages, so we split at explicit
// page breaks when the author used them, otherwise into sections at headings,
// packing small sections together up to SECTION_CHARS. The Player sees these as
// page numbers, so keep them a readable size.

const SECTION_CHARS = 3000;
const PAGE_BREAK = "\u27e6PAGE\u27e7"; // "⟦PAGE⟧": control characters don't survive mammoth's HTML

export async function extractDocx(bytes: Uint8Array): Promise<string[]> {
  const { value: html } = await mammoth.convertToHtml(
    { buffer: Buffer.from(bytes) },
    { ignoreEmptyParagraphs: true, transformDocument: markPageBreaks },
  );
  return paginate(htmlToMarkdown(html));
}

/** Turns Word page breaks into a marker paragraph that survives conversion. */
function markPageBreaks(doc: { children?: unknown[] }) {
  const walk = (node: { type?: string; breakType?: string; children?: unknown[] }) => {
    if (node.type === "break" && node.breakType === "page") Object.assign(node, { type: "text", value: PAGE_BREAK });
    node.children?.forEach((c) => walk(c as typeof node));
  };
  walk(doc as never);
  return doc;
}

export function paginate(markdown: string): string[] {
  if (markdown.includes(PAGE_BREAK)) {
    return markdown.split(PAGE_BREAK).map((p) => p.trim()).filter(Boolean);
  }
  // Split before every heading, then pack sections up to SECTION_CHARS.
  const sections = markdown.split(/\n(?=#{1,3} )/).map((s) => s.trim()).filter(Boolean);
  const pages: string[] = [];
  let current = "";
  for (const section of sections) {
    for (const piece of splitLong(section)) {
      if (current && current.length + piece.length > SECTION_CHARS) {
        pages.push(current);
        current = "";
      }
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  if (current) pages.push(current);
  return pages;
}

/** Splits an oversized section at paragraph boundaries. */
function splitLong(section: string): string[] {
  if (section.length <= SECTION_CHARS) return [section];
  const out: string[] = [];
  let cur = "";
  for (const para of section.split(/\n\n/)) {
    if (cur && cur.length + para.length > SECTION_CHARS) {
      out.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n\n${para}` : para;
  }
  if (cur) out.push(cur);
  return out;
}

/** Minimal HTML → markdown for mammoth's output: headings, paragraphs, lists, tables. */
export function htmlToMarkdown(html: string): string {
  const blocks: string[] = [];
  const text = (s: string) =>
    decode(s.replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "")).replace(/[ \t]+/g, " ").trim();

  const lists = (s: string, depth: number): string[] => {
    const lines: string[] = [];
    for (const li of elements(s)) {
      const children = elements(li.inner).filter((c) => c.tag === "ul" || c.tag === "ol");
      let own = li.inner;
      for (const c of children) own = own.replace(c.outer, "");
      const t = text(own);
      if (t) lines.push(`${"  ".repeat(depth)}- ${t}`);
      for (const c of children) lines.push(...lists(c.inner, depth + 1));
    }
    return lines;
  };

  for (const { tag, inner } of elements(html)) {
    if (tag.startsWith("h")) {
      const t = text(inner);
      if (t) blocks.push(`${"#".repeat(Math.min(Number(tag[1]), 4))} ${t}`);
    } else if (tag === "p") {
      const t = text(inner);
      // Bullets typed as characters rather than a Word list
      if (t) blocks.push(t.replace(/^[•▪◦‣●○■–]\s*/, "- "));
    } else if (tag === "ul" || tag === "ol") {
      blocks.push(lists(inner, 0).join("\n"));
    } else {
      const rows = [...inner.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) =>
        [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => text(c[1]).replace(/\|/g, "\\|")),
      );
      if (rows.length) {
        const w = Math.max(...rows.map((r) => r.length));
        const line = (r: string[]) => `| ${Array.from({ length: w }, (_, i) => r[i] ?? "").join(" | ")} |`;
        blocks.push([line(rows[0]), `| ${Array(w).fill("---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n"));
      }
    }
  }
  // A page-break marker stands alone so paginate() can split on it.
  return blocks.join("\n\n").replace(new RegExp(`\\s*${PAGE_BREAK}\\s*`, "g"), PAGE_BREAK);
}

/** The top-level elements of an HTML fragment, matching nested tags of the same name. */
function elements(html: string): { tag: string; inner: string; outer: string }[] {
  const out: { tag: string; inner: string; outer: string }[] = [];
  const open = /<([a-z][a-z0-9]*)\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = open.exec(html))) {
    const tag = m[1].toLowerCase();
    if (/\/>$/.test(m[0]) || tag === "br" || tag === "img") continue;
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
    re.lastIndex = m.index + m[0].length;
    let depth = 1;
    let close: RegExpExecArray | null;
    while (depth > 0 && (close = re.exec(html))) depth += close[1] ? -1 : 1;
    const end = depth === 0 ? re.lastIndex : html.length;
    const closeLen = depth === 0 ? `</${tag}>`.length : 0;
    out.push({ tag, inner: html.slice(m.index + m[0].length, end - closeLen), outer: html.slice(m.index, end) });
    open.lastIndex = end;
  }
  return out;
}

function decode(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}
