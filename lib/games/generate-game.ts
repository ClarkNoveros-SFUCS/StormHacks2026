import "server-only";
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { sql } from "@/lib/db";
import { generateDocumentPrompts, GeminiError } from "@/lib/gemini";
import type { Db } from "@/lib/progress";
import { dedupeAcrossDocuments, validateDocument, type DocumentPage, type ValidPrompt } from "./validate";

// The Game generation pipeline (docs/architecture/game-generation-pipeline.md, steps a-f):
// one Gemini call per Source Document in parallel, code checks, then one transaction.
// Runs in `after()`, so it never throws: every failure ends with status 'failed' and a short
// message the Player can read. A failed Game is deleted and created again (Games are immutable).

export const MIN_PROMPTS = 7;
export const NOT_ENOUGH_CONTENT = "Not enough usable content to make a Game";

type Generate = (title: string, pages: DocumentPage[]) => Promise<{ response: unknown }>;

export type GenerateResult =
  | { status: "skipped" } // not 'queued': another call took it, or it was deleted
  | { status: "ready"; promptCount: number; dropped: number }
  | { status: "failed"; error: string };

class UserFacingError extends Error {}

/**
 * Generates a queued Game's Prompts. `db` and `generate` are seams for tests: pass a
 * transaction to roll everything back, and a fake instead of Gemini.
 */
export async function generateGame(
  gameId: string,
  { db = sql, generate = generateDocumentPrompts }: { db?: Db; generate?: Generate } = {},
): Promise<GenerateResult> {
  // a. Claim the Game atomically so two calls never generate it at once
  const [game] = await db<{ mode: string }[]>`
    update games set status = 'generating', error = null
    where id = ${gameId} and status = 'queued'
    returning mode`;
  if (!game) return { status: "skipped" };

  try {
    // Only Dive exists so far (ADR-0004); its generator is this file
    if (game.mode !== "dive") throw new UserFacingError("This Game Mode can't be generated yet");

    // b. Each selected document's pages, then one Gemini call per document, in parallel
    const docs = await db<{ id: string; filename: string }[]>`
      select d.id, d.filename from game_sources gs
      join source_documents d on d.id = gs.source_document_id
      where gs.game_id = ${gameId}
      order by d.created_at, d.id`;
    if (!docs.length) throw new UserFacingError("This Game has no files");
    const pageRows = await db<{ id: string; source_document_id: string; page_number: number; content_md: string }[]>`
      select id, source_document_id, page_number, content_md from source_pages
      where source_document_id in ${db(docs.map((d) => d.id))}
      order by source_document_id, page_index`;
    const pageId = new Map(pageRows.map((p) => [`${p.source_document_id}:${p.page_number}`, p.id]));

    const results = await Promise.all(
      docs.map(async (doc) => {
        const pages = pageRows
          .filter((p) => p.source_document_id === doc.id)
          .map((p) => ({ pageNumber: p.page_number, contentMd: p.content_md }));
        if (!pages.length) return { doc, prompts: [] as ValidPrompt[], dropped: 0 };
        const { response } = await generate(doc.filename, pages);
        // c. Checks 1-6 per document; Tiers for Open Prompts (d) are assigned inside
        const result = validateDocument(response, pages);
        return { doc, prompts: result.prompts, dropped: result.dropped.length };
      }),
    );
    // c. Check 7 across documents
    const { kept, dropped: duplicates } = dedupeAcrossDocuments(results);
    const dropped = results.reduce((n, r) => n + r.dropped, duplicates.length);
    console.log(`generateGame ${gameId}: ${kept.length} Prompts kept, ${dropped} items dropped`);

    // e. Too few Prompts for a Run
    if (kept.length < MIN_PROMPTS) throw new UserFacingError(NOT_ENOUGH_CONTENT);

    // f. One transaction: Prompts, Answers, answer_keys, then ready
    const rows = buildRows(gameId, kept, pageId);
    await transaction(db, async (tx) => {
      for (const p of rows.prompts) {
        await tx`
          insert into prompts (id, game_id, source_document_id, kind, text, tier, hint, explanation,
                               items, options, evidence_page_id)
          values (${p.id}, ${gameId}, ${p.source_document_id}, ${p.kind}, ${p.text}, ${p.tier}, ${p.hint},
                  ${p.explanation}, ${p.items && tx.json(p.items)}, ${p.options && tx.json(p.options)}, ${p.evidence_page_id})`;
      }
      await tx`insert into answers ${tx(rows.answers)}`;
      if (rows.keys.length) await tx`insert into answer_keys ${tx(rows.keys)}`;
      const [updated] = await tx`
        update games set status = 'ready', prompt_count = ${rows.prompts.length}, error = null
        where id = ${gameId} and status = 'generating'
        returning id`;
      if (!updated) throw new Error("the Game was deleted or changed while generating");
    });
    return { status: "ready", promptCount: rows.prompts.length, dropped };
  } catch (err) {
    // Log the error, never the document text
    const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : "";
    console.error(`generateGame ${gameId} failed: ${err instanceof Error ? err.message : err}${cause}`);
    const error =
      err instanceof UserFacingError
        ? err.message
        : err instanceof GeminiError
          ? "We couldn't reach the question generator. Delete this Game and try again"
          : "Something went wrong making this Game. Delete it and try again";
    await db`update games set status = 'failed', error = ${error} where id = ${gameId} and status = 'generating'`.catch((e) =>
      console.error(`generateGame ${gameId}: couldn't record failure:`, e),
    );
    return { status: "failed", error };
  }
}

/** A transaction, or a savepoint when already inside one (tests pass a transaction). */
function transaction<T>(db: Db, fn: (tx: postgres.TransactionSql) => Promise<T>) {
  return ("savepoint" in db ? db.savepoint(fn) : db.begin(fn)) as Promise<T>;
}

/** Rows for prompts, answers and answer_keys. Keys are already normalize()d by validate.ts. */
function buildRows(gameId: string, kept: { doc: { id: string }; prompt: ValidPrompt }[], pageIds: Map<string, string>) {
  const pageId = (docId: string, page: number) => {
    const id = pageIds.get(`${docId}:${page}`);
    if (!id) throw new Error(`no source_pages row for page ${page}`); // validate.ts checked it exists
    return id;
  };
  const prompts = [];
  const answers = [];
  const keys = [];
  for (const { doc, prompt: p } of kept) {
    const promptId = randomUUID();
    prompts.push({
      id: promptId,
      game_id: gameId,
      source_document_id: doc.id,
      kind: p.kind,
      text: p.text,
      tier: p.tier,
      hint: p.hint,
      explanation: p.explanation,
      items: p.items,
      options: p.options,
      evidence_page_id: p.evidencePage === null ? null : pageId(doc.id, p.evidencePage),
    });
    for (const a of p.answers) {
      const answerId = randomUUID();
      answers.push({
        id: answerId,
        prompt_id: promptId,
        canonical: a.canonical,
        tier: a.tier,
        rarity_rank: a.rarityRank,
        exact_only: a.exactOnly,
        evidence_page_id: pageId(doc.id, a.evidencePage),
        evidence_quote: a.evidenceQuote,
      });
      for (const normalized of a.keys) keys.push({ prompt_id: promptId, normalized, answer_id: answerId, exact_only: a.exactOnly });
    }
  }
  return { prompts, answers, keys };
}
