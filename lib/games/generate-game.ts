import "server-only";
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { sql } from "@/lib/db";
import { generateDocumentPrompts, GeminiError } from "@/lib/gemini";
import { geminiVerifyCall, verificationEnabled } from "@/lib/gemini/verify";
import {
  generateSplit, generationPlan, overgenerateEnabled, splitEnabled, type GeneratedPrompt, type GenerationRequest,
} from "@/lib/modes/generation";
import { generatorFor } from "@/lib/modes/generators";
import type { Db } from "@/lib/progress";
import { dedupeAcrossDocuments, type DocumentPage, type Drop } from "./validate";
import { verifyDocument, type VerifyStatus } from "./verify";

// The Game generation pipeline (docs/architecture/game-generation-pipeline.md, steps a-f):
// one Gemini call per Source Document in parallel (F30, GEMINI_SPLIT: several per document,
// joined), code checks, a verification call per
// document (F16, lib/games/verify.ts; GEMINI_VERIFY=off skips it), with GEMINI_OVERGENERATE on
// the best 15-20 per document (F17, lib/games/select.ts), then one transaction. The
// Game's Mode picks the Gemini request, the checks and the minimum (lib/modes/<mode>/generate.ts).
// Runs in `after()`, so it never throws: every failure ends with status 'failed' and a short
// message the Player can read. A failed Game is deleted and created again (Games are immutable).

/** Dive's minimum; every Mode has its own (MODES[mode].minPrompts). */
export const MIN_PROMPTS = 7;
export { NOT_ENOUGH_CONTENT } from "@/lib/modes/generation";

type Generate = (title: string, pages: DocumentPage[], request: GenerationRequest) => Promise<{ response: unknown }>;
/** The verification pass for one document's checked Prompts. Never throws. */
export type Verify = (
  title: string,
  pages: DocumentPage[],
  prompts: GeneratedPrompt[],
) => Promise<{ prompts: GeneratedPrompt[]; dropped: Drop[]; /** per kept Prompt, when the pass ran */ statuses?: VerifyStatus[] }>;

/**
 * The real verification pass: one Gemini call per document. A failed call keeps the
 * unverified Prompts and logs why; it never fails the Game. Off when GEMINI_VERIFY=off.
 */
export const verifyWithGemini: Verify = async (title, pages, prompts) => {
  if (!verificationEnabled()) return { prompts, dropped: [] };
  const out = await verifyDocument(title, pages, prompts, geminiVerifyCall);
  if (out.status === "failed") {
    console.warn(`verify: kept ${prompts.length} unverified Prompts after ${out.seconds.toFixed(0)} s: ${out.error}`);
  } else if (out.status === "verified") {
    console.log(
      `verify: ${out.model} ${out.seconds.toFixed(0)} s, removed ${out.promptsRemoved}/${prompts.length} Prompts and ${out.answersRemoved} Answers` +
        (out.unverified ? `, ${out.unverified} without a verdict` : ""),
    );
  }
  return out;
};
const noVerify: Verify = async (title, pages, prompts) => ({ prompts, dropped: [] });

export type GenerateResult =
  | { status: "skipped" } // not 'queued': another call took it, or it was deleted
  | { status: "ready"; promptCount: number; dropped: number }
  | { status: "failed"; error: string };

class UserFacingError extends Error {}

/**
 * Generates a queued Game's Prompts. `db`, `generate` and `verify` are seams for tests: pass a
 * transaction to roll everything back, and fakes instead of Gemini. With a fake `generate` and
 * no `verify`, the verification pass is skipped, so tests never call Gemini. `overgenerate`
 * overrides GEMINI_OVERGENERATE (F17; only Modes with an `overgenerate` hook use it). `split`
 * overrides GEMINI_SPLIT (F30; Modes with `split` hooks); with a fake `generate` it defaults to
 * off, so a fake is called once per document.
 */
export async function generateGame(
  gameId: string,
  {
    db = sql,
    generate = generateDocumentPrompts,
    verify,
    overgenerate = overgenerateEnabled(),
    split = generate === generateDocumentPrompts && splitEnabled(),
  }: { db?: Db; generate?: Generate; verify?: Verify; overgenerate?: boolean; split?: boolean } = {},
): Promise<GenerateResult> {
  const verifyPass = verify ?? (generate === generateDocumentPrompts ? verifyWithGemini : noVerify);
  // a. Claim the Game atomically so two calls never generate it at once
  const [game] = await db<{ mode: string }[]>`
    update games set status = 'generating', error = null
    where id = ${gameId} and status = 'queued'
    returning mode`;
  if (!game) return { status: "skipped" };

  try {
    const generator = generatorFor(game.mode);
    if (!generator) throw new UserFacingError("This Game Mode can't be generated yet");
    // F17: ask for ~25 Prompts and keep the best 15-20 per document. F30: the Mode's parallel calls
    const { requests, select } = generationPlan(generator, { overgenerate, split });

    // b. Each selected document's pages, then its Gemini call(s), every document in parallel
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
        if (!pages.length) return { doc, prompts: [] as GeneratedPrompt[], dropped: 0 };
        const { response, failed } = await generateSplit(requests, (request) => generate(doc.filename, pages, request));
        for (const err of failed) console.warn(`generateGame ${gameId}: one of ${requests.length} calls failed, keeping the others' Prompts: ${err instanceof Error ? err.message : err}`);
        // c. The Mode's per-document checks (Dive: 1-6, and Tiers for Open Prompts, step d),
        //    then the verification pass (F16), which re-runs check 4 and Tiers on what it changes,
        //    then (F17, overgenerating) the best 15-20 of what's left
        const result = generator.validate(response, pages);
        const verified = await verifyPass(doc.filename, pages, result.prompts);
        const selected = select ? select(verified.prompts, verified.statuses) : { prompts: verified.prompts, dropped: [] };
        if (select) console.log(`select: kept ${selected.prompts.length} of ${verified.prompts.length} Prompts`);
        return { doc, prompts: selected.prompts, dropped: result.dropped.length + verified.dropped.length + selected.dropped.length };
      }),
    );
    // c. Check 7 across documents, then the Mode's Game-level checks (Pairs: one per term;
    //    Blitz: true/false balance)
    const deduped = dedupeAcrossDocuments(results);
    const { kept, dropped: gameLevel } = generator.finalize(deduped.kept);
    const dropped = results.reduce((n, r) => n + r.dropped, deduped.dropped.length + gameLevel.length);
    console.log(`generateGame ${gameId}: ${kept.length} Prompts kept, ${dropped} items dropped`);

    // e. Too few Prompts for a Run of this Mode
    if (kept.length < generator.minPrompts) throw new UserFacingError(generator.notEnough(kept.length));

    // f. One transaction: Prompts, Answers, answer_keys, then ready
    const rows = buildRows(gameId, kept, pageId);
    await transaction(db, async (tx) => {
      for (const p of rows.prompts) {
        await tx`
          insert into prompts (id, game_id, source_document_id, kind, text, tier, hint, explanation,
                               items, options, evidence_page_id, is_true)
          values (${p.id}, ${gameId}, ${p.source_document_id}, ${p.kind}, ${p.text}, ${p.tier}, ${p.hint},
                  ${p.explanation}, ${p.items && tx.json(p.items)}, ${p.options && tx.json(p.options)}, ${p.evidence_page_id},
                  ${p.is_true})`;
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
function buildRows(gameId: string, kept: { doc: { id: string }; prompt: GeneratedPrompt }[], pageIds: Map<string, string>) {
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
      is_true: p.isTrue,
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
