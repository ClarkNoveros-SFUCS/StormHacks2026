import { after } from "next/server";
import { getApiPlayer } from "@/lib/auth";
import { parseDocument } from "@/lib/documents/parse-document";
import { getPlayerDocument } from "@/lib/documents/queries";

export const maxDuration = 300;

type Ctx = { params: Promise<{ documentId: string }> };

/** Re-parses a failed Source Document from the copy already on the stage. */
export async function POST(_req: Request, { params }: Ctx) {
  const playerId = await getApiPlayer();
  if (!playerId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const document = await getPlayerDocument(playerId, (await params).documentId);
  if (!document) return Response.json({ error: "File not found" }, { status: 404 });
  if (document.status !== "failed") {
    return Response.json({ error: "Only a failed file can be retried" }, { status: 409 });
  }

  after(() => parseDocument(document.id));
  return Response.json({ document }, { status: 202 });
}
