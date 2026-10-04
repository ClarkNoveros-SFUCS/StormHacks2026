import type { NextRequest } from "next/server";
import { parseLimit, parseScope, socialRoute } from "@/lib/social/http";
import { weeklyXp } from "@/lib/social/leaderboards";

/** XP earned this Vancouver week (Monday first). ?scope=global|friends&limit= → Leaderboard */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  return socialRoute((playerId) => weeklyXp(playerId, parseScope(params.get("scope")), parseLimit(params.get("limit"))));
}
