import Link from "next/link";
import { Badge, Mascot, PixelIcon, ProfileCard, ProgressBar } from "@/components/ui";
import type { CourseDetail } from "@/lib/courses/types";
import { badgeInfo } from "@/lib/social/badges";
import type { ProfileCard as ProfileCardData } from "@/lib/social/types";
import { SignInCta } from "./SignInCta";

type Props = { course: CourseDetail; card: ProfileCardData | null; signedIn: boolean; resources: number };

/** Course page sidebar: profile mini-card, course progress, the Topic and Course badges, course stats. */
export function CourseSidebar({ course, card, signedIn, resources }: Props) {
  const p = course.progress;
  const next = p?.nextTopicSlug ? course.topics.find((t) => t.slug === p.nextTopicSlug) : null;
  const badges = [
    ...course.topics.map((t) => ({ id: t.badgeId, earned: !!t.progress?.passed, tone: "bronze" as const, icon: "star" as const })),
    { id: course.badgeId, earned: !!p?.finished, tone: "gold" as const, icon: "crown" as const },
  ];

  return (
    <aside className="flex flex-col gap-5" aria-label="Your progress">
      {card ? (
        <ProfileCard
          name={card.player.displayName}
          level={card.level.level}
          avatarId={card.player.avatar}
          imageUrl={card.player.imageUrl}
          totalXp={card.totalXp}
          rank={card.level.rank}
          badges={card.badgeCount}
          streak={card.streak.current}
          streakActive={card.streak.playedToday}
          profileHref="/profile"
        />
      ) : !signedIn ? (
        <section className="card flex flex-col items-center gap-3 p-5 text-center">
          <Mascot size={76} followCursor sleepAfterMs={0} />
          <p className="font-display text-lg text-text">Track your progress</p>
          <p className="text-sm text-muted">Readings are free to browse. Sign in to play the practice games, unlock Topics and earn XP and badges.</p>
          <SignInCta block />
        </section>
      ) : null}

      <section className="card p-5">
        <h2 className="label-line mb-3">Course progress</h2>
        {p ? (
          <>
            <ProgressBar value={p.passed} max={p.total} tone={p.finished ? "var(--success)" : "var(--primary)"} height={12} />
            <p className="mt-2 flex justify-between text-sm text-muted">
              <span>
                <span className="font-display text-text">{p.passed}</span> of {p.total} Topics passed
              </span>
              <span className="tabular-nums">{Math.round((p.passed / Math.max(1, p.total)) * 100)}%</span>
            </p>
            {next && (
              <Link href={`/explore/${course.slug}/${next.slug}`} className="mt-3 flex items-center gap-2 rounded-sm text-sm text-signal hover:underline">
                Up next: Topic {next.number} · {next.title} →
              </Link>
            )}
            {p.finished && <p className="mt-3 text-sm text-success">Course complete. Nice work!</p>}
          </>
        ) : (
          <p className="text-sm text-muted">Sign in to see which Topics you&apos;ve passed.</p>
        )}
      </section>

      <section className="card p-5">
        <h2 className="label-line mb-4">Course badges</h2>
        <div className="grid grid-cols-3 justify-items-center gap-y-4">
          {badges.map((b) => {
            const info = badgeInfo(b.id);
            const name = info?.name.replace(/^.*: /, "") ?? b.id;
            return <Badge key={b.id} name={name} icon={b.icon} tone={b.tone} earned={b.earned} description={info?.description} size={52} />;
          })}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="label-line mb-3">In this course</h2>
        <ul className="grid grid-cols-2 gap-3 text-sm">
          <Stat icon="book" value={course.topicCount} label="Topics" />
          <Stat icon="clock" value={`${course.minutes} min`} label="Reading" />
          <Stat icon="doc" value={resources} label="Resources" />
          <Stat icon="cards" value={course.modes.length} label="Game modes" />
        </ul>
      </section>
    </aside>
  );
}

function Stat({ icon, value, label }: { icon: "book" | "clock" | "doc" | "cards"; value: React.ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <PixelIcon name={icon} size={22} />
      <span className="leading-tight">
        <span className="block font-display text-text">{value}</span>
        <span className="text-xs text-muted">{label}</span>
      </span>
    </li>
  );
}
