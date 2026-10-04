import { socialRoute } from "@/lib/social/http";
import { profileCard } from "@/lib/social/profile";

/** The signed-in Player's profile card: avatar, name, Level, XP, Rank, Badge count, Streak. → ProfileCard */
export async function GET() {
  return socialRoute((playerId) => profileCard(playerId));
}
