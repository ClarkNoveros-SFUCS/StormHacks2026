#!/usr/bin/env node
// Seeds the public Courses (first: Python Basics) from db/seed/courses/*.json: the system
// Player's Module per Course, each Topic's reading as a parsed Source Document, and one
// public, ready Game per (Topic, Mode). Spec: docs/architecture/courses.md § Seed.
// Needs Node 22.18+ (runs this .mts file directly with built-in type stripping).
//
// Usage: npm run db:seed:courses                    every file in db/seed/courses/
//        npm run db:seed:courses -- <file.json> …   only these
//        npm run db:seed:courses -- --check         validate only, no database
//
// Idempotent: ids come from the content, so a re-run with unchanged files writes nothing new,
// and changed content adds new Games without deleting anyone's Runs (lib/courses/seed.ts).

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { buildCourseRows, checkCourse, seedCourse, type CourseFile } from "../lib/courses/seed.ts";
import { MODES } from "../lib/modes/index.ts";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "db", "seed", "courses");

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(root, file)); // never overrides variables already set
  } catch {}
}

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const named = args.filter((a) => !a.startsWith("--"));
const files = named.length
  ? named.map((f) => path.resolve(f))
  : (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(dir, f));
if (files.length === 0) {
  console.error(`No course files in ${path.relative(root, dir)}`);
  process.exit(1);
}

const checked = [];
let failed = false;
for (const file of files) {
  const c = checkCourse(JSON.parse(await readFile(file, "utf8")) as CourseFile);
  if (c.errors.length) {
    failed = true;
    console.error(`${path.relative(root, file)} is invalid:\n- ${c.errors.join("\n- ")}`);
  }
  checked.push(c);
}
if (failed) process.exit(1);

for (const c of checked) {
  console.log(`${c.file.course.title} (${c.file.course.slug}): ${c.topics.length} Topics`);
  for (const t of c.topics) {
    const games = t.games.map((g) => `${MODES[g.mode].name} ${g.prompts.length}`).join(", ");
    console.log(`  ${t.topic.order}. ${t.topic.title}: ${t.topic.reading.pages.length} pages; ${games}`);
  }
}
if (checkOnly) {
  console.log("Course files OK.");
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Put it in .env.local (see .env.example).");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  for (const c of checked) {
    const stats = await sql.begin((tx) => seedCourse(tx, buildCourseRows(c)));
    console.log(
      `Seeded ${c.file.course.slug} (course ${stats.courseId}): ${stats.topics} Topics, ` +
        `${stats.documentsCreated} new readings, ${stats.gamesCreated} new Games, ${stats.gamesKept} unchanged, ` +
        `${stats.gamesRetired} retired, ${stats.topicsRemoved} Topics removed.`,
    );
  }
} catch (err) {
  console.error("\nSeed failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
