import "server-only";
import { sql } from "@/lib/db";
import { progressForGames, type Mastery } from "@/lib/progress";

// Data for the /home dashboard that isn't social (F21 covers that in lib/social).

export type HomeGame = {
  id: string;
  title: string;
  mode: string;
  moduleId: string;
  moduleName: string;
  /** Last Run start, or null for a ready Game never played. */
  lastPlayedAt: string | null;
  finishedRuns: number;
  /** A Run still in progress, to resume. */
  inProgressRunId: string | null;
  personalBest: number;
  mastery: Mastery;
};

type Row = {
  id: string;
  title: string;
  mode: string;
  moduleId: string;
  moduleName: string;
  lastPlayedAt: Date | null;
  finishedRuns: number;
  inProgressRunId: string | null;
};

/**
 * The Player's most recently played Games (newest first), topped up with ready Games they
 * haven't played yet, with Personal Best and Mastery. Only the Player's own Games.
 */
export async function recentGames(playerId: string, limit = 5): Promise<HomeGame[]> {
  const played = await sql<Row[]>`
    select g.id, g.title, g.mode, g.module_id as "moduleId", m.name as "moduleName",
           max(r.started_at) as "lastPlayedAt",
           (count(*) filter (where r.status = 'finished'))::int as "finishedRuns",
           (array_agg(r.id order by r.started_at desc) filter (where r.status = 'in_progress'))[1] as "inProgressRunId"
    from runs r
    join games g on g.id = r.game_id and g.player_id = r.player_id
    join modules m on m.id = g.module_id
    where r.player_id = ${playerId}
    group by g.id, m.id
    order by max(r.started_at) desc
    limit ${limit}`;
  let rows: Row[] = [...played];
  if (rows.length < limit) {
    const fresh = await sql<Row[]>`
      select g.id, g.title, g.mode, g.module_id as "moduleId", m.name as "moduleName",
             null::timestamptz as "lastPlayedAt", 0 as "finishedRuns", null::uuid as "inProgressRunId"
      from games g join modules m on m.id = g.module_id
      where g.player_id = ${playerId} and g.status = 'ready'
        and not exists (select 1 from runs r where r.game_id = g.id and r.player_id = ${playerId})
      order by g.created_at desc
      limit ${limit - rows.length}`;
    rows = [...rows, ...fresh];
  }
  const progress = await progressForGames(playerId, rows.map((r) => r.id));
  return rows.map((r) => ({
    ...r,
    lastPlayedAt: r.lastPlayedAt ? r.lastPlayedAt.toISOString() : null,
    personalBest: progress.get(r.id)?.personalBest ?? 0,
    mastery: progress.get(r.id)?.mastery ?? { found: 0, total: 0, pct: 0 },
  }));
}

/** For the avatar picker: whether the Player shows their Clerk photo, and that photo. */
export async function photoSettings(playerId: string): Promise<{ usePhoto: boolean; clerkImageUrl: string | null }> {
  const [row] = await sql<{ use_photo: boolean; image_url: string | null }[]>`
    select use_photo, image_url from players where id = ${playerId}`;
  return { usePhoto: row?.use_photo ?? false, clerkImageUrl: row?.image_url ?? null };
}

export async function moduleCount(playerId: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from modules where player_id = ${playerId}`;
  return row.n;
}
