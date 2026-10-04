// Daily Dive leaderboard adapter (F26). Client-safe.
//
// `app/leaderboard/page.tsx` resolves today's Daily Game on the server (F23's getDailyPuzzle,
// wired in F28) and passes it as `daily.gameId`. `fetchDailyBoard` calls F21's
// GET /api/leaderboards/games/[gameId]?day=YYYY-MM-DD&scope=…&counting=first (one counted
// attempt per day = the first finished Run, decisions §7). With no puzzle today (gameId null)
// the Daily tab shows a friendly "arrives soon" state.
import { socialApi } from "@/components/social/api";
import type { Leaderboard, LeaderboardScope } from "@/lib/social/types";

export type DailyInfo = {
  /** Today's Daily Game, or null when there's no puzzle today. */
  gameId: string | null;
  /** Vancouver day, YYYY-MM-DD. */
  day: string;
  /** Daily #N (Daily #1 = 2026-10-04). */
  number: number;
};

export type DailyBoard = { status: "soon" } | { status: "ready"; board: Leaderboard };

export async function fetchDailyBoard(daily: DailyInfo, scope: LeaderboardScope): Promise<DailyBoard> {
  if (!daily.gameId) return { status: "soon" };
  const board = await socialApi.game(daily.gameId, { scope, day: daily.day, counting: "first" });
  return { status: "ready", board };
}
