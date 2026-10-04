import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getApiPlayer } from "@/lib/auth";
import { ensureProfile, profileCard } from "@/lib/social/profile";
import { navPlayerFrom, type NavState } from "./nav-types";

/**
 * The root layout's nav data. Uses getApiPlayer() (not Clerk's <Show>) so the dev bypass
 * (DEV_PLAYER_ID under `next dev`) renders the signed-in shell too. Never throws for app
 * errors: a database hiccup shows a signed-in nav without stats rather than breaking every
 * page. Next's own signals (dynamic rendering, redirects) are rethrown.
 */
export async function getNavState(): Promise<NavState> {
  let playerId: string | null = null;
  try {
    playerId = await getApiPlayer();
  } catch (e) {
    unstable_rethrow(e);
    console.error("nav: auth/player lookup failed", e);
    return { signedIn: false };
  }
  if (!playerId) return { signedIn: false };
  try {
    await ensureProfile(playerId);
    return { signedIn: true, player: navPlayerFrom(await profileCard(playerId)) };
  } catch (e) {
    unstable_rethrow(e);
    console.error("nav: profile summary failed", e);
    return { signedIn: true, player: null };
  }
}
