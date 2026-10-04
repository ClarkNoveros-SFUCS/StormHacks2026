// Generation scorecard (F14): one row per eval deck (eval/decks.json) with what the checks
// keep and drop, time and cost. Replaying saved responses is free, so a change to the checks
// (validate.ts) is compared without calling Gemini; a prompt change needs --live.
// Spec: docs/architecture/game-generation-pipeline.md § Improving output quality.
//
//   npm run generate:eval                       replay eval/responses/ (no Gemini call, $0)
//   npm run generate:eval -- --from <dir>       replay another set of saved responses
//   npm run generate:eval -- --live             one Gemini call per deck (≈ $0.20 for all four),
//                                               saved to eval/runs/<time>/ (gitignored)
//   ... --save <dir>                            where --live saves (eval/responses replaces the baseline)
//   ... --deck <id>[,<id>]                      only these decks
//   ... --no-fallback                           never switch to GEMINI_FALLBACK_MODEL (one model per table)
//   ... --drops                                 list every drop under the table
//   ... --json                                  JSON instead of the table
//
// Course files stay out of git: put them in eval/decks/ or set EVAL_DECKS_DIR.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateDocumentPrompts } from "../lib/gemini.ts";
import { estimateCostUsd } from "../lib/gemini/pricing.ts";
import { formatScorecardTable, scoreDocument, unwrapSaved, type RunInfo, type SavedResponse, type ScorecardRow } from "../lib/games/scorecard.ts";
import { loadEnv, loadFileDeck, loadSeedDeck, promptVersion, root, type Deck } from "./deck-pages.ts";

loadEnv();

type EvalDeck = { id: string; seed?: boolean; file?: string; sha256?: string; about?: string };

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const live = args.includes("--live");
const fromDir = path.resolve(root, flag("--from") ?? "eval/responses");
const saveDir = path.resolve(root, flag("--save") ?? `eval/runs/${new Date().toISOString().replace(/[:.]/g, "-")}`);
const decksDir = path.resolve(root, process.env.EVAL_DECKS_DIR || "eval/decks");
const only = flag("--deck")?.split(",");
if (args.includes("--no-fallback")) delete process.env.GEMINI_FALLBACK_MODEL;

const manifest: { decks: EvalDeck[] } = JSON.parse(await readFile(path.join(root, "eval/decks.json"), "utf8"));
const decks = manifest.decks.filter((d) => !only || only.includes(d.id));
if (!decks.length) {
  console.error(`No deck matches --deck ${only}. Decks: ${manifest.decks.map((d) => d.id).join(", ")}`);
  process.exit(1);
}

const version = promptVersion();
const rows: ScorecardRow[] = [];
const notes: string[] = [];
let spent = 0;
if (live) await mkdir(saveDir, { recursive: true });

for (const d of decks) {
  const deck = await loadDeck(d);
  if (typeof deck === "string") {
    rows.push({ deck: d.id, pages: 0, run: null, card: null, note: deck });
    continue;
  }
  let response: unknown;
  let run: RunInfo | null;
  if (live) {
    process.stderr.write(`${d.id}: calling Gemini on ${deck.pages.length} pages… `);
    const started = Date.now();
    try {
      const out = await generateDocumentPrompts(deck.title, deck.pages);
      run = { model: out.model, seconds: (Date.now() - started) / 1000, usage: out.usage, costUsd: estimateCostUsd(out.model, out.usage) };
      response = out.response;
    } catch (err) {
      process.stderr.write("failed\n");
      rows.push({ deck: d.id, pages: deck.pages.length, run: null, card: null, note: `Gemini failed: ${err instanceof Error ? err.message.slice(0, 80) : err}` });
      continue;
    }
    spent += run.costUsd ?? 0;
    process.stderr.write(`${run.seconds.toFixed(0)} s, ${run.model}\n`);
    const saved: SavedResponse = { deck: d.id, createdAt: new Date().toISOString(), promptVersion: version, run, response };
    await writeFile(path.join(saveDir, `${d.id}.json`), JSON.stringify(saved, null, 2) + "\n");
  } else {
    let json: unknown;
    try {
      json = JSON.parse(await readFile(path.join(fromDir, `${d.id}.json`), "utf8"));
    } catch {
      rows.push({ deck: d.id, pages: deck.pages.length, run: null, card: null, note: `no saved response in ${path.relative(root, fromDir)}` });
      continue;
    }
    const { response: r, saved } = unwrapSaved(json);
    response = r;
    run = saved?.run ?? null;
    if (saved && saved.promptVersion !== version) notes.push(`${d.id}: saved with prompt version ${saved.promptVersion}; the current prompt is ${version}`);
  }
  rows.push({ deck: d.id, pages: deck.pages.length, run, card: scoreDocument(response, deck.pages) });
}

if (args.includes("--json")) {
  const out = rows.map(({ card, ...rest }) => ({ ...rest, card: card && { ...card, prompts: undefined } }));
  console.log(JSON.stringify({ promptVersion: version, mode: live ? "live" : "replay", rows: out }, null, 2));
} else {
  const source = live ? `live, saved to ${path.relative(root, saveDir)}/` : `replay of ${path.relative(root, fromDir)}/ (no Gemini call; s and $ are from when it was saved)`;
  console.log(`Generation scorecard · prompt version ${version} · ${source}\n`);
  console.log(formatScorecardTable(rows));
  console.log(
    "\nKinds: open/cloze/definition_to_term/ordered_recall/odd_one_out. Ans/Open: mean kept Answers per Open Prompt." +
      "\nQuotes ok: kept Answers whose evidence quote is on its page. Hints removed: by check 5, of Hints given." +
      "\nDropped P / A: Prompts / Answers dropped by the checks. ⚠ fewer than 7 Prompts kept.",
  );
  for (const n of notes) console.log(`Note: ${n}`);
  if (args.includes("--drops")) {
    for (const r of rows) {
      if (!r.card?.drops.length) continue;
      console.log(`\n${r.deck}:`);
      for (const drop of r.card.drops) console.log(`- "${drop.prompt}" · ${drop.what}: ${drop.reason}`);
    }
  }
  console.log(live ? `\nGemini spend this run: ≈ $${spent.toFixed(3)} USD` : "\nGemini spend this run: $0 (replay)");
}

/** The deck's pages, or why it can't be scored. */
async function loadDeck(d: EvalDeck): Promise<Deck | string> {
  if (d.seed) return loadSeedDeck();
  if (!d.file) return "no file in eval/decks.json";
  const file = path.join(decksDir, d.file);
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch {
    return `deck file missing: put ${d.file} in ${path.relative(root, decksDir) || decksDir} or set EVAL_DECKS_DIR`;
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (d.sha256 && hash !== d.sha256) notes.push(`${d.id}: ${d.file} differs from the file the baseline was made from (sha256)`);
  return loadFileDeck(file);
}
