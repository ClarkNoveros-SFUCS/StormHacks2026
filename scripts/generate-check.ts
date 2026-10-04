// Generates one document's Prompts exactly as the Game pipeline does (extraction → Gemini →
// checks), without the app or the database. For tuning the prompt on real lecture files.
// Costs one Gemini call per run unless --from replays a saved response.
//
//   npm run generate:check -- path/to/lecture.pdf               summary + every kept Prompt
//   npm run generate:check -- path/to/lecture.pdf --pages 1-20  only those pages (cheaper)
//   npm run generate:check -- --seed                            the seed fixture's pages
//   ... --save out.json                                         keep Gemini's raw response
//   ... --from out.json                                         re-check a saved response (no call)

import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractPages } from "../lib/documents/extract/index.ts";
import { toParsedPages, validateUpload } from "../lib/documents/parsed-pages.ts";
import { generateDocumentPrompts } from "../lib/gemini.ts";
import { dedupeAcrossDocuments, KINDS, validateDocument, type DocumentPage, type ValidPrompt } from "../lib/games/validate.ts";

// USD per 1M tokens (thinking is billed as output). Estimates only; check ai.google.dev/pricing.
const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "gemini-3.7-flash": { input: 0.75, output: 3.75 },
  "gemini-3.6-flash": { input: 0.75, output: 3.75 },
};

const root = path.resolve(import.meta.dirname, "..");
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(root, file));
  } catch {}
}

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const valueFlags = new Set(["--pages", "--save", "--from"].map((f) => flag(f)));
const file = args.find((a) => !a.startsWith("--") && !valueFlags.has(a));
if (!file && !args.includes("--seed")) {
  console.error("Usage: npm run generate:check -- <file.pdf|pptx|docx> | --seed  [--pages 1-20] [--save out.json] [--from out.json]");
  process.exit(1);
}

// ---- pages ----
let title: string;
let pages: DocumentPage[];
if (file) {
  const { size } = await stat(file);
  const mimeType = validateUpload(path.basename(file), "", size);
  title = path.basename(file);
  pages = toParsedPages(await extractPages(new Uint8Array(await readFile(file)), mimeType)).map((p) => ({
    pageNumber: p.pageNumber,
    contentMd: p.contentMd,
  }));
} else {
  const fixture = JSON.parse(await readFile(path.join(root, "db/seed/graph-algorithms.json"), "utf8"));
  title = fixture.document.filename;
  pages = fixture.document.pages.map((p: { page_number: number; content_md: string }) => ({ pageNumber: p.page_number, contentMd: p.content_md }));
}
const range = flag("--pages")?.match(/^(\d+)-(\d+)$/);
if (range) pages = pages.filter((p) => p.pageNumber >= +range[1] && p.pageNumber <= +range[2]);
console.log(`${title}: ${pages.length} pages, ${pages.reduce((n, p) => n + p.contentMd.length, 0)} chars`);

// ---- Gemini (or a saved response) ----
let response: unknown;
const from = flag("--from");
if (from) {
  response = JSON.parse(await readFile(from, "utf8"));
  console.log(`Replaying ${from} (no Gemini call)\n`);
} else {
  const started = Date.now();
  const out = await generateDocumentPrompts(title, pages);
  response = out.response;
  const { inputTokens, outputTokens, thinkingTokens } = out.usage;
  const price = PRICES[out.model];
  const cost = price ? (inputTokens * price.input + (outputTokens + thinkingTokens) * price.output) / 1e6 : null;
  console.log(
    `${out.model}: ${((Date.now() - started) / 1000).toFixed(1)} s, tokens in ${inputTokens} / out ${outputTokens} / thinking ${thinkingTokens}` +
      (cost === null ? "" : `, ≈ $${cost.toFixed(4)} USD`) + "\n",
  );
  const save = flag("--save");
  if (save) {
    await writeFile(save, JSON.stringify(response, null, 2));
    console.log(`Saved the raw response to ${save}\n`);
  }
}

// ---- checks ----
const result = validateDocument(response, pages);
const { kept, dropped: duplicates } = dedupeAcrossDocuments([{ doc: title, prompts: result.prompts }]);
const prompts = kept.map((k) => k.prompt);
const returned = (response as { prompts?: unknown[] })?.prompts?.length ?? 0;

for (const p of prompts) printPrompt(p);

const dropped = [...result.dropped, ...duplicates];
console.log(`\n=== Dropped (${dropped.length}) ===`);
for (const d of dropped) console.log(`- "${d.prompt}" · ${d.what}: ${d.reason}`);

const byKind = KINDS.map((k) => `${k} ${prompts.filter((p) => p.kind === k).length}`).join(", ");
const answers = prompts.flatMap((p) => p.answers);
console.log(`\n=== Summary ===`);
console.log(`Prompts: ${returned} returned → ${prompts.length} kept (${byKind})`);
console.log(`Answers: ${answers.length}; quotes not found on their page: ${result.quotesCleared}; Hints removed: ${prompts.filter((p) => p.kind !== "open" && !p.hint).length}`);
console.log(prompts.length >= 7 ? "Enough for a Game (≥ 7)." : "NOT enough for a Game (< 7): it would fail.");

function printPrompt(p: ValidPrompt) {
  const tier = p.tier ? ` [${p.tier}]` : "";
  console.log(`\n▸ ${p.kind}${tier}: ${p.text}`);
  if (p.kind === "ordered_recall") p.items!.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
  if (p.kind === "odd_one_out") console.log(`    options: ${p.options!.join(" | ")}  → ${p.answers[0].canonical} (p.${p.evidencePage})`);
  if (p.kind === "open" || p.kind === "cloze" || p.kind === "definition_to_term") {
    for (const a of p.answers) {
      const keys = a.keys.length > 1 ? ` (${a.keys.slice(1).join(", ")})` : "";
      const exact = a.exactOnly ? " exact" : "";
      const quote = a.evidenceQuote ? `"${a.evidenceQuote.slice(0, 70)}${a.evidenceQuote.length > 70 ? "…" : ""}"` : "NO QUOTE";
      console.log(`    ${a.tier.padEnd(6)} ${a.canonical}${keys}${exact} · p.${a.evidencePage} ${quote}`);
    }
  }
  if (p.hint) console.log(`    hint: ${p.hint}`);
  if (p.explanation) console.log(`    why: ${p.explanation}`);
}
