#!/usr/bin/env node
// Writes new Daily Dive puzzles with Gemini and adds them to the pool. Spec:
// docs/architecture/daily-dive.md § Generation. Two Gemini calls per puzzle (write, then
// verify), then the same checks and writer as the seed pool (lib/daily/puzzle.ts). New
// puzzles wait in the pool (status 'pool', no day) and are claimed in number order.
// Needs Node 22.18+, GEMINI_API_KEY, GEMINI_MODEL and DATABASE_URL.
//
// Usage: npm run daily:generate -- --days 3              three new puzzles
//        npm run daily:generate -- --days 1 --dry-run    generate and check, write nothing
//        ... --save <file.json>   also save the puzzles in pool.json shape
//        ... --theme "Space"      one theme for all (default: Q23's rotation by number)
//        ... --max-usd 0.5        stop once the estimated spend passes this (default 1)
//
// A puzzle that fails verification or the checks is retried once; still failing, it's
// skipped. The spend estimate uses the prices in lib/daily/generate.ts.

import { writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { generateDocumentPrompts, type GeminiUsage } from "../lib/gemini.ts";
import {
  alignEvidence, applyVerdicts, capOpenAnswers, cleanTitle, costUsd, kindErrors, puzzleRequest, themeFor, verifyRequest, type Verdict,
} from "../lib/daily/generate.ts";
import { buildPuzzleRows, checkPuzzle, nextPuzzleNumber, writePuzzle, type PuzzleFile } from "../lib/daily/puzzle.ts";

const root = path.resolve(import.meta.dirname, "..");
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(root, file)); // never overrides variables already set
  } catch {}
}

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const days = Number(flag("--days") ?? 1);
const dryRun = args.includes("--dry-run");
const save = flag("--save");
const themeOverride = flag("--theme");
const maxUsd = Number(flag("--max-usd") ?? 1);
if (!Number.isInteger(days) || days < 1 || days > 30) {
  console.error("--days must be 1-30");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Put it in .env.local (see .env.example).");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
let spent = 0;

function track(label: string, model: string, usage: GeminiUsage, started: number) {
  const cost = costUsd(model, usage);
  spent += cost ?? 0;
  console.log(
    `  ${label}: ${model}, ${((Date.now() - started) / 1000).toFixed(1)} s, tokens in ${usage.inputTokens} / out ${usage.outputTokens} / thinking ${usage.thinkingTokens}` +
      (cost === null ? " (no price on file)" : `, ≈ $${cost.toFixed(4)}`),
  );
}

/** Prompt texts already used in this theme, so Gemini asks about other things. */
async function usedPrompts(theme: string): Promise<string[]> {
  const rows = await sql<{ text: string }[]>`
    select p.text from daily_puzzles d join prompts p on p.id = any(d.prompt_ids)
     where lower(d.theme) = lower(${theme}) order by d.number, p.text`;
  return rows.map((r) => r.text);
}

/** One attempt: generate, verify, check. Returns the puzzle or why it failed. */
async function attempt(theme: string): Promise<{ puzzle: PuzzleFile } | { error: string }> {
  let started = Date.now();
  const gen = await generateDocumentPrompts(theme, [], puzzleRequest(theme, await usedPrompts(theme)));
  track("write", gen.model, gen.usage, started);
  let puzzle = cleanTitle(alignEvidence(capOpenAnswers(gen.response as PuzzleFile)));
  const kinds = kindErrors(puzzle);
  if (kinds.length) return { error: kinds.join("; ") };
  const pre = checkPuzzle(puzzle, { strict: false });
  if (pre.errors.length) {
    for (const d of pre.dropped.slice(0, 8)) console.log(`  dropped by checks: "${d.prompt}" · ${d.what}: ${d.reason}`);
    return { error: `checks before verifying: ${pre.errors.join("; ")}` };
  }

  started = Date.now();
  const ver = await generateDocumentPrompts(puzzle.title, [], verifyRequest(puzzle));
  track("verify", ver.model, ver.usage, started);
  const verdicts = ((ver.response as { verdicts?: Verdict[] }).verdicts ?? []).filter((v) => typeof v?.id === "string");
  const applied = applyVerdicts(puzzle, verdicts);
  for (const d of applied.dropped) console.log(`  dropped by verification: ${d}`);
  if (applied.failed.length) return { error: `verification failed: ${applied.failed.join("; ")}` };
  puzzle = applied.puzzle;

  const checked = checkPuzzle(puzzle, { strict: false });
  for (const d of checked.dropped) console.log(`  dropped by checks: "${d.prompt}" · ${d.what}: ${d.reason}`);
  if (checked.errors.length) return { error: checked.errors.join("; ") };
  return { puzzle };
}

const saved: PuzzleFile[] = [];
try {
  const [{ max }] = await sql<{ max: number }[]>`select coalesce(max(number), 0)::int as max from daily_puzzles`;
  let made = 0;
  for (let i = 0; i < days; i++) {
    const planned = max + 1 + made;
    const theme = themeOverride ?? themeFor(planned);
    console.log(`\nPuzzle ${i + 1}/${days} (Daily #${planned} if added) · ${theme}`);
    let result: { puzzle: PuzzleFile } | { error: string } = { error: "not tried" };
    for (let tries = 1; tries <= 2; tries++) {
      if (spent >= maxUsd) {
        result = { error: `stopped: estimated spend $${spent.toFixed(3)} reached --max-usd ${maxUsd}` };
        break;
      }
      result = await attempt(theme);
      if ("puzzle" in result) break;
      console.log(`  attempt ${tries} rejected: ${result.error}`);
    }
    if (!("puzzle" in result)) {
      console.log(`  skipped: ${result.error}`);
      if (spent >= maxUsd) break;
      continue;
    }
    const puzzle = result.puzzle;
    const open = (puzzle.prompts as { kind: string; answers?: unknown[] }[]).filter((p) => p.kind === "open").map((p) => p.answers?.length);
    console.log(`  "${puzzle.title}" OK (Open Answers ${open.join("/")})`);
    for (const p of puzzle.prompts as { kind: string; text: string }[]) console.log(`    ${p.kind}: ${p.text}`);

    if (dryRun) {
      saved.push({ number: planned, day: null, ...puzzle });
      made++;
      continue;
    }
    const written = await sql.begin(async (tx) => {
      const number = await nextPuzzleNumber(tx);
      const checked = checkPuzzle({ ...puzzle, number }, { strict: false });
      return writePuzzle(tx, buildPuzzleRows(checked, number), { day: null, source: "gemini" });
    });
    console.log(`  added Daily #${written.number} to the pool (${written.outcome})`);
    saved.push({ number: written.number, day: null, ...puzzle });
    made++;
  }
  console.log(`\n${made} of ${days} puzzles ${dryRun ? "generated (dry run, nothing written)" : "added to the pool"}. Estimated Gemini spend: $${spent.toFixed(4)}`);
  if (save) {
    await writeFile(path.resolve(save), JSON.stringify({ puzzles: saved }, null, 2) + "\n");
    console.log(`Saved to ${save}`);
  }
} catch (err) {
  console.error("\nGeneration failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
