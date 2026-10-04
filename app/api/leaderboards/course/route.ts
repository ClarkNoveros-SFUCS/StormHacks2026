import type { NextRequest } from "next/server";
import { parseLimit, parseScope, socialRoute } from "@/lib/social/http";
import { courseLeaderboard } from "@/lib/social/leaderboards";

/** Topics passed, all Courses or ?course=<slug>. ?scope=global|friends&limit= → Leaderboard */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  return socialRoute((playerId) =>
    courseLeaderboard(playerId, {
      scope: parseScope(params.get("scope")),
      course: params.get("course") || null,
      limit: parseLimit(params.get("limit")),
    }),
  );
}
