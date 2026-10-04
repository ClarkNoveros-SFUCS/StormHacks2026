import "server-only";
import { sql } from "@/lib/db";
import { documentColumns, isUuid } from "@/lib/documents/queries";
import { progressForGames } from "@/lib/progress";
import type { ModeId } from "@/lib/modes";
import { sortModes } from "./mode-words";
import type { CardProgress, DocRow, ModuleCardData } from "./types";

// Reads for the Modules pages. Every query filters by playerId.

/** The Player's Modules with counts, Modes and best result; most recently active first. */
export async function listModules(playerId: string): Promise<ModuleCardData[]> {
  const rows = await sql<
    {
      id: string;
      name: string;
      created_at: Date;
      file_count: number;
      game_count: number;
      modes: ModeId[];
      last_played: Date | null;
      best: { score: number; mode: ModeId; title: string } | null;
    }[]
  >`
    select m.id, m.name, m.created_at,
      (select count(*)::int from source_documents d where d.module_id = m.id) as file_count,
      (select count(*)::int from games g where g.module_id = m.id) as game_count,
      (select coalesce(json_agg(distinct g.mode), '[]'::json) from games g where g.module_id = m.id) as modes,
      lp.last_played,
      (select json_build_object('score', r.score, 'mode', g.mode, 'title', g.title)
         from runs r join games g on g.id = r.game_id
        where g.module_id = m.id and r.player_id = ${playerId} and r.status = 'finished'
        order by r.score desc, r.finished_at asc
        limit 1) as best
    from modules m
    left join lateral (
      select max(r.finished_at) as last_played
        from runs r join games g on g.id = r.game_id
       where g.module_id = m.id and r.player_id = ${playerId} and r.status = 'finished'
    ) lp on true
    where m.player_id = ${playerId}
    order by greatest(m.created_at, coalesce(lp.last_played, m.created_at)) desc, m.id`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    fileCount: r.file_count,
    gameCount: r.game_count,
    modes: sortModes(r.modes),
    best: r.best && r.best.score > 0 ? r.best : null,
    lastPlayed: r.last_played ? r.last_played.toISOString() : null,
    createdAt: r.created_at.toISOString(),
  }));
}

/** The Player's Module, or undefined (treat as 404). */
export async function getModule(playerId: string, moduleId: string) {
  if (!isUuid(moduleId)) return undefined;
  const [m] = await sql<{ id: string; name: string }[]>`
    select id, name from modules where id = ${moduleId} and player_id = ${playerId}`;
  return m;
}

/** The Module's Source Documents, newest first (same shape as the documents API). */
export async function listModuleDocuments(playerId: string, moduleId: string): Promise<DocRow[]> {
  const rows = await sql<DocRow[]>`
    select ${documentColumns} from source_documents
    where module_id = ${moduleId} and player_id = ${playerId}
    order by created_at desc`;
  return rows.map((r) => ({
    ...r,
    created_at: new Date(r.created_at).toISOString(),
  }));
}

/** Personal Best, Mastery and finished-Run count for each Game card. */
export async function cardProgress(playerId: string, gameIds: string[]): Promise<Record<string, CardProgress>> {
  if (gameIds.length === 0) return {};
  const [progress, runs] = await Promise.all([
    progressForGames(playerId, gameIds),
    sql<{ game_id: string; runs: number }[]>`
      select game_id, count(*)::int as runs from runs
      where player_id = ${playerId} and status = 'finished' and game_id in ${sql(gameIds)}
      group by game_id`,
  ]);
  const runsBy = new Map(runs.map((r) => [r.game_id, r.runs]));
  const out: Record<string, CardProgress> = {};
  for (const id of gameIds) {
    const p = progress.get(id);
    out[id] = {
      personalBest: p?.personalBest ?? 0,
      masteryPct: p?.mastery.pct ?? 0,
      runs: runsBy.get(id) ?? 0,
    };
  }
  return out;
}

/** The Module a Source Document belongs to (for Evidence deep links that only know the file). */
export async function documentModule(playerId: string, documentId: string): Promise<string | undefined> {
  if (!isUuid(documentId)) return undefined;
  const [row] = await sql<{ module_id: string }[]>`
    select module_id from source_documents where id = ${documentId} and player_id = ${playerId}`;
  return row?.module_id;
}
