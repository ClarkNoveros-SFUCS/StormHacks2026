import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { EmptyState } from "@/components/social/EmptyState";
import { Button } from "@/components/ui";
import { getApiPlayer } from "@/lib/auth";
import { sql } from "@/lib/db";
import { dailyArchive, dailyLeaderboard, dailyToday } from "@/lib/daily/queries";
import { crowdStats } from "@/lib/daily/record";
import { ensureProfile } from "@/lib/social/profile";
import { DailyHub } from "./DailyHub";

export const metadata: Metadata = {
  title: "Daily Dive · SYLLABYSS",
  description: "One Dive a day, the same seven prompts for everyone. Rarer answers sink deeper.",
};

// The Daily Dive hub (F28 #41, decisions §7, Q9, Q23, §14): today's puzzle and your result,
// the flip-clock countdown, your Daily streak, today's leaderboard and the archive. Works
// signed out (play needs sign-in). Data comes straight from lib/daily (F23); the client
// refreshes the leaderboard tabs from /api/daily/leaderboard.
export default async function DailyPage() {
  const playerId = await getApiPlayer();
  if (playerId) {
    const clerkUser = await currentUser().catch(() => null);
    await ensureProfile(playerId, clerkUser ?? undefined);
  }

  const now = new Date();
  const daily = await dailyToday(playerId, now);
  if (!daily) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:px-6">
        <EmptyState say="The tide's out: no puzzle went live today. Check back after midnight!" title="No Daily Dive today">
          <Button href="/" variant="primary">
            Back to the surface
          </Button>
        </EmptyState>
      </main>
    );
  }

  const result = daily.me?.result ?? null;
  const [archive, board, crowd] = await Promise.all([
    dailyArchive(playerId, { limit: 30 }, now),
    dailyLeaderboard(playerId, { scope: "global", limit: 10 }, now),
    result ? crowdStats(sql, daily.day, { id: result.runId, score: result.score }) : null,
  ]);

  return <DailyHub daily={daily} archive={archive} board={board?.leaderboard ?? null} betterThanPct={crowd?.betterThanPct ?? null} />;
}
