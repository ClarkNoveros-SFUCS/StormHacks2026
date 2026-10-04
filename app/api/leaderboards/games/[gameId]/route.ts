import type { NextRequest } from "next/server";
import { parseLimit, parseScope, SocialError, socialRoute } from "@/lib/social/http";
import { gameLeaderboard } from "@/lib/social/leaderboards";

/**
 * A public Game's board (Daily Dive, Course Topic Games): one counted Run per Player, score
 * desc, then finish time asc. ?scope=global|friends&day=YYYY-MM-DD&counting=best|first&limit=
 * → Leaderboard; 404 if the Game isn't public.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/leaderboards/games/[gameId]">) {
  const { gameId } = await ctx.params;
  const params = req.nextUrl.searchParams;
  return socialRoute(async (playerId) => {
    const counting = params.get("counting") ?? "best";
    if (counting !== "best" && counting !== "first") throw new SocialError(400, "counting must be best or first");
    const board = await gameLeaderboard(playerId, gameId, {
      scope: parseScope(params.get("scope")),
      day: params.get("day") || null,
      counting,
      limit: parseLimit(params.get("limit")),
    });
    if (!board) throw new SocialError(404, "No public Game with that id");
    return board;
  });
}
