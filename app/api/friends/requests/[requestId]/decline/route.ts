import { declineFriendRequest } from "@/lib/social/friends";
import { socialRoute } from "@/lib/social/http";

/** Declines a friend request sent to you (they can ask again). → 204; 404 if not found */
export async function POST(_req: Request, ctx: RouteContext<"/api/friends/requests/[requestId]/decline">) {
  const { requestId } = await ctx.params;
  return socialRoute(async (playerId) => {
    await declineFriendRequest(playerId, requestId);
    return new Response(null, { status: 204 });
  });
}
