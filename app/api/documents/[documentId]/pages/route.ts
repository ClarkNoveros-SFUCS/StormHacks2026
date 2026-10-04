import { getApiPlayer } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getPlayerDocument } from "@/lib/documents/queries";

/**
 * The parsed text of one of the Player's Source Documents, page by page, for the file viewer.
 * Owner only: anyone else (or a malformed id) gets 404. A file that isn't parsed yet, or failed,
 * returns an empty `pages` list.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[documentId]/pages">) {
  const playerId = await getApiPlayer();
  if (!playerId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const document = await getPlayerDocument(playerId, (await ctx.params).documentId);
  if (!document) return Response.json({ error: "File not found" }, { status: 404 });

  const pages = await sql<{ pageNumber: number; contentMd: string }[]>`
    select page_number as "pageNumber", content_md as "contentMd"
    from source_pages
    where source_document_id = ${document.id}
    order by page_index`;
  return Response.json({
    document: { id: document.id, filename: document.filename, pageCount: document.page_count ?? pages.length },
    pages,
  });
}
