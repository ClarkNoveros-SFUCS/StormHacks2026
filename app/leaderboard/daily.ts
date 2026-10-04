// Daily Dive leaderboard adapter (F26). Client-safe.
//
// TODO(F23 #36): the Daily Dive backend doesn't exist yet. Once it does:
//   1. In `app/leaderboard/page.tsx`, resolve today's Daily Game id on the server (F23's
//      `getDailyGame(day)` or similar) and pass it as `daily.gameId`.
//   2. Nothing else: `fetchDailyBoard` already calls F21's
//      GET /api/leaderboards/games/[gameId]?day=YYYY-MM-DD&scope=…&counting=first
//      (one counted attempt per day = the first finished Run, decisions §7).
// Until then the Daily tab shows a friendly "arrives soon" state.
import { socialApi } from "@/components/social/api";
import type { Leaderboard, LeaderboardScope } from "@/lib/social/types";

export type DailyInfo = {
  /** Today's Daily Game, or null until F23 ships. */
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
