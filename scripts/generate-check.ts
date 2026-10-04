// Generates one document's Prompts exactly as the Game pipeline does (extraction → Gemini →
// checks), without the app or the database. For tuning the prompt on real lecture files.
// Costs one Gemini call per run unless --from replays a saved response.
//
//   npm run generate:check -- path/to/lecture.pdf               summary + every kept Prompt
//   npm run generate:check -- path/to/lecture.pdf --pages 1-20  only those pages (cheaper)
//   npm run generate:check -- --seed                            the seed fixture's pages
//   ... --mode leap                                             a Game Mode's generator (default dive)
//   ... --save out.json                                         keep Gemini's response (+ model, time, cost)
//   ... --from out.json                                         re-check a saved response (no call)
//   ... --verify                                                also run the verification pass (F16):
//                                                               one more Gemini call, any Mode
//   ... --overgenerate                                          F17 (Dive, Apogee): ask for ~25 Prompts and
//                                                               keep the best 15-20 (selectPrompts)
//
// For the scorecard over every eval deck, use npm run generate:eval (scripts/generate-eval.ts).

import { readFile, writeFile } from "node:fs/promises";
import { generateDocumentPrompts } from "../lib/gemini.ts";
import { estimateCostUsd } from "../lib/gemini/pricing.ts";
import { geminiVerifyCall } from "../lib/gemini/verify.ts";
import { formatScorecardTable, scoreDocument, unwrapSaved, type RunInfo, type SavedResponse } from "../lib/games/scorecard.ts";
import { dedupeAcrossDocuments, type DocumentPage } from "../lib/games/validate.ts";
import { verifyDocument } from "../lib/games/verify.ts";
import type { GeneratedPrompt } from "../lib/modes/generation.ts";
import { generatorFor } from "../lib/modes/generators.ts";
import { MODES, type ModeId } from "../lib/modes/index.ts";
import { GAME_OVERGENERATE_SYSTEM_INSTRUCTION } from "../lib/gemini/game-prompt.ts";
import { charCount, loadEnv, loadFileDeck, loadSeedDeck, promptVersion } from "./deck-pages.ts";

loadEnv();

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const valueFlags = new Set(["--pages", "--save", "--from", "--mode"].map((f) => flag(f)));
const file = args.find((a) => !a.startsWith("--") && !valueFlags.has(a));
const usage =
  "Usage: npm run generate:check -- <file.pdf|pptx|docx> | --seed  [--mode dive|apogee|leap|pairs|blitz] [--pages 1-20] [--save out.json] [--from out.json] [--verify] [--overgenerate]";
if (!file && !args.includes("--seed")) {
  console.error(usage);
  process.exit(1);
}
const mode = (flag("--mode") ?? "dive") as ModeId;
const generator = generatorFor(mode);
if (!generator) {
  console.error(`Unknown or unavailable Mode "${mode}".\n${usage}`);
  process.exit(1);
}

const over = args.includes("--overgenerate") ? (generator.overgenerate ?? null) : null;
if (args.includes("--overgenerate") && !over) console.warn(`${MODES[mode].name} doesn't overgenerate (Dive and Apogee only); ignoring --overgenerate`);
const version = over ? promptVersion(GAME_OVERGENERATE_SYSTEM_INSTRUCTION) : promptVersion();

// ---- pages ----
const deck = file ? await loadFileDeck(file) : await loadSeedDeck();
const title = deck.title;
let pages: DocumentPage[] = deck.pages;
const range = flag("--pages")?.match(/^(\d+)-(\d+)$/);
if (range) pages = pages.filter((p) => p.pageNumber >= +range[1] && p.pageNumber <= +range[2]);
console.log(`${title}: ${pages.length} pages, ${charCount(pages)} chars · Mode ${MODES[mode].name}`);

// ---- Gemini (or a saved response) ----
let response: unknown;
let run: RunInfo | null = null;
const from = flag("--from");
if (from) {
  const { response: r, saved } = unwrapSaved(JSON.parse(await readFile(from, "utf8")));
  response = r;
  run = saved?.run ?? null;
  const made = saved ? ` (made by ${saved.run.model}, prompt version ${saved.promptVersion}; current ${version})` : "";
  console.log(`Replaying ${from}${made}: no Gemini call\n`);
} else {
  const started = Date.now();
  const out = await generateDocumentPrompts(title, pages, over?.request ?? generator.request);
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
    const saved: SavedResponse = { deck: title, createdAt: new Date().toISOString(), promptVersion: version, run, response };
    await writeFile(save, JSON.stringify(saved, null, 2) + "\n");
    console.log(`Saved the response to ${save}\n`);
  }
}

// ---- checks: the Mode's per-document checks, check 7, then the Mode's Game-level checks ----
const result = generator.validate(response, pages);
// ---- the verification pass (F16), as generateGame runs it ----
const verify = args.includes("--verify") ? await verifyDocument(title, pages, result.prompts, geminiVerifyCall) : null;
/** The verification call as a scorecard RunInfo, or null when it didn't run or failed. */
function verifyRun(): RunInfo | null {
  if (!verify?.model || !verify.usage) return null;
  return { model: verify.model, seconds: verify.seconds, usage: verify.usage, costUsd: estimateCostUsd(verify.model, verify.usage) };
}
if (verify) {
  const cost = verifyRun()?.costUsd ?? null;
  console.log(
    verify.status === "verified"
      ? `Verification: ${verify.model}, ${verify.seconds.toFixed(1)} s${cost === null ? "" : `, ≈ $${cost.toFixed(4)} USD`}: ` +
          `removed ${verify.answersRemoved} Answers and ${verify.promptsRemoved} of ${result.prompts.length} Prompts` +
          (verify.unverified ? ` (${verify.unverified} without a verdict, kept)` : "") + "\n"
      : `Verification ${verify.status}: ${verify.error} (every Prompt kept unverified)\n`,
  );
}
// ---- selection (F17, --overgenerate), as generateGame runs it ----
const verified = verify ? verify.prompts : result.prompts;
const selected = over ? over.select(verified, verify?.statuses) : null;
if (selected) console.log(`Selection: kept ${selected.prompts.length} of ${verified.length} Prompts\n`);
const deduped = dedupeAcrossDocuments([{ doc: title, prompts: selected ? selected.prompts : verified }]);
const final = generator.finalize(deduped.kept);
const prompts = final.kept.map((k) => k.prompt);
const returned = (response as { prompts?: unknown[] })?.prompts?.length ?? 0;
for (const p of prompts) printPrompt(p);

const dropped = [...result.dropped, ...(verify?.dropped ?? []), ...(selected?.dropped ?? []), ...deduped.dropped, ...final.dropped];
console.log(`\n=== Dropped (${dropped.length}) ===`);
for (const d of dropped) console.log(`- "${d.prompt}" · ${d.what}: ${d.reason}`);

const byKind = MODES[mode].kinds.map((k) => `${k} ${prompts.filter((p) => p.kind === k).length}`).join(", ");
const answers = prompts.flatMap((p) => p.answers);
console.log(`\n=== Summary ===`);
console.log(`Prompts: ${returned} returned → ${prompts.length} kept (${byKind})`);
if (mode === "blitz") {
  console.log(`True/false: ${prompts.filter((p) => p.isTrue).length} true, ${prompts.filter((p) => p.isTrue === false).length} false`);
}
// Hints exist only in Dive and Apogee, for single-answer kinds
const hinted = MODES[mode].engine === "dive" ? prompts.filter((p) => p.kind !== "open") : [];
console.log(
  `Answers: ${answers.length}; quotes not found on their page: ${result.quotesCleared}` +
    (hinted.length ? `; Hints removed: ${hinted.filter((p) => !p.hint).length}` : ""),
);
// The F14 scorecard row scores Dive's checks (lib/games/validate.ts), so only Dive-engine Modes get one
if (MODES[mode].engine === "dive") {
  console.log("\n" + formatScorecardTable([{ deck: title, pages: pages.length, run, card: scoreDocument(response, pages, verify?.status === "verified" ? verify.response : undefined, { select: !!over }), verifyRun: verifyRun() }]));
}
console.log(
  prompts.length >= generator.minPrompts
    ? `\nEnough for a Game in ${MODES[mode].name} (≥ ${generator.minPrompts}).`
    : `\nNOT enough for a Game in ${MODES[mode].name} (< ${generator.minPrompts}): it would fail.`,
);

function printPrompt(p: GeneratedPrompt) {
  const tier = p.tier ? ` [${p.tier}]` : "";
  console.log(`\n▸ ${p.kind}${tier}: ${p.text}`);
  if (p.kind === "ordered_recall") p.items!.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
  if (p.kind === "odd_one_out") console.log(`    options: ${p.options!.join(" | ")}  → ${p.answers[0].canonical} (p.${p.evidencePage})`);
  if (p.kind === "multiple_choice") {
    for (const o of p.options!) console.log(`    ${o === p.answers[0].canonical ? "✓" : "·"} ${o}`);
    console.log(`    p.${p.evidencePage} "${p.answers[0].evidenceQuote?.slice(0, 80)}"`);
  }
  if (p.kind === "true_false") console.log(`    ${p.isTrue ? "TRUE" : "FALSE"} · p.${p.evidencePage} "${p.answers[0].evidenceQuote?.slice(0, 80)}"`);
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
