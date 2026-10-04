import "server-only";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sql } from "@/lib/db";
import { parseStagedFile, putFile, removeStagedFile, withSnowflake } from "@/lib/snowflake";
import { stageFilename, toParsedPages, UserFacingError } from "./parsed-pages";

// The upload pipeline (docs/architecture/upload-pipeline.md): file → Snowflake stage →
// AI_PARSE_DOCUMENT → source_pages. Runs in `after()`, so it never throws: every failure
// ends with status 'failed' and a short message the Player can read.

/** The stage folder for one Source Document: `<playerId>/<documentId>`. */
export function stagePrefix(playerId: string, documentId: string) {
  return `${playerId}/${documentId}`;
}

/**
 * Parses a Source Document. Pass `bytes` on first upload; omit them on retry to re-parse
 * the copy already on the stage.
 */
export async function parseDocument(documentId: string, bytes?: Uint8Array) {
  // Claim the document atomically so two runs never parse the same file at once.
  const [doc] = await sql<{ player_id: string; filename: string; stage_path: string | null }[]>`
    update source_documents set status = 'parsing', error = null
    where id = ${documentId} and status in ('uploaded', 'failed')
    returning player_id, filename, stage_path`;
  if (!doc) return;

  let tmpDir: string | undefined;
  try {
    await withSnowflake(async (conn) => {
      let stagePath = doc.stage_path;

      if (bytes) {
        const name = stageFilename(doc.filename);
        tmpDir = await mkdtemp(path.join(os.tmpdir(), "upload-"));
        const tmpPath = path.join(tmpDir, name);
        await writeFile(tmpPath, bytes);
        const prefix = stagePrefix(doc.player_id, documentId);
        await putFile(conn, tmpPath, prefix);
        stagePath = `${prefix}/${name}`;
        await sql`update source_documents set stage_path = ${stagePath} where id = ${documentId}`;
      }
      if (!stagePath) throw new UserFacingError("The upload didn't finish. Delete this file and upload it again");

      const pages = toParsedPages(await parseStagedFile(conn, stagePath));

      await sql.begin(async (tx) => {
        await tx`delete from source_pages where source_document_id = ${documentId}`;
        await tx`
          insert into source_pages ${tx(
            pages.map((p) => ({
              source_document_id: documentId,
              page_index: p.pageIndex,
              page_number: p.pageNumber,
              content_md: p.contentMd,
            })),
          )}`;
        await tx`
          update source_documents set status = 'parsed', page_count = ${pages.length}, error = null
          where id = ${documentId}`;
      });
    });
  } catch (err) {
    // Log the error, never the document text or credentials.
    console.error(`parseDocument ${documentId} failed:`, err instanceof Error ? err.message : err);
    const message = err instanceof UserFacingError ? err.message : "We couldn't read this file. Try again";
    await sql`update source_documents set status = 'failed', error = ${message} where id = ${documentId}`.catch(
      (e) => console.error(`parseDocument ${documentId}: couldn't record failure:`, e),
    );
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  }
}

/** Removes a Source Document's folder from the stage. Used by DELETE. */
export async function removeFromStage(playerId: string, documentId: string) {
  await withSnowflake((conn) => removeStagedFile(conn, stagePrefix(playerId, documentId)));
}
