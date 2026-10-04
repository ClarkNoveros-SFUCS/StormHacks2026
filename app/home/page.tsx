import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { getDailyTeaser } from "@/components/landing/daily-teaser";
import { requirePlayer } from "@/lib/auth";
import { dailyToday } from "@/lib/daily/queries";
import { listFriends } from "@/lib/social/friends";
import { weeklyXp } from "@/lib/social/leaderboards";
import { ensureProfile, profileCard } from "@/lib/social/profile";
import { coursesAvailable, moduleCount, photoSettings, recentGames } from "./data";
import { HomeBackdrop } from "./HomeBackdrop";
import { CourseProgressCard, DailyCard, GameCard, JumpBackIn } from "./MainCards";
import { Greeting } from "./Greeting";
import { FriendsPanel, ProfileSidebar, WeeklyBoard } from "./Sidebar";

export const metadata: Metadata = { title: "Home · SYLLABYSS" };

// The signed-in dashboard (F19 #32, decisions §2, §14): greeting with Lumen, Jump back in,
// Continue progress, the Daily Dive card, and a sidebar with the profile card, the weekly XP
// board and friends. Social data comes straight from lib/social (F21).
export default async function HomePage() {
  const playerId = await requirePlayer();
  const clerkUser = await currentUser().catch(() => null);
  await ensureProfile(playerId, clerkUser ?? undefined);

  const [card, photo, games, modules, friends, friendsBoard, courses, daily] = await Promise.all([
    profileCard(playerId),
    photoSettings(playerId),
    recentGames(playerId, 5),
    moduleCount(playerId),
    listFriends(playerId),
    weeklyXp(playerId, "friends", 5),
    coursesAvailable(),
    // The Daily card falls back to the teaser if the Daily backend errors.
    dailyToday(playerId).catch(() => null),
  ]);
  // Friends board with just you on it isn't much of a race: fall back to everyone.
  const board = friendsBoard.total > 1 ? friendsBoard : await weeklyXp(playerId, "global", 5);
  const teaser = getDailyTeaser(daily);
  const [latest, ...rest] = games;

  return (
    <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <HomeBackdrop />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Greeting name={card.player.displayName} streak={card.streak} hasModules={modules > 0} hasPlayed={games.some((g) => g.lastPlayedAt)} />

          <section aria-labelledby="jump-title">
            <h2 id="jump-title" className="label-line mb-3">
              Jump back in
            </h2>
            <JumpBackIn game={latest ?? null} hasModules={modules > 0} />
          </section>

          <section aria-labelledby="continue-title">
            <h2 id="continue-title" className="label-line mb-3">
              Continue progress
            </h2>
            <div className="stagger grid gap-4 sm:grid-cols-2">
              <DailyCard teaser={teaser} daily={daily} streak={card.streak} />
              {courses && <CourseProgressCard />}
              {rest.map((g, n) => (
                <GameCard key={g.id} game={g} style={{ "--i": n + 2 } as React.CSSProperties} />
              ))}
            </div>
          </section>
        </div>

        <aside aria-label="Your stats and friends" className="flex flex-col gap-6">
          <ProfileSidebar card={card} usePhoto={photo.usePhoto} clerkImageUrl={photo.clerkImageUrl} />
          <WeeklyBoard board={board} />
          <FriendsPanel friends={friends} />
        </aside>
      </div>
    </main>
  );
}
