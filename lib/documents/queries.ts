import "server-only";
import { sql } from "@/lib/db";

// Source Document rows as the API returns them. `stage_path` stays server-side.

export type SourceDocument = {
  id: string;
  module_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: "uploaded" | "parsing" | "parsed" | "failed";
  error: string | null;
  page_count: number | null;
  created_at: Date;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route params are untrusted; a malformed uuid would make Postgres throw a 500. */
export function isUuid(id: string) {
  return UUID.test(id);
}

export const documentColumns = sql`
  id, module_id, filename, mime_type, size_bytes, status, error, page_count, created_at`;

/** The Player's Source Document, or undefined (treat as 404). */
export async function getPlayerDocument(playerId: string, documentId: string) {
  if (!isUuid(documentId)) return undefined;
  const [doc] = await sql<SourceDocument[]>`
    select ${documentColumns} from source_documents
    where id = ${documentId} and player_id = ${playerId}`;
  return doc;
}
