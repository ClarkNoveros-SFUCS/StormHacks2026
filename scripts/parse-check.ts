// Parses one local file exactly as the upload pipeline does, without the app, the
// database or any network. Nothing leaves your machine.
//
//   npm run parse:check -- path/to/lecture.pdf          one line per page
//   npm run parse:check -- path/to/lecture.pdf --full   every page's markdown

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { extractPages } from "../lib/documents/extract/index.ts";
import { toParsedPages, validateUpload } from "../lib/documents/parsed-pages.ts";

const args = process.argv.slice(2);
const full = args.includes("--full");
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: npm run parse:check -- <file.pdf|pptx|docx> [--full]");
  process.exit(1);
}

const { size } = await stat(file);
const mimeType = validateUpload(path.basename(file), "", size);
const started = Date.now();
const pages = toParsedPages(await extractPages(new Uint8Array(await readFile(file)), mimeType));
console.log(`${pages.length} pages in ${((Date.now() - started) / 1000).toFixed(1)} s\n`);

for (const p of pages) {
  if (full) {
    console.log(`=== Page ${p.pageNumber} ===\n${p.contentMd}\n`);
  } else {
    const first = p.contentMd.split("\n").find((l) => l.trim()) ?? "(empty)";
    console.log(`p${String(p.pageNumber).padStart(3)}  ${String(p.contentMd.length).padStart(6)} chars  ${first.slice(0, 80)}`);
  }
}
