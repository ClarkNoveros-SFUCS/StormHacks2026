import type { NextRequest } from "next/server";
import { searchPlayers } from "@/lib/social/friends";
import { parseLimit, socialRoute } from "@/lib/social/http";

/** ?q=<prefix of a username or display name>&limit= → { players: PlayerSearchResult[] } */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  return socialRoute(async (playerId) => ({
    players: await searchPlayers(playerId, params.get("q") ?? "", parseLimit(params.get("limit"), 20)),
  }));
}
