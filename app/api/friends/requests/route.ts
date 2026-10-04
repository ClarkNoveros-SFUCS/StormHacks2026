import { sendFriendRequest } from "@/lib/social/friends";
import { SocialError, socialRoute } from "@/lib/social/http";

/**
 * Body: { username }. Sends a friend request, or accepts theirs if they'd already asked you.
 * → 201 { status: "pending" | "accepted", requestId }; 404 unknown username, 400 yourself,
 * 409 already friends.
 */
export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => undefined);
  return socialRoute(async (playerId) => {
    const username = (body as { username?: unknown } | undefined)?.username;
    if (typeof username !== "string" || username.trim() === "") throw new SocialError(400, "username is required");
    return Response.json(await sendFriendRequest(playerId, username), { status: 201 });
  });
}
