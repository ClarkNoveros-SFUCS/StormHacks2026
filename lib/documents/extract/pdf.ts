import { getDocumentProxy } from "unpdf";

// PDF → one markdown string per page, from the PDF's text layer (pdf.js via unpdf).
// Rebuilds lines from text positions, marks larger text as headings and bullet
// glyphs as list items, and keeps wide gaps between runs as " | " so table rows
// stay readable. Scanned pages have no text layer and come back as "".

type Item = { str: string; x: number; y: number; w: number; h: number; eol: boolean };
type Line = { text: string; y: number; h: number };

const BULLET = /^[•▪◦‣●○■□–—\-*]\s*/;
const HEADING_RATIO = 1.25; // line height vs the page's typical body height
const COLUMN_GAP = 1; // gap wider than this many text heights = a new column

export class TooManyPagesError extends Error {}

export async function extractPdf(bytes: Uint8Array, maxPages = Infinity): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    if (pdf.numPages > maxPages) throw new TooManyPagesError(`${pdf.numPages} pages`);
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const items: Item[] = [];
      for (const it of content.items) {
        if (!("str" in it)) continue;
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.height || it.transform[3]), eol: it.hasEOL });
      }
      pages.push(toMarkdown(toLines(items)));
      page.cleanup();
    }
    return pages;
  } finally {
    await pdf.loadingTask.destroy(); // frees the worker and document memory
  }
}

/** Groups text runs into visual lines, top to bottom, left to right. */
export function toLines(items: Item[]): Line[] {
  const runs = items.filter((i) => i.str.trim() !== "");
  runs.sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: Item[][] = [];
  for (const it of runs) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - it.y) <= Math.max(2, 0.4 * Math.max(row[0].h, it.h))) row.push(it);
    else rows.push([it]);
  }

  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    const h = Math.max(...row.map((r) => r.h));
    let text = "";
    let end = -Infinity;
    for (const r of row) {
      const gap = r.x - end;
      if (text && gap > COLUMN_GAP * h) text += " | ";
      else if (text && gap > 0.15 * h && !text.endsWith(" ") && !r.str.startsWith(" ")) text += " ";
      text += r.str;
      end = r.x + r.w;
    }
    return { text: text.replace(/\s+/g, " ").trim(), y: row[0].y, h };
  });
}

export function toMarkdown(lines: Line[]): string {
  if (lines.length === 0) return "";
  const body = median(lines.map((l) => l.h));
  const out: string[] = [];
  let prev: Line | undefined;

  for (const line of lines) {
    const ratio = line.h / body;
    let text = line.text;
    if (ratio >= HEADING_RATIO && text.length <= 120) {
      text = `${ratio >= 1.8 ? "#" : "##"} ${text}`;
    } else if (BULLET.test(text)) {
      text = `- ${text.replace(BULLET, "")}`;
    }
    // A blank line between blocks: before headings and list items, and at wide vertical gaps.
    const gap = prev ? prev.y - line.y : 0;
    const last = out[out.length - 1] ?? "";
    const listStart = text.startsWith("- ") && !last.startsWith("- ");
    const newBlock = !prev || text.startsWith("#") || listStart || last.startsWith("#") || gap > 1.8 * Math.max(prev.h, line.h);
    if (prev && newBlock) out.push("");
    out.push(text);
    prev = line;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] || 1;
}
