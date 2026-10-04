import { dailyRoute } from "@/lib/daily/http";
import { dailyArchive } from "@/lib/daily/queries";
import { parseLimit } from "@/lib/social/http";

// Every Daily that has gone live, newest first (today included, `isToday`), with your
// counted result and best score. Past days play as practice via POST /api/games/[gameId]/runs.
// ?limit=1..100 (default 60). Works signed out (`me` is null). → { days: DailyArchiveEntry[] }
export async function GET(req: Request) {
  const limit = new URL(req.url).searchParams.get("limit");
  return dailyRoute("optional", async (playerId) => ({ days: await dailyArchive(playerId, { limit: parseLimit(limit, 60) }) }));
}
