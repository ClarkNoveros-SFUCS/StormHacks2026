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
//   ... --verify                                also run the verification pass (F16): one more Gemini
//                                               call per deck, saved to <save dir>/verify/
//   ... --verify-from <dir>                     replay saved verifications instead (eval/verify, $0)
//   ... --verify-model <model>                  the verifier's model (default GEMINI_VERIFY_MODEL, else GEMINI_MODEL)
//   ... --overgenerate                          F17: ask for ~25 Prompts (--live) and keep the best 15-20 with
//                                               selectPrompts, after the verification pass if any
//   ... --split                                 F30: send each deck as Dive's parallel calls (--live), as
//                                               generateGame does with GEMINI_SPLIT on; s is the wall time
//   ... --drops                                 list every drop under the table
//   ... --json                                  JSON instead of the table
//
// Course files stay out of git: put them in eval/decks/ or set EVAL_DECKS_DIR.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { estimateCostUsd } from "../lib/gemini/pricing.ts";
import { geminiVerifyCall } from "../lib/gemini/verify.ts";
import {
  formatScorecardTable, scoreDocument, unwrapSaved,
  type RunInfo, type SavedResponse, type SavedVerification, type Scorecard, type ScorecardRow,
} from "../lib/games/scorecard.ts";
import { verifyDocument } from "../lib/games/verify.ts";
import { diveGenerator } from "../lib/modes/dive/generate.ts";
import { generationPlan } from "../lib/modes/generation.ts";
import { generateTimed, loadEnv, loadFileDeck, loadSeedDeck, requestsVersion, root, verifyVersion, type Deck } from "./deck-pages.ts";

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
const verifyLive = args.includes("--verify");
const verifyFrom = flag("--verify-from") && path.resolve(root, flag("--verify-from")!);
if (flag("--verify-model")) process.env.GEMINI_VERIFY_MODEL = flag("--verify-model");
const overgenerate = args.includes("--overgenerate");
const split = args.includes("--split");
const { requests } = generationPlan(diveGenerator, { overgenerate, split });

const manifest: { decks: EvalDeck[] } = JSON.parse(await readFile(path.join(root, "eval/decks.json"), "utf8"));
const decks = manifest.decks.filter((d) => !only || only.includes(d.id));
if (!decks.length) {
  console.error(`No deck matches --deck ${only}. Decks: ${manifest.decks.map((d) => d.id).join(", ")}`);
  process.exit(1);
}

const version = requestsVersion(requests);
const rows: ScorecardRow[] = [];
const notes: string[] = [];
let spent = 0;
if (live || verifyLive) await mkdir(saveDir, { recursive: true });

for (const d of decks) {
  const deck = await loadDeck(d);
  if (typeof deck === "string") {
    rows.push({ deck: d.id, pages: 0, run: null, card: null, note: deck });
    continue;
  }
  let response: unknown;
  let run: RunInfo | null;
  if (live) {
    process.stderr.write(`${d.id}: calling Gemini (${requests.length} call${requests.length > 1 ? "s" : ""}) on ${deck.pages.length} pages… `);
    try {
      const out = await generateTimed(deck.title, deck.pages, requests);
      run = out.run;
      response = out.response;
      for (const err of out.failed) notes.push(`${d.id}: one split call failed, scored the others: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
    } catch (err) {
      process.stderr.write("failed\n");
      rows.push({ deck: d.id, pages: deck.pages.length, run: null, card: null, note: `Gemini failed: ${err instanceof Error ? err.message.slice(0, 80) : err}` });
      continue;
    }
    spent += run.costUsd ?? 0;
    const parts = run.parts ? ` (calls: ${run.parts.map((p) => `${p.seconds.toFixed(0)} s`).join(", ")})` : "";
    process.stderr.write(`${run.seconds.toFixed(0)} s, ${run.model}${parts}\n`);
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
  const card = scoreDocument(response, deck.pages);
  rows.push(
    verifyLive || verifyFrom
      ? await verified(d.id, deck, response, card, run)
      : { deck: d.id, pages: deck.pages.length, run, card: overgenerate ? scoreDocument(response, deck.pages, undefined, { select: true }) : card },
  );
}

if (args.includes("--json")) {
  const out = rows.map(({ card, ...rest }) => ({ ...rest, card: card && { ...card, prompts: undefined } }));
  console.log(JSON.stringify({ promptVersion: version, mode: live ? "live" : "replay", rows: out }, null, 2));
} else {
  const source = live ? `live, saved to ${path.relative(root, saveDir)}/` : `replay of ${path.relative(root, fromDir)}/ (no Gemini call; s and $ are from when it was saved)`;
  console.log(`Generation scorecard · prompt version ${version}${overgenerate ? " (overgenerate + select)" : ""}${split ? " (split)" : ""} · ${source}\n`);
  console.log(formatScorecardTable(rows));
  console.log(
    "\nKinds: open/cloze/definition_to_term/ordered_recall/odd_one_out. Ans/Open: mean kept Answers per Open Prompt." +
      "\nQuotes ok: kept Answers whose evidence quote is on its page. Hints removed: by check 5, of Hints given." +
      "\nDropped P / A: Prompts / Answers dropped by the checks. ⚠ fewer than 7 Prompts kept." +
      (verifyLive || verifyFrom
        ? "\nVerify removed A / P: Answers judged unsupported / Prompts removed by the verification pass (F16);" +
          " the other columns describe what survives it."
        : "") +
      (overgenerate ? "\nSelected: Prompts selectPrompts chose from → kept (F17); the other columns describe what it kept." : ""),
  );
  for (const n of notes) console.log(`Note: ${n}`);
  if (args.includes("--drops")) {
    for (const r of rows) {
      if (!r.card?.drops.length && !r.card?.verify?.drops.length && !r.card?.select?.drops.length) continue;
      console.log(`\n${r.deck}:`);
      for (const drop of [...r.card.drops, ...(r.card.verify?.drops ?? []), ...(r.card.select?.drops ?? [])]) console.log(`- "${drop.prompt}" · ${drop.what}: ${drop.reason}`);
    }
  }
  console.log(live || verifyLive ? `\nGemini spend this run: ≈ $${spent.toFixed(3)} USD` : "\nGemini spend this run: $0 (replay)");
}

/** The row with the verification pass applied: a live call (--verify) or a saved one (--verify-from). */
async function verified(id: string, deck: Deck, response: unknown, card: Scorecard, run: RunInfo | null): Promise<ScorecardRow> {
  const base = { deck: id, pages: deck.pages.length, run };
  const texts = card.prompts.map((p) => p.text);
  let saved: SavedVerification;
  if (verifyLive) {
    process.stderr.write(`${id}: verifying ${texts.length} Prompts… `);
    const out = await verifyDocument(deck.title, deck.pages, card.prompts, geminiVerifyCall);
    if (out.status !== "verified" || !out.model || !out.usage) {
      process.stderr.write("failed\n");
      notes.push(`${id}: verification ${out.status}: ${out.error ?? ""}`.slice(0, 200));
      return { ...base, card: overgenerate ? scoreDocument(response, deck.pages, undefined, { select: true }) : card };
    }
    const vrun = { model: out.model, seconds: out.seconds, usage: out.usage, costUsd: estimateCostUsd(out.model, out.usage) };
    spent += vrun.costUsd ?? 0;
    process.stderr.write(`${vrun.seconds.toFixed(0)} s, ${vrun.model}\n`);
    saved = { deck: id, createdAt: new Date().toISOString(), verifyVersion: verifyVersion(), run: vrun, prompts: texts, response: out.response };
    await mkdir(path.join(saveDir, "verify"), { recursive: true });
    await writeFile(path.join(saveDir, "verify", `${id}.json`), JSON.stringify(saved, null, 2) + "\n");
  } else {
    try {
      saved = JSON.parse(await readFile(path.join(verifyFrom!, `${id}.json`), "utf8"));
    } catch {
      notes.push(`${id}: no saved verification in ${path.relative(root, verifyFrom!)}`);
      return { ...base, card };
    }
    if (JSON.stringify(saved.prompts) !== JSON.stringify(texts)) {
      notes.push(`${id}: the saved verification judged other Prompts (a different response); run --verify`);
      return { ...base, card };
    }
    if (saved.verifyVersion !== verifyVersion()) notes.push(`${id}: verified with verify version ${saved.verifyVersion}; the current one is ${verifyVersion()}`);
  }
  return { ...base, card: scoreDocument(response, deck.pages, saved.response, { select: overgenerate }), verifyRun: saved.run };
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
