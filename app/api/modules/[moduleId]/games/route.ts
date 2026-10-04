import { after } from "next/server";
import { getApiPlayer } from "@/lib/auth";
import { sql } from "@/lib/db";
import { isUuid } from "@/lib/documents/queries";
import { generateGame } from "@/lib/games/generate-game";
import { gameSelectById, listModuleGames } from "@/lib/games/queries";
import { isModeId } from "@/lib/modes";

// Generation runs in after(); give it room on platforms that honour maxDuration.
export const maxDuration = 300;

const MAX_TITLE = 120;
const MAX_FILES = 20;

async function ownsModule(playerId: string, moduleId: string) {
  if (!isUuid(moduleId)) return false;
  const [row] = await sql`select 1 from modules where id = ${moduleId} and player_id = ${playerId}`;
  return Boolean(row);
}

/** The Module's Games with their source files, newest first. Poll while any are queued/generating. */
export async function GET(_req: Request, ctx: RouteContext<"/api/modules/[moduleId]/games">) {
  const playerId = await getApiPlayer();
  if (!playerId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { moduleId } = await ctx.params;
  if (!(await ownsModule(playerId, moduleId))) return Response.json({ error: "Module not found" }, { status: 404 });
  return Response.json({ games: await listModuleGames(playerId, moduleId) });
}

/**
 * Create a Game: `{ title, mode?, sourceDocumentIds[] }`. `mode` is any available Mode in MODES
 * (dive, apogee, leap, pairs, blitz, arena; defaults to 'dive'; a Mode with `available: false` is a 400).
 * Every file must be this Module's and Ready. Responds 202 `{ game }` and generates in the
 * background with that Mode's generator.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/modules/[moduleId]/games">) {
  const playerId = await getApiPlayer();
  if (!playerId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { moduleId } = await ctx.params;
  if (!(await ownsModule(playerId, moduleId))) return Response.json({ error: "Module not found" }, { status: 404 });

  let body: { title?: unknown; mode?: unknown; sourceDocumentIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Send a JSON body" }, { status: 400 });
  }
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title || title.length > MAX_TITLE) {
    return Response.json({ error: `Give the Game a title (up to ${MAX_TITLE} characters)` }, { status: 400 });
  }
  const mode = body.mode ?? "dive";
  if (!isModeId(mode)) return Response.json({ error: "Unknown Game Mode" }, { status: 400 });
  const ids = body.sourceDocumentIds;
  if (!Array.isArray(ids) || !ids.length || !ids.every((id) => typeof id === "string" && isUuid(id))) {
    return Response.json({ error: "Choose at least one file" }, { status: 400 });
  }
  const documentIds = [...new Set(ids as string[])];
  if (documentIds.length > MAX_FILES) return Response.json({ error: `Choose at most ${MAX_FILES} files` }, { status: 400 });

  const docs = await sql<{ id: string; status: string }[]>`
    select id, status from source_documents
    where id in ${sql(documentIds)} and module_id = ${moduleId} and player_id = ${playerId}`;
  if (docs.length !== documentIds.length) return Response.json({ error: "Choose files from this Module" }, { status: 400 });
  if (docs.some((d) => d.status !== "parsed")) return Response.json({ error: "Only Ready files can be used" }, { status: 409 });

  const gameId = await sql.begin(async (tx) => {
    const [game] = await tx<{ id: string }[]>`
      insert into games (module_id, player_id, title, mode, status)
      values (${moduleId}, ${playerId}, ${title}, ${mode}, 'queued')
      returning id`;
    await tx`insert into game_sources ${tx(documentIds.map((id) => ({ game_id: game.id, source_document_id: id })))}`;
    return game.id;
  });

  after(() => generateGame(gameId));
  const [game] = await gameSelectById(gameId);
  return Response.json({ game }, { status: 202 });
}
