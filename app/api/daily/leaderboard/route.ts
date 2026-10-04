import { dailyRoute } from "@/lib/daily/http";
import { DailyError, dailyLeaderboard } from "@/lib/daily/queries";
import { parseLimit, parseScope } from "@/lib/social/http";

// A day's Daily Dive board: each Player's Counted Run, score desc then finish time asc.
// ?day=YYYY-MM-DD (default today) &scope=global|friends &limit=1..100. The global board works
// signed out (no `me` row); friends needs sign-in. → DailyLeaderboardResponse; 404 no puzzle.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return dailyRoute("optional", async (playerId) => {
    const scope = parseScope(q.get("scope"));
    if (scope === "friends" && !playerId) throw new DailyError(401, "Not signed in");
    return dailyLeaderboard(playerId, { day: q.get("day"), scope, limit: parseLimit(q.get("limit")) });
  }, "No Daily Dive that day");
}
