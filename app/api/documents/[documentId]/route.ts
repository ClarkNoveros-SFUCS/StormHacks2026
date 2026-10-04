import { getApiPlayer } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getPlayerDocument } from "@/lib/documents/queries";

type Ctx = { params: Promise<{ documentId: string }> };

/** One Source Document's status. */
export async function GET(_req: Request, { params }: Ctx) {
  const playerId = await getApiPlayer();
  if (!playerId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const document = await getPlayerDocument(playerId, (await params).documentId);
  if (!document) return Response.json({ error: "File not found" }, { status: 404 });
  return Response.json({ document });
}

/** Deletes a Source Document and its pages. 409 while any Game uses it. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const playerId = await getApiPlayer();
  if (!playerId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const document = await getPlayerDocument(playerId, (await params).documentId);
  if (!document) return Response.json({ error: "File not found" }, { status: 404 });

  const [{ games }] = await sql<{ games: number }[]>`
    select count(*)::int as games from game_sources where source_document_id = ${document.id}`;
  if (games > 0) {
    return Response.json(
      { error: `Used by ${games} Game${games === 1 ? "" : "s"}. Delete ${games === 1 ? "it" : "those Games"} first.`, games },
      { status: 409 },
    );
  }

  await sql`delete from source_documents where id = ${document.id} and player_id = ${playerId}`;
  return new Response(null, { status: 204 });
}
