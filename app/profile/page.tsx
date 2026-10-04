import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { requirePlayer } from "@/lib/auth";
import { ensureProfile } from "@/lib/social/profile";

// /profile → your public profile at /u/[username] (decisions §6). ensureProfile gives you a
// username first if you've never had one.
export default async function MyProfileRedirect() {
  const playerId = await requirePlayer();
  const clerkUser = await currentUser().catch(() => null);
  const username = await ensureProfile(playerId, clerkUser ?? undefined);
  redirect(`/u/${username}`);
}
