#!/usr/bin/env node
// Sonar (F32, #73): tags every Python Basics Prompt with the Concepts it tests, and each Concept
// with the reading pages that teach it, into db/seed/courses/python-basics.sonar.json (tags,
// concepts[].pages). One Gemini call per Topic. Spec: docs/architecture/sonar.md § Concepts.
// Needs Node 22.18+, GEMINI_API_KEY and GEMINI_MODEL (GEMINI_FALLBACK_MODEL when overloaded).
//
// Usage: npm run sonar:tag
//
// Prompt texts come from checkCourse(), the same checks the seed runs, so tags are keyed by
// exactly what prompts.text holds (e.g. a Pairs definition_to_term Prompt's text is the definition).
// Apogee copies Dive (prompts_from), so it is skipped and shares Dive's tags.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkCourse, type CourseFile } from "../lib/courses/seed.ts";
import { generateDocumentPrompts } from "../lib/gemini.ts";

const root = path.resolve(import.meta.dirname, "..");
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(root, file));
  } catch {}
}

const coursePath = path.join(root, "db", "seed", "courses", "python-basics.json");
const sidecarPath = path.join(root, "db", "seed", "courses", "python-basics.sonar.json");

type SidecarConcept = { id: string; name: string; topic: string; summary: string; pages: number[] };
type Sidecar = { course: string; concepts: SidecarConcept[]; edges: [string, string][]; tags: Record<string, string[]> };

// Same as lib/sonar/tags.ts tagKey (that file is server-only, so not importable here).
const tagKey = (text: string) => createHash("sha1").update(text.trim()).digest("hex");

const file = JSON.parse(await readFile(coursePath, "utf8")) as CourseFile;
const sidecar = JSON.parse(await readFile(sidecarPath, "utf8")) as Sidecar;
const checked = checkCourse(file);
if (checked.errors.length) {
  console.error(checked.errors.join("\n"));
  process.exit(1);
}

const SYSTEM = `You tag quiz Prompts from a beginner Python course with the Concepts they test.
For each Prompt return 1 to 3 Concept ids, primary (the one the Prompt mainly tests) first. Add a second or third
only when answering correctly genuinely needs that Concept too (e.g. a while-loop question that hinges on <= vs <
also tests comparison_ops). Prefer this Topic's Concepts; use an earlier Topic's Concept when the Prompt really
tests it. Use only ids from the list. Also, for each of THIS Topic's Concepts, list the reading pages (1-based)
that teach it. Return JSON only.`;

const SCHEMA = {
  type: "object",
  properties: {
    prompts: {
      type: "array",
      items: {
        type: "object",
        properties: { index: { type: "integer" }, concepts: { type: "array", items: { type: "string" } } },
        required: ["index", "concepts"],
      },
    },
    pages: {
      type: "array",
      items: {
        type: "object",
        properties: { concept: { type: "string" }, pages: { type: "array", items: { type: "integer" } } },
        required: ["concept", "pages"],
      },
    },
  },
  required: ["prompts", "pages"],
};

type Reply = { prompts: { index: number; concepts: string[] }[]; pages: { concept: string; pages: number[] }[] };

const tags: Record<string, string[]> = {};
const pagesById = new Map<string, number[]>();

await Promise.all(
  checked.topics.map(async ({ topic, games }, ti) => {
    const earlier = new Set(checked.topics.slice(0, ti + 1).map((t) => t.topic.slug));
    const allowed = sidecar.concepts.filter((c) => earlier.has(c.topic));
    const own = allowed.filter((c) => c.topic === topic.slug);
    const allowedIds = new Set(allowed.map((c) => c.id));
    // Unique texts across this Topic's Games (skip prompts_from copies)
    const texts = new Map<string, string>();
    for (const g of games) {
      if (topic.games.find((x) => x.mode === g.mode)?.prompts_from) continue;
      for (const p of g.prompts) {
        if (texts.has(p.text)) continue;
        const answer =
          p.kind === "true_false" ? `(${p.isTrue ? "true" : "false"})` : p.answers.map((a) => a.canonical).slice(0, 4).join(" | ");
        const extra = p.options?.length ? ` options: ${p.options.join(" / ")}` : p.items?.length ? ` items: ${p.items.join(" / ")}` : "";
        texts.set(p.text, `[${p.kind}] ${p.text}${extra} → ${answer}`);
      }
    }
    const list = [...texts.keys()];
    const contents = [
      `Topic: ${topic.title} (${topic.slug})`,
      `Concepts (id: name, summary, topic):`,
      ...allowed.map((c) => `- ${c.id}: ${c.name}, ${c.summary} (${c.topic})`),
      `This Topic's Concepts (give pages for these): ${own.map((c) => c.id).join(", ")}`,
      `Reading:`,
      ...topic.reading.pages.map((p) => `--- page ${p.page_number} ---\n${p.content_md}`),
      `Prompts:`,
      ...list.map((t, i) => `${i}. ${texts.get(t)}`),
    ].join("\n");
    const res = await generateDocumentPrompts(topic.title, [], {
      systemInstruction: SYSTEM,
      responseSchema: SCHEMA,
      temperature: 0,
      contents: () => contents,
    }, { timeoutMs: 180_000 });
    const reply = res.response as Reply;
    let tagged = 0;
    for (const r of reply.prompts ?? []) {
      const text = list[r.index];
      const ids = [...new Set((r.concepts ?? []).filter((id) => allowedIds.has(id)))].slice(0, 3);
      if (!text || ids.length === 0) continue;
      tags[tagKey(text)] = ids;
      tagged += 1;
    }
    const pageCount = topic.reading.pages.length;
    for (const r of reply.pages ?? []) {
      if (!own.some((c) => c.id === r.concept)) continue;
      pagesById.set(r.concept, [...new Set(r.pages.filter((n) => n >= 1 && n <= pageCount))].sort((a, b) => a - b));
    }
    console.log(`${topic.slug}: ${tagged}/${list.length} Prompts tagged (${res.model})`);
  }),
);

sidecar.tags = Object.fromEntries(Object.entries(tags).sort(([a], [b]) => a.localeCompare(b)));
for (const c of sidecar.concepts) c.pages = pagesById.get(c.id) ?? c.pages;

// Keep the hand-written layout: one Concept per line, then edges and tags.
const out = [
  "{",
  `  "course": ${JSON.stringify(sidecar.course)},`,
  `  "concepts": [`,
  sidecar.concepts.map((c) => `    ${JSON.stringify(c).replace(/":/g, '": ').replace(/,"/g, ', "')}`).join(",\n"),
  "  ],",
  `  "edges": [`,
  sidecar.edges.map((e) => `    ${JSON.stringify(e).replace(",", ", ")}`).join(",\n"),
  "  ],",
  `  "tags": {`,
  Object.entries(sidecar.tags).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v).replace(/,/g, ", ")}`).join(",\n"),
  "  }",
  "}",
  "",
].join("\n");
await writeFile(sidecarPath, out);
console.log(`Wrote ${Object.keys(sidecar.tags).length} tags to ${path.relative(root, sidecarPath)}`);
