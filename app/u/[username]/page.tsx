import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { ActivityHeatmap } from "@/components/social/ActivityHeatmap";
import { BadgeGrid } from "@/components/social/BadgeGrid";
import { bannerFor } from "@/components/social/banners";
import { SocialBackdrop } from "@/components/social/SocialBackdrop";
import { StatsCard } from "@/components/social/StatsCard";
import { requirePlayer } from "@/lib/auth";
import { ensureProfile, profileFor } from "@/lib/social/profile";
import type { MyProfile } from "@/lib/social/types";
import { courseProgress, playerIdFor, recentActivity } from "./data";
import { ProfileHeader } from "./ProfileHeader";
import { Bests, Courses, RecentActivity, SectionCard } from "./Sections";

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${decodeURIComponent(username)} · SYLLABYSS` };
}

// A Player's public Profile (F26 #39; decisions §6, Q8, Q12, Q17; ADR-0005). Visible to any
// signed-in Player. Shows the banner, avatar, stats, heatmap, bests on public Games, Course
// progress, recent activity and Badges. Never Module content.
export default async function ProfilePage({ params }: PageProps<"/u/[username]">) {
  const viewerId = await requirePlayer();
  const clerkUser = await currentUser().catch(() => null);
  await ensureProfile(viewerId, clerkUser ?? undefined);

  const { username } = await params;
  const handle = decodeURIComponent(username);
  const [profile, ownerId] = await Promise.all([profileFor(viewerId, handle), playerIdFor(handle)]);
  if (!profile || !ownerId || !profile.player.username) notFound();

  const isMe = ownerId === viewerId;
  const [activity, courses] = await Promise.all([recentActivity(ownerId, 8), courseProgress(ownerId)]);
  const banner = bannerFor(profile.banner, profile.player.username);
  const mine = isMe ? (profile as MyProfile) : null;
  const earned = new Set(profile.badges.map((b) => b.id));

  return (
    <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <SocialBackdrop />
      <ProfileHeader
        player={{ ...profile.player, username: profile.player.username }}
        banner={banner}
        bio={profile.bio}
        joinedAt={profile.joinedAt}
        counts={profile.counts}
        friendStatus={profile.friendStatus}
        friendRequestId={profile.friendRequestId}
        editable={
          mine
            ? {
                username: profile.player.username,
                displayName: profile.player.displayName,
                bio: profile.bio,
                avatar: profile.player.avatar,
                usePhoto: mine.usePhoto,
                clerkImageUrl: mine.clerkImageUrl,
                banner,
              }
            : null
        }
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <SectionCard id="activity-title" title="Activity" icon="bolt">
            <ActivityHeatmap heatmap={profile.heatmap} streak={profile.streak} />
          </SectionCard>

          <SectionCard id="bests-title" title="Bests" icon="trophy">
            <Bests bests={profile.bests} isMe={isMe} />
          </SectionCard>

          {courses.length > 0 && (
            <SectionCard id="courses-title" title="Courses" icon="book">
              <Courses courses={courses} earnedBadges={earned} />
            </SectionCard>
          )}

          <SectionCard id="recent-title" title="Recent activity" icon="clock">
            <RecentActivity items={activity} isMe={isMe} />
          </SectionCard>
        </div>

        <aside aria-label="Stats and badges" className="flex flex-col gap-6">
          <StatsCard level={profile.level} totalXp={profile.totalXp} badges={profile.counts.badges} streak={profile.streak} />
          <SectionCard id="badges-title" title="Badges" icon="gem">
            <BadgeGrid earned={profile.badges} />
          </SectionCard>
        </aside>
      </div>
    </main>
  );
}
