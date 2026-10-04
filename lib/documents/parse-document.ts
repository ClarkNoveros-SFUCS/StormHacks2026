import "server-only";
import { sql } from "@/lib/db";
import { extractPages } from "./extract";
import { toParsedPages, UserFacingError } from "./parsed-pages";

// The upload pipeline (docs/architecture/upload-pipeline.md): file bytes → Node
// extraction (ADR-0003) → source_pages. Runs in `after()`, so it never throws: every
// failure ends with status 'failed' and a short message the Player can read.
// The bytes aren't kept; a failed file is deleted and uploaded again.

export async function parseDocument(documentId: string, bytes: Uint8Array) {
  // Claim the document atomically so two runs never parse the same file at once.
  const [doc] = await sql<{ mime_type: string }[]>`
    update source_documents set status = 'parsing', error = null
    where id = ${documentId} and status = 'uploaded'
    returning mime_type`;
  if (!doc) return;

  try {
    const pages = toParsedPages(await extractPages(bytes, doc.mime_type));

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
  } catch (err) {
    // Log the error, never the document text.
    const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : "";
    console.error(`parseDocument ${documentId} failed: ${err instanceof Error ? err.message : err}${cause}`);
    const message = err instanceof UserFacingError ? err.message : "We couldn't read this file. Delete it and upload it again";
    await sql`update source_documents set status = 'failed', error = ${message} where id = ${documentId}`.catch(
      (e) => console.error(`parseDocument ${documentId}: couldn't record failure:`, e),
    );
  }
}
