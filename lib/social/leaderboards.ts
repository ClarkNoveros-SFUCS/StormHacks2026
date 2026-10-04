import "server-only";
import { sql } from "@/lib/db";
import { addDays, isDay, vancouverDay } from "./days";
import { SocialError, UUID } from "./errors";
import { friendIdsOf } from "./friends";
import { playerSummaries, publicGame, SYSTEM_PLAYER_ID } from "./profile";
import type { Leaderboard, LeaderboardEntry, LeaderboardScope } from "./types";
import type { Db } from "./xp";

// Leaderboards: weekly XP (continuous aggregate), public Games (best or first counted Run),
// and Course Topic passes. Each has Global and Friends scopes (Friends = your friends + you).
// Every board returns the top `limit` plus the caller's own row even when it's outside.
// Places use rank(): equal values share a place.

type Ranked = { player_id: string; value: number; at: Date | null; place: number; rn: number; total: number };

async function toBoard(
  board: Leaderboard["board"], scope: LeaderboardScope, period: string | null,
  me: string, limit: number, rows: Ranked[], db: Db,
): Promise<Leaderboard> {
  const summaries = await playerSummaries(rows.map((r) => r.player_id), db);
  const toEntry = (r: Ranked): LeaderboardEntry | null => {
    const player = summaries.get(r.player_id);
    return player
      ? { place: r.place, player, value: r.value, at: r.at ? r.at.toISOString() : null, isMe: r.player_id === me }
      : null;
  };
  const entries = rows.filter((r) => r.rn <= limit).map(toEntry).filter((e): e is LeaderboardEntry => e !== null);
  const mine = rows.find((r) => r.player_id === me);
  return { board, scope, period, entries, me: mine ? toEntry(mine) : null, total: rows[0]?.total ?? 0 };
}

/** SQL fragment: restricts `col` to the scope (Friends = me + my friends). */
function inScope(db: Db, col: string, scope: LeaderboardScope, me: string) {
  return scope === "global"
    ? db`${db(col)} <> ${SYSTEM_PLAYER_ID}`
    : db`(${db(col)} = ${me} or ${db(col)} in ${friendIdsOf(db, me)})`;
}

/**
 * This week's XP (Vancouver week, Monday first), from the `player_xp_weekly` continuous
 * aggregate. Value = XP earned this week.
 */
export async function weeklyXp(
  me: string, scope: LeaderboardScope, limit = 50, db: Db = sql, now = new Date(),
): Promise<Leaderboard> {
  const rows = await db<Ranked[]>`
    with board as (
      select w.player_id, sum(w.xp)::int as value
      from player_xp_weekly w
      where w.week = time_bucket('7 days', ${now}::timestamptz, 'America/Vancouver')
        and ${inScope(db, "w.player_id", scope, me)}
      group by w.player_id
    ), ranked as (
      select player_id, value, null::timestamptz as at,
             rank() over (order by value desc)::int as place,
             row_number() over (order by value desc, player_id)::int as rn,
             count(*) over ()::int as total
      from board
    )
    select * from ranked where rn <= ${limit} or player_id = ${me} order by rn`;
  const [{ week }] = await db<{ week: string }[]>`
    select to_char(time_bucket('7 days', ${now}::timestamptz, 'America/Vancouver') at time zone 'America/Vancouver', 'YYYY-MM-DD') as week`;
  return toBoard("weekly-xp", scope, week, me, limit, rows, db);
}

export type GameBoardOptions = {
  scope?: LeaderboardScope;
  /** Only Runs finished on this Vancouver day (YYYY-MM-DD), e.g. today's Daily Dive. */
  day?: string | null;
  /**
   * Which Run counts per Player: "best" (highest score, earliest on a tie; default) or "first"
   * (the first Run finished, for the Daily Dive's one counted attempt per day).
   */
  counting?: "best" | "first";
  limit?: number;
};

/**
 * Leaderboard for a public Game: one counted Run per Player, score desc, then finish time asc.
 * Null if the Game doesn't exist or isn't public (Module Games are private; ADR-0005).
 */
export async function gameLeaderboard(
  me: string, gameId: string, opts: GameBoardOptions = {}, db: Db = sql,
): Promise<Leaderboard | null> {
  const { scope = "global", day = null, counting = "best", limit = 50 } = opts;
  if (!UUID.test(gameId)) return null;
  if (day !== null && !isDay(day)) throw new SocialError(400, "day must be YYYY-MM-DD");
  const [game] = await db`select 1 from games g where g.id = ${gameId} and ${publicGame(db)}`;
  if (!game) return null;

  const dayFilter = day === null
    ? db``
    : db`and r.finished_at >= (${day}::date::timestamp at time zone 'America/Vancouver')
         and r.finished_at < (${addDays(day, 1)}::date::timestamp at time zone 'America/Vancouver')`;
  const order = counting === "first" ? db`r.finished_at asc` : db`r.score desc, r.finished_at asc`;

  const rows = await db<Ranked[]>`
    with counted as (
      select distinct on (r.player_id) r.player_id, r.score as value, r.finished_at as at
      from runs r
      where r.game_id = ${gameId} and r.status = 'finished' and r.finished_at is not null
        ${dayFilter}
        and ${inScope(db, "r.player_id", scope, me)}
      order by r.player_id, ${order}
    ), ranked as (
      select player_id, value, at,
             rank() over (order by value desc, at asc)::int as place,
             row_number() over (order by value desc, at asc, player_id)::int as rn,
             count(*) over ()::int as total
      from counted
    )
    select * from ranked where rn <= ${limit} or player_id = ${me} order by rn`;
  return toBoard("game", scope, day, me, limit, rows, db);
}

/**
 * Course board: Topics passed (topic_passed XP events, ref '<course>:<n>'), all Courses or one.
 * Ties go to whoever reached that count first.
 */
export async function courseLeaderboard(
  me: string, opts: { scope?: LeaderboardScope; course?: string | null; limit?: number } = {}, db: Db = sql,
): Promise<Leaderboard> {
  const { scope = "global", course = null, limit = 50 } = opts;
  if (course !== null && !/^[a-z0-9-]{1,64}$/.test(course)) throw new SocialError(400, "Unknown course");
  const courseFilter = course === null ? db`` : db`and x.ref like ${course + ":%"}`;
  const rows = await db<Ranked[]>`
    with board as (
      select x.player_id, count(*)::int as value, max(x.at) as at
      from xp_events x
      where x.reason = 'topic_passed' ${courseFilter} and ${inScope(db, "x.player_id", scope, me)}
      group by x.player_id
    ), ranked as (
      select player_id, value, at,
             rank() over (order by value desc, at asc)::int as place,
             row_number() over (order by value desc, at asc, player_id)::int as rn,
             count(*) over ()::int as total
      from board
    )
    select * from ranked where rn <= ${limit} or player_id = ${me} order by rn`;
  return toBoard("course", scope, course, me, limit, rows, db);
}

/** Today in Vancouver, for callers that want "today's Daily". */
export function today(now = new Date()): string {
  return vancouverDay(now);
}
