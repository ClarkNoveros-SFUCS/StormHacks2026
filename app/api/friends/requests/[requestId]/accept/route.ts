import { acceptFriendRequest } from "@/lib/social/friends";
import { socialRoute } from "@/lib/social/http";

/** Accepts a friend request sent to you. → 204; 404 if it isn't a pending request to you */
export async function POST(_req: Request, ctx: RouteContext<"/api/friends/requests/[requestId]/accept">) {
  const { requestId } = await ctx.params;
  return socialRoute(async (playerId) => {
    await acceptFriendRequest(playerId, requestId);
    return new Response(null, { status: 204 });
  });
}
