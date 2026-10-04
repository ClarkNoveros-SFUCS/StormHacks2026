import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { SocialBackdrop } from "@/components/social/SocialBackdrop";
import { requirePlayer } from "@/lib/auth";
import { listFriends } from "@/lib/social/friends";
import { ensureProfile } from "@/lib/social/profile";
import { friendStreaks, serverNow } from "./data";
import { FriendsClient, type FriendsTab } from "./FriendsClient";

export const metadata: Metadata = { title: "Friends · SYLLABYSS" };

const TABS: FriendsTab[] = ["friends", "requests", "find"];

// Friends (F26 #39, decisions §6): your friends, incoming and outgoing requests, and a username
// search. No chat. Data from lib/social (F21); actions go through the /api/friends routes.
export default async function FriendsPage({ searchParams }: PageProps<"/friends">) {
  const playerId = await requirePlayer();
  const clerkUser = await currentUser().catch(() => null);
  await ensureProfile(playerId, clerkUser ?? undefined);

  const [list, streaks, sp] = await Promise.all([listFriends(playerId), friendStreaks(playerId), searchParams]);
  const asked = typeof sp.tab === "string" ? (sp.tab as FriendsTab) : null;
  const tab = asked && TABS.includes(asked) ? asked : list.incoming.length > 0 && list.friends.length === 0 ? "requests" : "friends";

  return (
    <main className="relative mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <SocialBackdrop />
      <header className="mb-6">
        <h1 className="text-3xl text-text">Friends</h1>
        <p className="mt-1 text-muted">Compare streaks, race the weekly board and cheer each other on.</p>
      </header>
      <FriendsClient initial={list} streaks={streaks} initialTab={tab} now={serverNow()} />
    </main>
  );
}
