// Parses one local file through Snowflake, exactly as the upload pipeline does, without
// Clerk, Tiger Data or the UI. Uploads to @STAGE/parse-check/<random>/ and removes it after.
//
//   npm run parse:check -- path/to/lecture.pdf
//
// Prints a per-page summary (page number, length, first line). Pass --full to print every page.

import { randomUUID } from "node:crypto";
import { copyFile, mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseStagedFile, putFile, removeStagedFile, withSnowflake } from "../lib/snowflake.ts";
import { stageFilename, toParsedPages, validateUpload } from "../lib/documents/parsed-pages.ts";

const args = process.argv.slice(2);
const full = args.includes("--full");
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: npm run parse:check -- <file.pdf|pptx|docx> [--full]");
  process.exit(1);
}

const { size } = await stat(file);
validateUpload(path.basename(file), "", size);

const name = stageFilename(path.basename(file));
const prefix = `parse-check/${randomUUID()}`;
const tmpDir = await mkdtemp(path.join(os.tmpdir(), "parse-check-"));
const tmpPath = path.join(tmpDir, name);
await copyFile(file, tmpPath);

const started = Date.now();
try {
  await withSnowflake(async (conn) => {
    try {
      console.log(`PUT ${name} (${(size / 1024).toFixed(0)} KB) → @${process.env.SNOWFLAKE_STAGE}/${prefix}/`);
      await putFile(conn, tmpPath, prefix);
      console.log("AI_PARSE_DOCUMENT (LAYOUT, page_split)…");
      const raw = await parseStagedFile(conn, `${prefix}/${name}`);
      console.log(`Raw result type: ${typeof raw}${typeof raw === "object" && raw ? `, keys: ${Object.keys(raw).join(", ")}` : ""}`);
      const pages = toParsedPages(raw);
      console.log(`\n${pages.length} pages in ${((Date.now() - started) / 1000).toFixed(1)} s\n`);
      for (const p of pages) {
        if (full) {
          console.log(`=== Page ${p.pageNumber} ===\n${p.contentMd}\n`);
        } else {
          const first = p.contentMd.split("\n").find((l) => l.trim()) ?? "(empty)";
          console.log(`p${String(p.pageNumber).padStart(3)}  ${String(p.contentMd.length).padStart(6)} chars  ${first.slice(0, 80)}`);
        }
      }
    } finally {
      await removeStagedFile(conn, prefix);
    }
  });
} finally {
  await rm(tmpDir, { recursive: true, force: true });
}
