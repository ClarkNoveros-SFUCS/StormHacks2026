import { SocialError, socialRoute } from "@/lib/social/http";
import { profileFor } from "@/lib/social/profile";

/** Any Player's public Profile (no Module content). → { profile: PublicProfile }, 404 if unknown */
export async function GET(_req: Request, ctx: RouteContext<"/api/profiles/[username]">) {
  const { username } = await ctx.params;
  return socialRoute(async (playerId) => {
    const profile = await profileFor(playerId, decodeURIComponent(username));
    if (!profile) throw new SocialError(404, "No Player with that username");
    return { profile };
  });
}
