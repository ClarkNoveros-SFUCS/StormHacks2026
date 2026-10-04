import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { dailyNumber } from "@/components/landing/daily-teaser";
import { SocialBackdrop } from "@/components/social/SocialBackdrop";
import { requirePlayer } from "@/lib/auth";
import { getDailyPuzzle } from "@/lib/daily/queries";
import { today, weeklyXp } from "@/lib/social/leaderboards";
import { ensureProfile } from "@/lib/social/profile";
import type { DailyInfo } from "./daily";
import { LeaderboardClient, type BoardTab } from "./LeaderboardClient";

export const metadata: Metadata = { title: "Leaderboards · SYLLABYSS" };

const TABS: BoardTab[] = ["daily", "weekly", "courses"];

// Leaderboards (F26 #39, decisions §6): Daily Dive (today), Weekly XP and Courses (Topic
// passes), each Global or Friends. The weekly board is server-rendered; the rest load on demand
// from F21's /api/leaderboards routes.
export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  const playerId = await requirePlayer();
  const clerkUser = await currentUser().catch(() => null);
  await ensureProfile(playerId, clerkUser ?? undefined);

  const day = today();
  // Today's Daily puzzle (F23; claimed on first use if the midnight job hasn't run). With none,
  // the Daily tab shows its "arrives soon" state.
  const puzzle = await getDailyPuzzle(day).catch(() => null);
  const daily: DailyInfo = { gameId: puzzle?.game_id ?? null, day, number: puzzle?.number ?? dailyNumber(day) };

  const [weekly, sp] = await Promise.all([weeklyXp(playerId, "global", 50), searchParams]);
  const asked = typeof sp.tab === "string" ? (sp.tab as BoardTab) : null;
  const tab: BoardTab = asked && TABS.includes(asked) ? asked : daily.gameId ? "daily" : "weekly";

  return (
    <main className="relative mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <SocialBackdrop />
      <header className="mb-6">
        <h1 className="text-3xl text-text">Leaderboards</h1>
        <p className="mt-1 text-muted">Only public Games count: your Modules stay private.</p>
      </header>
      <LeaderboardClient initialTab={tab} initialWeekly={weekly} daily={daily} />
    </main>
  );
}
