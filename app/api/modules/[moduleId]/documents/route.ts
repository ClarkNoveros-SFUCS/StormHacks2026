import { after } from "next/server";
import { getApiPlayer } from "@/lib/auth";
import { sql } from "@/lib/db";
import { parseDocument } from "@/lib/documents/parse-document";
import { UserFacingError, validateUpload } from "@/lib/documents/parsed-pages";
import { documentColumns, isUuid, type SourceDocument } from "@/lib/documents/queries";

// Parsing runs in after(); give it room on platforms that honour maxDuration.
export const maxDuration = 300;

type Ctx = { params: Promise<{ moduleId: string }> };

async function ownsModule(playerId: string, moduleId: string) {
  if (!isUuid(moduleId)) return false;
  const [row] = await sql`select 1 from modules where id = ${moduleId} and player_id = ${playerId}`;
  return Boolean(row);
}

/** The Module's Source Documents, newest first. The Module page polls this while any are parsing. */
export async function GET(_req: Request, { params }: Ctx) {
  const playerId = await getApiPlayer();
  if (!playerId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { moduleId } = await params;
  if (!(await ownsModule(playerId, moduleId))) return Response.json({ error: "Module not found" }, { status: 404 });

  const documents = await sql<SourceDocument[]>`
    select ${documentColumns} from source_documents
    where module_id = ${moduleId} and player_id = ${playerId}
    order by created_at desc`;
  return Response.json({ documents });
}

/** Upload one file (multipart field `file`). Responds 202 and parses in the background. */
export async function POST(req: Request, { params }: Ctx) {
  const playerId = await getApiPlayer();
  if (!playerId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { moduleId } = await params;
  if (!(await ownsModule(playerId, moduleId))) return Response.json({ error: "Module not found" }, { status: 404 });

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return Response.json({ error: "Send the file as multipart form data" }, { status: 400 });
  }
  if (!(file instanceof File)) return Response.json({ error: "Choose a file to upload" }, { status: 400 });

  let mimeType: string;
  try {
    mimeType = validateUpload(file.name, file.type, file.size);
  } catch (err) {
    if (err instanceof UserFacingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const [document] = await sql<SourceDocument[]>`
    insert into source_documents (module_id, player_id, filename, mime_type, size_bytes, status)
    values (${moduleId}, ${playerId}, ${file.name}, ${mimeType}, ${file.size}, 'uploaded')
    returning ${documentColumns}`;

  after(() => parseDocument(document.id, bytes));
  return Response.json({ document }, { status: 202 });
}
