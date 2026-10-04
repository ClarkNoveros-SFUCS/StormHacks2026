import "server-only";
import type postgres from "postgres";
import { sql } from "@/lib/db";
import { createRun } from "@/lib/runs/run-engine";
import { computeStreak } from "@/lib/social/days";
import { gameLeaderboard } from "@/lib/social/leaderboards";
import type { LeaderboardScope } from "@/lib/social/types";
import { streakFor } from "@/lib/social/xp";
import { addDays, isDay, nextVancouverMidnight, vancouverDay } from "./days";
import { METRES_PER_POINT, shareText } from "./share";
import type {
  DailyArchiveEntry, DailyLeaderboardResponse, DailyResult, DailyRunResponse, DailyToday, ShareTiers,
} from "./types";

// The Daily Dive's reads and its one write (starting today's Run). Spec: daily-dive.md.
// Every function takes `now` (the server's clock; tests move it) and an optional db/transaction.

type Db = postgres.Sql | postgres.TransactionSql;
type Tx = postgres.TransactionSql;

export class DailyError extends Error {
  constructor(public status: 400 | 401 | 404 | 409, message: string) {
    super(message);
  }
}

export type DailyPuzzle = {
  number: number;
  day: string;
  theme: string;
  title: string;
  game_id: string;
  prompt_ids: string[];
};

async function livePuzzle(db: Db, day: string): Promise<DailyPuzzle | null> {
  const [p] = await db<DailyPuzzle[]>`
    select number, to_char(day, 'YYYY-MM-DD') as day, theme, title, game_id, prompt_ids
      from daily_puzzles where day = ${day} and status = 'live'`;
  return p ?? null;
}

/**
 * The live puzzle for `day`. Today's is claimed on first use if the midnight job hasn't run
 * (claim_daily_puzzle(): the scheduled puzzle, else the next one from the pool; race-safe).
 * Other days return only a puzzle that went live on its day. Null: no puzzle that day.
 */
export async function getDailyPuzzle(day: string, now = new Date(), db: Db = sql): Promise<DailyPuzzle | null> {
  if (!isDay(day)) throw new DailyError(400, "day must be YYYY-MM-DD");
  const found = await livePuzzle(db, day);
  if (found || day !== vancouverDay(now)) return found;
  await db`select claim_daily_puzzle(${day}::date)`;
  return livePuzzle(db, day);
}

/** Counted Runs so far on `day`, from the daily_score_stats continuous aggregate. */
async function playersOn(db: Db, day: string): Promise<number> {
  const [row] = await db<{ players: number }[]>`select players::int from daily_score_stats where day = ${day}`;
  return row?.players ?? 0;
}

type ResultRow = { run_id: string; score: number; finished_at: Date; tiers: ShareTiers };

function toResult(number: number, r: ResultRow): DailyResult {
  return {
    runId: r.run_id,
    score: r.score,
    depth: r.score * METRES_PER_POINT,
    finishedAt: r.finished_at.toISOString(),
    tiers: r.tiers,
    shareText: shareText({ number, score: r.score, tiers: r.tiers, counted: true }),
  };
}

/** Days in a row with a counted Daily Run (the same rule as the Streak, over Daily days only). */
async function dailyStreak(db: Db, playerId: string, today: string) {
  const rows = await db<{ day: string }[]>`
    select to_char(day, 'YYYY-MM-DD') as day from daily_results
     where player_id = ${playerId} and day <= ${today} and day > ${addDays(today, -400)}`;
  return computeStreak(rows.map((r) => r.day), today);
}

/** GET /api/daily/today. `playerId` null = signed out (the landing teaser): `me` is null. */
export async function dailyToday(playerId: string | null, now = new Date(), db: Db = sql): Promise<DailyToday | null> {
  const day = vancouverDay(now);
  const puzzle = await getDailyPuzzle(day, now, db);
  if (!puzzle) return null;
  const [[first], players] = await Promise.all([
    db<{ text: string }[]>`select text from prompts where id = ${puzzle.prompt_ids[0]}`,
    playersOn(db, day),
  ]);

  let me: DailyToday["me"] = null;
  if (playerId) {
    const [[result], [inProgress], streak, daily] = await Promise.all([
      db<ResultRow[]>`
        select run_id, score, finished_at, tiers from daily_results where player_id = ${playerId} and day = ${day}`,
      db<{ id: string }[]>`
        select id from runs where player_id = ${playerId} and game_id = ${puzzle.game_id} and status = 'in_progress'
         order by started_at desc limit 1`,
      streakFor(playerId, db, now),
      dailyStreak(db, playerId, day),
    ]);
    me = {
      status: result ? "counted" : inProgress ? "in_progress" : "not_played",
      runId: result?.run_id ?? inProgress?.id ?? null,
      result: result ? toResult(puzzle.number, result) : null,
      streak,
      dailyStreak: daily,
    };
  }
  return {
    number: puzzle.number,
    day,
    theme: puzzle.theme,
    title: puzzle.title,
    gameId: puzzle.game_id,
    teaser: first?.text ?? "",
    promptCount: puzzle.prompt_ids.length,
    players,
    nextAt: nextVancouverMidnight(now).toISOString(),
    serverNow: now.toISOString(),
    me,
  };
}

/**
 * POST /api/daily/today/run: resumes the Player's in-progress Run on today's puzzle, else
 * starts one (abandoning any other in-progress Run, like every new Run). The first Run of
 * the day to finish is the Counted Run; once that's in, new Runs are practice.
 */
export async function startTodayRun(tx: Tx, playerId: string, now = new Date()): Promise<DailyRunResponse> {
  const day = vancouverDay(now);
  const puzzle = await getDailyPuzzle(day, now, tx);
  if (!puzzle) throw new DailyError(404, "There's no Daily Dive today");
  const [[counted], [inProgress]] = await Promise.all([
    tx<{ run_id: string }[]>`select run_id from daily_results where player_id = ${playerId} and day = ${day}`,
    tx<{ id: string }[]>`
      select id from runs where player_id = ${playerId} and game_id = ${puzzle.game_id} and status = 'in_progress'
       order by started_at desc limit 1`,
  ]);
  const base = { counted: !counted, number: puzzle.number, day };
  if (inProgress) return { runId: inProgress.id, resumed: true, ...base };
  const { runId } = await createRun(tx, playerId, puzzle.game_id, now);
  return { runId, resumed: false, ...base };
}

/**
 * GET /api/daily/leaderboard: F21's gameLeaderboard on that day's puzzle with
 * counting "first" and the day filter, which is exactly each Player's Counted Run.
 */
export async function dailyLeaderboard(
  me: string | null, opts: { day?: string | null; scope?: LeaderboardScope; limit?: number } = {}, now = new Date(), db: Db = sql,
): Promise<DailyLeaderboardResponse | null> {
  const day = opts.day || vancouverDay(now);
  const puzzle = await getDailyPuzzle(day, now, db);
  if (!puzzle) return null;
  const leaderboard = await gameLeaderboard(
    me ?? "", puzzle.game_id, { scope: opts.scope ?? "global", day, counting: "first", limit: opts.limit ?? 50 }, db,
  );
  if (!leaderboard) return null;
  return { daily: { number: puzzle.number, day, title: puzzle.title, gameId: puzzle.game_id }, leaderboard };
}

/** GET /api/daily/archive: every puzzle that has gone live, newest first, with your results. */
export async function dailyArchive(
  playerId: string | null, opts: { limit?: number } = {}, now = new Date(), db: Db = sql,
): Promise<DailyArchiveEntry[]> {
  const today = vancouverDay(now);
  await getDailyPuzzle(today, now, db); // make sure today's is live
  const rows = await db<{ number: number; day: string; theme: string; title: string; game_id: string; players: number }[]>`
    select d.number, to_char(d.day, 'YYYY-MM-DD') as day, d.theme, d.title, d.game_id, coalesce(s.players, 0)::int as players
      from daily_puzzles d left join daily_score_stats s on s.day = d.day
     where d.status = 'live' and d.day <= ${today}
     order by d.day desc limit ${opts.limit ?? 60}`;
  if (rows.length === 0) return [];

  const counted = new Map<string, ResultRow>();
  const runs = new Map<string, { runs: number; best: number }>();
  if (playerId) {
    const days = rows.map((r) => r.day);
    const games = rows.map((r) => r.game_id);
    const [results, played] = await Promise.all([
      db<(ResultRow & { day: string })[]>`
        select to_char(day, 'YYYY-MM-DD') as day, run_id, score, finished_at, tiers from daily_results
         where player_id = ${playerId} and day = any(${days}::date[])`,
      db<{ game_id: string; runs: number; best: number }[]>`
        select game_id, count(*)::int as runs, max(score)::int as best from runs
         where player_id = ${playerId} and game_id = any(${games}::uuid[]) and status = 'finished'
         group by game_id`,
    ]);
    for (const r of results) counted.set(r.day, r);
    for (const r of played) runs.set(r.game_id, { runs: r.runs, best: r.best });
  }

  return rows.map((r) => {
    const c = counted.get(r.day);
    const played = runs.get(r.game_id);
    return {
      number: r.number,
      day: r.day,
      theme: r.theme,
      title: r.title,
      gameId: r.game_id,
      isToday: r.day === today,
      players: r.players,
      me: playerId
        ? {
            counted: c ? { score: c.score, depth: c.score * METRES_PER_POINT, finishedAt: c.finished_at.toISOString(), tiers: c.tiers } : null,
            bestScore: played?.best ?? null,
            runs: played?.runs ?? 0,
          }
        : null,
    };
  });
}
