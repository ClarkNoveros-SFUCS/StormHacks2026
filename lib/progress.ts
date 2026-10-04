import "server-only";
import type postgres from "postgres";
import { TIERS, type Tier } from "@/lib/scoring/tiers";
import { sql } from "./db";

// Progress is measured against yourself: Personal Best (highest finished Run on a Game) and
// Mastery (share of a Game's Answers ever found). Spec: docs/architecture/data-model.md.
// Every query filters by playerId. Answers are counted only through a Game the Player owns
// or a public Game (F22: Course practice Games, the Daily Dive), so someone else's private
// gameId reads as 0 of 0. On a public Game, Runs and guesses are still only the Player's own.

/** The shared client, or a transaction (F06's getReveal calls runProgress inside its own). */
export type Db = postgres.Sql | postgres.TransactionSql;

/** `pct` is a whole number 0–100, rounded down so 100 means every Answer was found. */
export type Mastery = { found: number; total: number; pct: number };

export type RecentRun = { runId: string; score: number; finishedAt: Date };

export type GameProgress = { personalBest: number; mastery: Mastery };

/** One day of guesses on a Game. `accuracy` is 0–1; `avgMsToCorrect` is null with no correct guess. */
export type DailyStat = {
  day: Date;
  guesses: number;
  correct: number;
  accuracy: number;
  avgMsToCorrect: number | null;
};

/** What the Reveal shows under the Run total. */
export type RunProgress = {
  score: number;
  /** Highest Run that finished before this one; null on the first finished Run. */
  previousBest: number | null;
  /** A tie isn't a new best, and neither is a first Run scoring 0. */
  isNewBest: boolean;
  /** Found before this Run started. */
  masteryBefore: Mastery;
  /** Found by the time this Run finished. */
  masteryAfter: Mastery;
};

function toMastery(found: number, total: number): Mastery {
  return { found, total, pct: total === 0 ? 0 : Math.floor((100 * found) / total) };
}

/** Highest finished Run score on the Game, 0 when there is none. Abandoned Runs never count. */
export async function personalBest(playerId: string, gameId: string): Promise<number> {
  const [row] = await sql<{ best: number }[]>`
    select coalesce(max(score), 0)::int as best
    from runs
    where player_id = ${playerId} and game_id = ${gameId} and status = 'finished'`;
  return row.best;
}

/** Share of the Game's Answers ever found, in any Run (abandoned ones included). */
export async function mastery(playerId: string, gameId: string): Promise<Mastery> {
  const [row] = await sql<{ found: number; total: number }[]>`
    select
      (select count(*)::int
         from answers a
         join prompts p on p.id = a.prompt_id
         join games g on g.id = p.game_id
        where g.id = ${gameId} and (g.player_id = ${playerId} or g.visibility = 'public')) as total,
      (select count(distinct ge.matched_answer_id)::int
         from guess_events ge
         join answers a on a.id = ge.matched_answer_id
         join prompts p on p.id = a.prompt_id and p.game_id = ge.game_id
         join games g on g.id = p.game_id and (g.player_id = ge.player_id or g.visibility = 'public')
        where ge.player_id = ${playerId} and ge.game_id = ${gameId} and ge.is_correct) as found`;
  return toMastery(row.found, row.total);
}

/** Found and total Answers per Tier, e.g. "deep 2/9 · rare 1/12". Every Tier is present. */
export async function masteryByTier(
  playerId: string,
  gameId: string,
): Promise<Record<Tier, { found: number; total: number }>> {
  const rows = await sql<{ tier: Tier; total: number; found: number }[]>`
    select a.tier, count(*)::int as total, count(f.answer_id)::int as found
    from answers a
    join prompts p on p.id = a.prompt_id
    join games g on g.id = p.game_id
    left join (
      select distinct matched_answer_id as answer_id
      from guess_events
      where player_id = ${playerId} and game_id = ${gameId} and is_correct
    ) f on f.answer_id = a.id
    where g.id = ${gameId} and (g.player_id = ${playerId} or g.visibility = 'public')
    group by a.tier`;
  const byTier = Object.fromEntries(TIERS.map((t) => [t, { found: 0, total: 0 }])) as Record<
    Tier,
    { found: number; total: number }
  >;
  for (const r of rows) byTier[r.tier] = { found: r.found, total: r.total };
  return byTier;
}

/** Finished Runs on the Game, newest first. Only finished Runs have a Reveal to link to. */
export async function recentRuns(playerId: string, gameId: string, limit = 10): Promise<RecentRun[]> {
  return sql<RecentRun[]>`
    select id as "runId", score, finished_at as "finishedAt"
    from runs
    where player_id = ${playerId} and game_id = ${gameId} and status = 'finished'
      and finished_at is not null
    order by finished_at desc
    limit ${limit}`;
}

/**
 * Personal Best and Mastery for many Games in one query (the Module page's Game cards).
 * Games the Player doesn't own are left out of the Map.
 */
export async function progressForGames(
  playerId: string,
  gameIds: string[],
): Promise<Map<string, GameProgress>> {
  if (gameIds.length === 0) return new Map();
  const rows = await sql<{ id: string; best: number; total: number; found: number }[]>`
    select g.id,
      (select coalesce(max(r.score), 0)::int
         from runs r
        where r.player_id = ${playerId} and r.game_id = g.id and r.status = 'finished') as best,
      (select count(*)::int
         from answers a join prompts p on p.id = a.prompt_id
        where p.game_id = g.id) as total,
      (select count(distinct ge.matched_answer_id)::int
         from guess_events ge
         join answers a on a.id = ge.matched_answer_id
         join prompts p on p.id = a.prompt_id and p.game_id = g.id
        where ge.player_id = ${playerId} and ge.game_id = g.id and ge.is_correct) as found
    from games g
    where (g.player_id = ${playerId} or g.visibility = 'public') and g.id in ${sql(gameIds)}`;
  return new Map(rows.map((r) => [r.id, { personalBest: r.best, mastery: toMastery(r.found, r.total) }]));
}

/**
 * The Reveal's "New Personal Best?" and Mastery before → after. Both are measured against
 * the Run's own start and finish times, so an old Reveal still shows what was true then.
 * Null unless the Run is the Player's and finished.
 */
export async function runProgress(playerId: string, runId: string, db: Db = sql): Promise<RunProgress | null> {
  // The time bounds stay in SQL: the final guess is written with the same timestamp as
  // finished_at, and a JS Date round trip would drop any microseconds and miss it.
  const [run] = await db<
    { score: number; previousBest: number | null; total: number; foundBefore: number; foundAfter: number }[]
  >`
    select r.score,
      (select max(o.score)::int
         from runs o
        where o.player_id = r.player_id and o.game_id = r.game_id and o.status = 'finished'
          and o.id <> r.id and o.finished_at < r.finished_at) as "previousBest",
      t.total, f.before as "foundBefore", f.after as "foundAfter"
    from runs r
    cross join lateral (
      select count(*)::int as total
      from answers a
      join prompts p on p.id = a.prompt_id
      join games g on g.id = p.game_id
      where g.id = r.game_id and (g.player_id = r.player_id or g.visibility = 'public')
    ) t
    cross join lateral (
      select (count(distinct ge.matched_answer_id) filter (where ge.created_at < r.started_at))::int as before,
             count(distinct ge.matched_answer_id)::int as after
      from guess_events ge
      join answers a on a.id = ge.matched_answer_id
      join prompts p on p.id = a.prompt_id and p.game_id = ge.game_id
      join games g on g.id = p.game_id and (g.player_id = ge.player_id or g.visibility = 'public')
      where ge.player_id = r.player_id and ge.game_id = r.game_id and ge.is_correct
        and ge.created_at <= r.finished_at
    ) f
    where r.id = ${runId} and r.player_id = ${playerId} and r.status = 'finished'
      and r.finished_at is not null`;
  if (!run) return null;

  return {
    score: run.score,
    previousBest: run.previousBest,
    isNewBest: run.score > (run.previousBest ?? 0),
    masteryBefore: toMastery(run.foundBefore, run.total),
    masteryAfter: toMastery(run.foundAfter, run.total),
  };
}

/**
 * Guesses, accuracy and speed per day over the last `days` days, oldest first, for the Game
 * page's chart. Reads the `player_game_daily` continuous aggregate (Vancouver days, real-time,
 * so a Run just played is included). Days with no guesses are left out. `day` is the instant
 * Vancouver's day starts (e.g. 07:00Z), so format it with timeZone "America/Vancouver".
 */
export async function dailyStats(playerId: string, gameId: string, days = 30): Promise<DailyStat[]> {
  const rows = await sql<{ day: Date; guesses: number; correct: number; avgMsToCorrect: number | null }[]>`
    select d.day, d.guesses::int, d.correct::int, round(d.avg_ms_to_correct)::int as "avgMsToCorrect"
    from player_game_daily d
    join games g on g.id = d.game_id and (g.player_id = d.player_id or g.visibility = 'public')
    where d.player_id = ${playerId} and d.game_id = ${gameId}
      and d.day >= now() - make_interval(days => ${Math.floor(days)})
    order by d.day`;
  return rows.map((r) => ({ ...r, accuracy: r.guesses === 0 ? 0 : r.correct / r.guesses }));
}
