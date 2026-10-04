import { getApiPlayer } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getPlayerDocument } from "@/lib/documents/queries";
import { writePageNotes } from "@/lib/gemini/notes";

// Gemini can take a while on a cold page; the stored notes come back at once after that.
export const maxDuration = 120;

/** Pages being written right now, so a double click or two tabs make one Gemini call. */
const inFlight = new Map<string, Promise<string>>();

/**
 * Tidy study notes for one page of the Player's Source Document (#75): `{ notesMd }`. Written
 * by Gemini on first request and stored in `source_pages.notes_md`. Owner only (404 otherwise).
 * 502 when Gemini fails; the viewer keeps showing the raw parsed text.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[documentId]/pages/[pageNumber]/notes">) {
  const playerId = await getApiPlayer();
  if (!playerId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { documentId, pageNumber } = await ctx.params;
  const document = await getPlayerDocument(playerId, documentId);
  const n = Number(pageNumber);
  if (!document || !Number.isInteger(n) || n < 1) return Response.json({ error: "Page not found" }, { status: 404 });

  const [page] = await sql<{ id: string; contentMd: string; notesMd: string | null }[]>`
    select id, content_md as "contentMd", notes_md as "notesMd"
    from source_pages
    where source_document_id = ${document.id} and page_number = ${n}`;
  if (!page) return Response.json({ error: "Page not found" }, { status: 404 });
  if (page.notesMd !== null) return Response.json({ notesMd: page.notesMd });

  let job = inFlight.get(page.id);
  if (!job) {
    job = writePageNotes(document.filename, { pageNumber: n, contentMd: page.contentMd })
      .then(async (md) => {
        await sql`update source_pages set notes_md = ${md} where id = ${page.id}`;
        return md;
      })
      .finally(() => inFlight.delete(page.id));
    inFlight.set(page.id, job);
  }
  try {
    return Response.json({ notesMd: await job });
  } catch (e) {
    console.error(`page notes ${document.id} p.${n} failed: ${e instanceof Error ? e.message : e}`);
    return Response.json({ error: "Couldn't tidy this page right now" }, { status: 502 });
  }
}
