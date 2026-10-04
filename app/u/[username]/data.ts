import "server-only";
import { timeAgo } from "@/components/social/format";
import { sql } from "@/lib/db";
import { getCourse, listCourses } from "@/lib/courses/queries";
import { normalizeUsername } from "@/lib/social/username";
import { SYSTEM_PLAYER_ID } from "@/lib/social/profile";

// Extra data for a public profile that F21's PublicProfile doesn't carry: recent activity and
// Course progress. Same privacy rule (ADR-0005): never a Module, file or Module Game name.

export async function playerIdFor(username: string): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    select id from players where username = ${normalizeUsername(username)} and id <> ${SYSTEM_PLAYER_ID}`;
  return row?.id ?? null;
}

export type ActivityItem = {
  at: string;
  /** "3h ago", computed on the server. */
  ago: string;
  xp: number;
  kind: "run" | "topic_passed" | "topic_read" | "course_finished" | "daily" | "other";
  /** e.g. "Finished a Leap Run" / "Passed Topic 3 of Python Basics". Never names a private Game. */
  text: string;
  mode: string | null;
  score: number | null;
  /** Course Topic link for course events. */
  href: string | null;
};

type Row = {
  at: Date;
  amount: number;
  reason: string;
  ref: string;
  mode: string | null;
  score: number | null;
  public_title: string | null;
  course_title: string | null;
  topic_title: string | null;
  topic_slug: string | null;
};

const MODE_NAMES: Record<string, string> = { dive: "Dive", apogee: "Apogee", leap: "Leap", pairs: "Pairs", blitz: "Blitz" };

/** The Player's latest XP events, described without any private content. */
export async function recentActivity(playerId: string, limit = 8): Promise<ActivityItem[]> {
  const rows = await sql<Row[]>`
    select x.at, x.amount, x.reason, x.ref,
           g.mode, r.score,
           case when g.visibility = 'public' then g.title end as public_title,
           c.title as course_title, t.title as topic_title, t.slug as topic_slug
    from (
      select at, amount, reason, ref from xp_events where player_id = ${playerId} order by at desc limit ${limit}
    ) x
    left join runs r on x.reason = 'run_finished' and r.id::text = x.ref
    left join games g on g.id = r.game_id
    left join courses c on x.reason in ('topic_passed', 'topic_read', 'course_finished')
                       and c.slug = split_part(x.ref, ':', 1)
    left join course_topics t on t.course_id = c.id and x.reason in ('topic_passed', 'topic_read')
                      and t.position::text = split_part(x.ref, ':', 2)
    order by x.at desc`;

  const now = Date.now();
  return rows.map((r): ActivityItem => {
    const base = { at: r.at.toISOString(), ago: timeAgo(r.at.toISOString(), now), xp: r.amount, mode: r.mode, score: r.score, href: null as string | null };
    const courseSlug = r.ref.split(":")[0];
    const topicHref = r.topic_slug ? `/explore/${courseSlug}/${r.topic_slug}` : null;
    const topicNumber = r.ref.split(":")[1];
    const topicName = r.topic_title ?? `Topic ${topicNumber}`;
    const course = r.course_title ?? courseSlug;
    switch (r.reason) {
      case "run_finished": {
        const mode = r.mode ? MODE_NAMES[r.mode] ?? r.mode : null;
        const text = r.public_title ? `Played ${r.public_title}` : mode ? `Finished a ${mode} Run` : "Finished a Run";
        return { ...base, kind: "run", text };
      }
      case "topic_passed":
        return { ...base, kind: "topic_passed", text: `Passed “${topicName}” in ${course}`, href: topicHref };
      case "topic_read":
        return { ...base, kind: "topic_read", text: `Read “${topicName}” in ${course}`, href: topicHref };
      case "course_finished":
        return { ...base, kind: "course_finished", text: `Graduated from ${course}`, href: `/explore/${courseSlug}` };
      case "daily_played":
        return { ...base, kind: "daily", text: `Played the Daily Dive (${r.ref})`, href: "/daily" };
      default:
        return { ...base, kind: "other", text: "Earned XP" };
    }
  });
}

export type CourseProgressRow = {
  slug: string;
  title: string;
  banner: string | null;
  passed: number;
  total: number;
  finished: boolean;
  badgeId: string;
  topics: { number: number; title: string; slug: string; badgeId: string; passed: boolean }[];
};

/** Course progress for the profile: only Courses the Player has started (any Topic passed or read). */
export async function courseProgress(playerId: string): Promise<CourseProgressRow[]> {
  const courses = await listCourses(playerId).catch(() => []);
  const details = await Promise.all(courses.map((c) => getCourse(c.slug, playerId)));
  return details.flatMap((c) => {
    if (!c || !c.progress) return [];
    const started = c.topics.some((t) => t.progress?.passed || t.progress?.read);
    if (!started) return [];
    return [
      {
        slug: c.slug,
        title: c.title,
        banner: c.banner,
        passed: c.progress.passed,
        total: c.progress.total,
        finished: c.progress.finished,
        badgeId: c.badgeId,
        topics: c.topics.map((t) => ({ number: t.number, title: t.title, slug: t.slug, badgeId: t.badgeId, passed: !!t.progress?.passed })),
      },
    ];
  });
}
