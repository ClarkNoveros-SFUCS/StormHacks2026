import JSZip from "jszip";

// PPTX → one markdown string per slide, in presentation order.
// Slide title → "# …", body placeholders → bullets (indented by level), other text
// boxes → paragraphs, tables → markdown tables, speaker notes appended at the end.

export async function extractPptx(bytes: Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes);
  const read = (path: string) => zip.file(path)?.async("string");

  const slidePaths = await slideOrder(zip);
  const slides: string[] = [];
  for (const path of slidePaths) {
    const xml = (await read(path)) ?? "";
    let md = slideToMarkdown(xml);
    const notesPath = await relTarget(zip, path, "notesSlide");
    const notes = notesPath ? notesText((await read(notesPath)) ?? "") : "";
    if (notes) md += `${md ? "\n\n" : ""}Speaker notes:\n${notes}`;
    slides.push(md);
  }
  return slides;
}

/** Slide parts in the order the deck shows them (presentation.xml), not file-name order. */
async function slideOrder(zip: JSZip): Promise<string[]> {
  const pres = (await zip.file("ppt/presentation.xml")?.async("string")) ?? "";
  const rels = (await zip.file("ppt/_rels/presentation.xml.rels")?.async("string")) ?? "";
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) targets.set(id, resolvePath("ppt/", target));
  }
  const ordered = [...pres.matchAll(/<p:sldId\b[^>]*>/g)]
    .map((m) => targets.get(attr(m[0], "r:id") ?? ""))
    .filter((p): p is string => Boolean(p && zip.file(p)));
  if (ordered.length) return ordered;
  // Fallback: slide1.xml, slide2.xml, … by number
  return Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => num(a) - num(b));
}

async function relTarget(zip: JSZip, partPath: string, type: string) {
  const dir = partPath.slice(0, partPath.lastIndexOf("/") + 1);
  const relsPath = `${dir}_rels/${partPath.slice(dir.length)}.rels`;
  const rels = (await zip.file(relsPath)?.async("string")) ?? "";
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    if ((attr(m[0], "Type") ?? "").endsWith(`/${type}`)) return resolvePath(dir, attr(m[0], "Target") ?? "");
  }
}

export function slideToMarkdown(xml: string): string {
  const blocks: string[] = [];
  // Top-level shapes and graphic frames (tables), in document order
  for (const m of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>|<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g)) {
    const shape = m[0];
    if (shape.startsWith("<p:graphicFrame")) {
      const table = tableToMarkdown(shape);
      if (table) blocks.push(table);
      continue;
    }
    const ph = shape.match(/<p:ph\b[^>]*>/)?.[0];
    const phType = ph ? attr(ph, "type") ?? "body" : undefined;
    if (phType && ["sldNum", "dt", "ftr", "hdr"].includes(phType)) continue;

    const paras = paragraphs(shape);
    if (paras.length === 0) continue;
    if (phType === "title" || phType === "ctrTitle") {
      blocks.push(`# ${paras.map((p) => p.text).join(" ")}`);
    } else if (phType === "subTitle") {
      blocks.push(paras.map((p) => p.text).join("\n"));
    } else if (phType === "body" || phType === "obj" || paras.some((p) => p.bullet)) {
      blocks.push(paras.map((p) => `${"  ".repeat(p.level)}- ${p.text}`).join("\n"));
    } else {
      blocks.push(paras.map((p) => p.text).join("\n"));
    }
  }
  return blocks.join("\n\n").trim();
}

function paragraphs(xml: string) {
  const out: { text: string; level: number; bullet: boolean }[] = [];
  for (const m of xml.matchAll(/<a:p>[\s\S]*?<\/a:p>|<a:p\b[^>]*>[\s\S]*?<\/a:p>/g)) {
    const p = m[0];
    const text = [...p.matchAll(/<a:t>([\s\S]*?)<\/a:t>|<a:br\/>/g)]
      .map((t) => (t[0] === "<a:br/>" ? " " : decode(t[1])))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const pPr = p.match(/<a:pPr\b[^>]*>/)?.[0] ?? "";
    out.push({ text, level: Number(attr(pPr, "lvl") ?? 0), bullet: /<a:bu(Char|AutoNum)\b/.test(p) });
  }
  return out;
}

function tableToMarkdown(xml: string): string {
  const rows = [...xml.matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)].map((r) =>
    [...r[0].matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/g)].map((c) =>
      paragraphs(c[0]).map((p) => p.text).join(" ").replace(/\|/g, "\\|"),
    ),
  );
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
  return [line(rows[0]), `| ${Array(width).fill("---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n");
}

function notesText(xml: string): string {
  // The notes body placeholder; skip the slide image and slide number
  for (const m of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
    const ph = m[0].match(/<p:ph\b[^>]*>/)?.[0];
    if (ph && attr(ph, "type") === "body") return paragraphs(m[0]).map((p) => p.text).join("\n");
  }
  return "";
}

function attr(tag: string, name: string) {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}

function resolvePath(baseDir: string, target: string) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = (baseDir + target).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== "." && p !== "") out.push(p);
  }
  return out.join("/");
}

function num(path: string) {
  return Number(path.match(/(\d+)\.xml$/)?.[1] ?? 0);
}

function decode(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}
