import { removeFriend } from "@/lib/social/friends";
import { socialRoute } from "@/lib/social/http";

/** Unfriends, or cancels/declines a pending request either way. → 204; 404 if there was nothing */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/friends/[username]">) {
  const { username } = await ctx.params;
  return socialRoute(async (playerId) => {
    await removeFriend(playerId, decodeURIComponent(username));
    return new Response(null, { status: 204 });
  });
}
