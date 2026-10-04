// Generates one document's Prompts exactly as the Game pipeline does (extraction → Gemini →
// checks), without the app or the database. For tuning the prompt on real lecture files.
// Costs one Gemini call per run unless --from replays a saved response.
//
//   npm run generate:check -- path/to/lecture.pdf               summary + every kept Prompt
//   npm run generate:check -- path/to/lecture.pdf --pages 1-20  only those pages (cheaper)
//   npm run generate:check -- --seed                            the seed fixture's pages
//   ... --save out.json                                         keep Gemini's response (+ model, time, cost)
//   ... --from out.json                                         re-check a saved response (no call)
//
// For the scorecard over every eval deck, use npm run generate:eval (scripts/generate-eval.ts).

import { readFile, writeFile } from "node:fs/promises";
import { generateDocumentPrompts } from "../lib/gemini.ts";
import { estimateCostUsd } from "../lib/gemini/pricing.ts";
import { formatScorecardTable, scoreDocument, unwrapSaved, type RunInfo, type SavedResponse } from "../lib/games/scorecard.ts";
import type { DocumentPage, ValidPrompt } from "../lib/games/validate.ts";
import { charCount, loadEnv, loadFileDeck, loadSeedDeck, promptVersion } from "./deck-pages.ts";

loadEnv();

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
const deck = file ? await loadFileDeck(file) : await loadSeedDeck();
const title = deck.title;
let pages: DocumentPage[] = deck.pages;
const range = flag("--pages")?.match(/^(\d+)-(\d+)$/);
if (range) pages = pages.filter((p) => p.pageNumber >= +range[1] && p.pageNumber <= +range[2]);
console.log(`${title}: ${pages.length} pages, ${charCount(pages)} chars`);

// ---- Gemini (or a saved response) ----
let response: unknown;
let run: RunInfo | null = null;
const from = flag("--from");
if (from) {
  const { response: r, saved } = unwrapSaved(JSON.parse(await readFile(from, "utf8")));
  response = r;
  run = saved?.run ?? null;
  const made = saved ? ` (made by ${saved.run.model}, prompt version ${saved.promptVersion}; current ${promptVersion()})` : "";
  console.log(`Replaying ${from}${made}: no Gemini call\n`);
} else {
  const started = Date.now();
  const out = await generateDocumentPrompts(title, pages);
  response = out.response;
  const seconds = (Date.now() - started) / 1000;
  const { inputTokens, outputTokens, thinkingTokens } = out.usage;
  const cost = estimateCostUsd(out.model, out.usage);
  console.log(
    `${out.model}: ${seconds.toFixed(1)} s, tokens in ${inputTokens} / out ${outputTokens} / thinking ${thinkingTokens}` +
      (cost === null ? "" : `, ≈ $${cost.toFixed(4)} USD`) + "\n",
  );
  run = { model: out.model, seconds, usage: out.usage, costUsd: cost };
  const save = flag("--save");
  if (save) {
    const saved: SavedResponse = { deck: title, createdAt: new Date().toISOString(), promptVersion: promptVersion(), run, response };
    await writeFile(save, JSON.stringify(saved, null, 2) + "\n");
    console.log(`Saved the response to ${save}\n`);
  }
}

// ---- checks ----
const card = scoreDocument(response, pages);
for (const p of card.prompts) printPrompt(p);

console.log(`\n=== Dropped (${card.drops.length}) ===`);
for (const d of card.drops) console.log(`- "${d.prompt}" · ${d.what}: ${d.reason}`);

console.log(`\n=== Summary ===`);
console.log(formatScorecardTable([{ deck: title, pages: pages.length, run, card }]));
console.log(card.enoughForGame ? "\nEnough for a Game (≥ 7)." : "\nNOT enough for a Game (< 7): it would fail.");

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
