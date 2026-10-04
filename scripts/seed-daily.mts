#!/usr/bin/env node
// Seeds the hand-written Daily Dive pool from db/seed/daily/pool.json: each puzzle's fact
// sheet (a system Source Document) and its 7-Prompt Dive Game, through the same checks and
// writer as Gemini generation (lib/daily/puzzle.ts). Puzzles with a day are scheduled; the
// rest wait in the pool. Spec: docs/architecture/daily-dive.md § Seed.
// Needs Node 22.18+ (runs this .mts file directly with built-in type stripping).
//
// Usage: npm run db:seed:daily                 db/seed/daily/pool.json
//        npm run db:seed:daily -- <file.json>  another pool file
//        npm run db:seed:daily -- --check      validate only, no database
//
// Idempotent: ids come from the content, so a re-run writes nothing new. A changed puzzle
// that isn't live yet points at a new Game; a live puzzle is never changed.

import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { buildPuzzleRows, checkPuzzle, writePuzzle, type PuzzleFile } from "../lib/daily/puzzle.ts";

const root = path.resolve(import.meta.dirname, "..");
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(root, file)); // never overrides variables already set
  } catch {}
}

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const file = path.resolve(args.find((a) => !a.startsWith("--")) ?? path.join(root, "db", "seed", "daily", "pool.json"));
const pool = JSON.parse(await readFile(file, "utf8")) as { puzzles: (PuzzleFile & { number: number })[] };

const checked = pool.puzzles.map((p) => checkPuzzle(p, { strict: true }));
const errors = checked.flatMap((c) => c.errors);
if (errors.length) {
  console.error(`${path.relative(root, file)} is invalid:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
for (const c of checked) {
  const open = c.prompts.filter((p) => p.kind === "open").map((p) => p.answers.length);
  console.log(`  #${c.file.number} ${c.file.day ?? "pool"} · ${c.file.theme} · ${c.file.title} (Open Answers ${open.join("/")})`);
}
if (checkOnly) {
  console.log(`${checked.length} puzzles OK.`);
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Put it in .env.local (see .env.example).");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  const results = await sql.begin(async (tx) => {
    const out = [];
    for (const c of checked) {
      out.push(await writePuzzle(tx, buildPuzzleRows(c, c.file.number!), { day: c.file.day ?? null, source: "seed" }));
    }
    return out;
  });
  const count = (o: string) => results.filter((r) => r.outcome === o).length;
  for (const r of results) if (r.note || r.outcome === "kept-live") console.log(`  #${r.number}: ${r.note ?? "live already, content left as it is"}`);
  console.log(
    `Seeded the Daily pool: ${count("created")} created, ${count("updated")} updated, ` +
      `${count("unchanged")} unchanged, ${count("kept-live")} live (left alone).`,
  );
} catch (err) {
  console.error("\nSeed failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
