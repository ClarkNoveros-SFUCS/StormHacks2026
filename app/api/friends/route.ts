import { listFriends } from "@/lib/social/friends";
import { socialRoute } from "@/lib/social/http";

/** Friends and pending requests both ways. → FriendsList */
export async function GET() {
  return socialRoute((playerId) => listFriends(playerId));
}
