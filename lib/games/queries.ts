import "server-only";
import { sql } from "@/lib/db";
import { isUuid } from "@/lib/documents/queries";
import type { GameSummary } from "./types";

// Generation runs in after(); a restart or crash mid-way would leave a Game 'generating'
// forever. Anything still unfinished after this long is marked failed when it's next read.
const STALE_AFTER = "10 minutes";
export const STALE_ERROR = "Making this Game took too long. Delete it and try again";

const gameSelect = sql`
  select g.id, g.module_id, g.title, g.mode, g.status, g.error, g.prompt_count, g.created_at,
         coalesce(
           (select json_agg(json_build_object('id', d.id, 'filename', d.filename) order by d.filename, d.id)
              from game_sources gs join source_documents d on d.id = gs.source_document_id
             where gs.game_id = g.id),
           '[]'::json) as sources
  from games g`;

async function failStale(playerId: string) {
  await sql`
    update games set status = 'failed', error = ${STALE_ERROR}
    where player_id = ${playerId} and status in ('queued', 'generating')
      and created_at < now() - ${STALE_AFTER}::interval`;
}

/** The Player's Game, or undefined (treat as 404). */
export async function getPlayerGame(playerId: string, gameId: string) {
  if (!isUuid(gameId)) return undefined;
  await failStale(playerId);
  const [game] = await sql<GameSummary[]>`${gameSelect} where g.id = ${gameId} and g.player_id = ${playerId}`;
  return game;
}

/** A Module's Games, newest first. The Module page polls this while any are generating. */
export async function listModuleGames(playerId: string, moduleId: string) {
  await failStale(playerId);
  return sql<GameSummary[]>`
    ${gameSelect} where g.module_id = ${moduleId} and g.player_id = ${playerId}
    order by g.created_at desc, g.id`;
}

export const gameSelectById = (id: string) => sql<GameSummary[]>`${gameSelect} where g.id = ${id}`;
