// One Daily Dive puzzle: its checks, its rows and its writer. Both the seed pool
// (npm run db:seed:daily) and Gemini generation (npm run daily:generate) go through here, so
// every puzzle passes the same checks as a generated Dive Game (lib/modes/dive/generate.ts:
// answer_keys via normalize(), Open Tiers via assignOpenTiers) plus the Daily's own rules.
// Spec: docs/architecture/daily-dive.md.
//
// How a puzzle is stored (ADR-0006): the system Player's "Daily Dive" Module holds, per
// puzzle, a fact sheet (a parsed Source Document, page N = the Evidence for Prompt N) and one
// Dive Game of exactly 7 Prompts, played in fact-sheet order. The Game is private until the
// puzzle goes live on its day (claim_daily_puzzle() in the migration makes it public).
//
// Pure apart from writePuzzle(tx): relative .ts imports only, so plain Node can load it.

import { createHash } from "node:crypto";
import type postgres from "postgres";
import { buildGameRows, insertGame, SYSTEM_PLAYER_ID, type CheckedGame } from "../courses/seed.ts";
import { dedupeAcrossDocuments, type DocumentPage, type Drop } from "../games/validate.ts";
import type { GeneratedPrompt } from "../modes/generation.ts";
import { generatorFor } from "../modes/generators.ts";

export const PUZZLE_PROMPTS = 7;
export const MIN_OPEN = 3;
export const OPEN_ANSWERS = { min: 6, max: 12 } as const;
const WRITE_LOCK = 727_005; // advisory lock namespace (727_004 is claim_daily_puzzle's per-day lock)

/** The shape of one puzzle in db/seed/daily/pool.json and of Gemini's generated puzzle. */
export type PuzzleFile = {
  number?: number;
  day?: string | null;
  theme: string;
  title: string;
  fact_sheet: { pages: { page_number: number; content_md: string }[] };
  prompts: unknown[];
};

export type PuzzleSource = "seed" | "gemini";

export type CheckedPuzzle = {
  file: PuzzleFile;
  pages: DocumentPage[];
  /** The 7 Prompts in play order. */
  prompts: GeneratedPrompt[];
  /** Strict: anything here makes the puzzle unusable. */
  errors: string[];
  /** What the pipeline dropped or cleared (errors in strict mode, notes otherwise). */
  dropped: Drop[];
  quotesCleared: number;
};

const short = (s: string) => (s.length > 50 ? `${s.slice(0, 47)}...` : s);

/**
 * Runs a puzzle through Dive's generation checks and the Daily's rules: 7 Prompts, page N of
 * the fact sheet backs Prompt N, at least 3 Open Prompts with 6–12 Answers each.
 * `strict` (hand-written seeds): anything the pipeline would drop or clear is an error.
 * Lenient (generated): dropped Answers are fine as long as the rules still hold afterwards.
 */
export function checkPuzzle(file: PuzzleFile, { strict }: { strict: boolean }): CheckedPuzzle {
  const errors: string[] = [];
  const at = `daily${file.number ? ` #${file.number}` : ""}`;
  if (!file.theme?.trim()) errors.push(`${at}: theme is empty`);
  if (!file.title?.trim()) errors.push(`${at}: title is empty`);
  const rawPages = file.fact_sheet?.pages ?? [];
  const pages = rawPages.map((p) => ({ pageNumber: p.page_number, contentMd: p.content_md }));
  if (pages.length !== PUZZLE_PROMPTS) errors.push(`${at}: the fact sheet has ${pages.length} pages, needs ${PUZZLE_PROMPTS}`);
  pages.forEach((p, i) => {
    if (p.pageNumber !== i + 1) errors.push(`${at}: fact sheet page ${i + 1} has page_number ${p.pageNumber}`);
    if (!p.contentMd?.trim()) errors.push(`${at}: fact sheet page ${i + 1} is empty`);
  });
  const raw = Array.isArray(file.prompts) ? file.prompts : [];
  if (raw.length !== PUZZLE_PROMPTS) errors.push(`${at}: has ${raw.length} Prompts, needs ${PUZZLE_PROMPTS}`);

  const dive = generatorFor("dive")!;
  const result = dive.validate({ prompts: raw }, pages);
  const deduped = dedupeAcrossDocuments([{ doc: null, prompts: result.prompts }]);
  const final = dive.finalize(deduped.kept);
  const dropped = [...result.dropped, ...deduped.dropped, ...final.dropped];
  if (strict) {
    for (const d of dropped) errors.push(`${at}: "${d.prompt}" · ${d.what}: ${d.reason}`);
    if (result.quotesCleared) errors.push(`${at}: ${result.quotesCleared} evidence quotes aren't verbatim on their page`);
  }
  const prompts = final.kept.map((k) => k.prompt);
  if (prompts.length !== PUZZLE_PROMPTS) errors.push(`${at}: ${prompts.length} Prompts passed the checks, needs ${PUZZLE_PROMPTS}`);

  prompts.forEach((p, i) => {
    const pat = `${at} prompt ${i + 1} (${p.kind} "${short(p.text)}")`;
    const cited = p.evidencePage !== null ? [p.evidencePage] : p.answers.map((a) => a.evidencePage);
    if (cited.some((n) => n !== i + 1)) errors.push(`${pat}: Evidence must be on fact sheet page ${i + 1}`);
    if (p.kind === "open" && (p.answers.length < OPEN_ANSWERS.min || p.answers.length > OPEN_ANSWERS.max)) {
      errors.push(`${pat}: has ${p.answers.length} Answers (want ${OPEN_ANSWERS.min}-${OPEN_ANSWERS.max})`);
    }
  });
  const open = prompts.filter((p) => p.kind === "open").length;
  if (open < MIN_OPEN) errors.push(`${at}: has ${open} Open Prompts (needs at least ${MIN_OPEN})`);
  return { file, pages, prompts, errors, dropped, quotesCleared: result.quotesCleared };
}

// ---------- Rows ----------

/** A stable uuid from a string (md5 formatted as a uuid, like the Course seed). */
export function dailyUuid(key: string): string {
  const h = createHash("md5").update(`daily:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

/** The system Player's Module that holds every Daily puzzle. */
export const DAILY_MODULE_ID = dailyUuid("module");
export const DAILY_MODULE_NAME = "Daily Dive";

export type PuzzleRows = ReturnType<typeof buildPuzzleRows>;

/** Every row a puzzle needs, with ids derived from its content (so a re-seed writes nothing new). */
export function buildPuzzleRows(checked: CheckedPuzzle, number: number) {
  const f = checked.file;
  const filename = `Daily Dive #${number} · ${f.title} (fact sheet)`;
  const contents = checked.pages.map((p) => p.contentMd);
  const documentId = dailyUuid(`document:${number}:${sha({ filename, contents })}`);
  const pageId = (n: number) => dailyUuid(`${documentId}:page:${n}`);
  const document = {
    id: documentId,
    module_id: DAILY_MODULE_ID,
    player_id: SYSTEM_PLAYER_ID,
    filename,
    mime_type: "text/markdown",
    size_bytes: Buffer.byteLength(contents.join("\n\n"), "utf8"),
    stage_path: null,
    status: "parsed",
    page_count: contents.length,
  };
  const pages = checked.pages.map((p) => ({
    id: pageId(p.pageNumber),
    source_document_id: documentId,
    page_index: p.pageNumber - 1,
    page_number: p.pageNumber,
    content_md: p.contentMd,
  }));
  const game: CheckedGame = { mode: "dive", title: `Daily Dive #${number}: ${f.title}`, prompts: checked.prompts, raw: [] };
  const gameRows = buildGameRows(game, documentId, DAILY_MODULE_ID, pageId);
  gameRows.game.visibility = "private"; // public once live (claim_daily_puzzle)
  return {
    number,
    theme: f.theme.trim(),
    title: f.title.trim(),
    document,
    pages,
    game: gameRows,
    promptIds: gameRows.prompts.map((p) => p.id as string),
  };
}

// ---------- Writing ----------

type Tx = postgres.TransactionSql;

export type WriteOutcome =
  | "created" //    a new puzzle
  | "unchanged" //  same content as stored
  | "updated" //    content changed before it went live: points at a new Game
  | "kept-live"; // content changed but the puzzle is already live: left as it is

export type WriteResult = { number: number; outcome: WriteOutcome; day: string | null; status: string; note?: string };

/**
 * Writes a puzzle inside the caller's transaction. `day` (YYYY-MM-DD) schedules it; null puts
 * it in the pool. Idempotent and never touches a live puzzle's content or anyone's Runs: a
 * changed puzzle gets a new Game (Games are immutable) and the old one stays private.
 */
export async function writePuzzle(
  tx: Tx, rows: PuzzleRows, opts: { day: string | null; source: PuzzleSource },
): Promise<WriteResult> {
  await tx`select pg_advisory_xact_lock(${WRITE_LOCK}, ${rows.number})`;
  await tx`insert into players (id) values (${SYSTEM_PLAYER_ID}) on conflict (id) do nothing`;
  await tx`
    insert into modules (id, player_id, name) values (${DAILY_MODULE_ID}, ${SYSTEM_PLAYER_ID}, ${DAILY_MODULE_NAME})
    on conflict (id) do nothing`;

  const [existing] = await tx<{ game_id: string; status: string; day: string | null }[]>`
    select game_id, status, to_char(day, 'YYYY-MM-DD') as day from daily_puzzles where number = ${rows.number}`;
  if (existing && existing.status === "live") {
    const outcome = existing.game_id === rows.game.game.id ? "unchanged" : "kept-live";
    return { number: rows.number, outcome, day: existing.day, status: existing.status };
  }

  await insertContent(tx, rows);
  // A day another puzzle already has (e.g. claimed from the pool) is left alone
  let day = opts.day;
  let note: string | undefined;
  if (day !== null) {
    const [taken] = await tx<{ number: number }[]>`select number from daily_puzzles where day = ${day} and number <> ${rows.number}`;
    if (taken) {
      note = `${day} already has Daily #${taken.number}; #${rows.number} goes to the pool`;
      day = null;
    }
  }
  const status = day === null ? "pool" : "scheduled";

  if (!existing) {
    await tx`
      insert into daily_puzzles (number, day, theme, title, game_id, prompt_ids, status, source)
      values (${rows.number}, ${day}, ${rows.theme}, ${rows.title}, ${rows.game.game.id}, ${rows.promptIds}::uuid[], ${status}, ${opts.source})`;
    return { number: rows.number, outcome: "created", day, status, note };
  }
  const changed = existing.game_id !== rows.game.game.id || existing.day !== day;
  if (!changed) return { number: rows.number, outcome: "unchanged", day, status, note };
  await tx`
    update daily_puzzles
       set day = ${day}, status = ${status}, theme = ${rows.theme}, title = ${rows.title},
           game_id = ${rows.game.game.id}, prompt_ids = ${rows.promptIds}::uuid[]
     where number = ${rows.number}`;
  return { number: rows.number, outcome: "updated", day, status, note };
}

/** The fact sheet and Game, unless they're already stored (ids come from the content). */
async function insertContent(tx: Tx, rows: PuzzleRows) {
  const [doc] = await tx`select 1 from source_documents where id = ${rows.document.id}`;
  if (!doc) {
    await tx`insert into source_documents ${tx(rows.document)}`;
    await tx`insert into source_pages ${tx(rows.pages)}`;
  }
  const [game] = await tx`select 1 from games where id = ${rows.game.game.id}`;
  if (!game) await insertGame(tx, rows.game, rows.document.id);
}

/** The next free puzzle number (for generated puzzles). Call inside the writing transaction. */
export async function nextPuzzleNumber(tx: Tx): Promise<number> {
  await tx`select pg_advisory_xact_lock(${WRITE_LOCK}, 0)`;
  const [{ n }] = await tx<{ n: number }[]>`select coalesce(max(number), 0)::int + 1 as n from daily_puzzles`;
  return n;
}
