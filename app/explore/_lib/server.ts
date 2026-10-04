import "server-only";
import { cache } from "react";
import { getApiPlayer } from "@/lib/auth";
import { getCourse, getTopic, listCourses } from "@/lib/courses/queries";
import type { ModeRecords } from "@/lib/courses/rules";
import { sql } from "@/lib/db";
import { ensureProfile, profileCard } from "@/lib/social/profile";
import type { ProfileCard } from "@/lib/social/types";

// Data for the Explore pages. Pages call the Courses read side directly (the same functions the
// public API routes use) instead of fetching their own API. Signed out, playerId is null and
// every progress field is null (Q24).

/** The signed-in Player's id, or null (signed out). Memoized per request. */
export const viewer = cache(() => getApiPlayer());

export const courseList = cache(async (playerId: string | null) => listCourses(playerId));
export const courseDetail = cache(async (slug: string, playerId: string | null) => getCourse(slug, playerId));
export const topicDetail = cache(async (slug: string, topicSlug: string, playerId: string | null) =>
  getTopic(slug, topicSlug, playerId),
);

/** Per-Topic, per-Mode records (best, passed, runs) for the Course timeline's Mode chips. */
export async function topicRecords(courseSlug: string, playerId: string | null): Promise<Record<string, ModeRecords>> {
  if (!playerId) return {};
  const rows = await sql<{ slug: string; modes: ModeRecords | null }[]>`
    select t.slug, tp.modes
      from course_topics t
      join courses c on c.id = t.course_id
      join topic_progress tp on tp.topic_id = t.id and tp.player_id = ${playerId}
     where c.slug = ${courseSlug}`;
  return Object.fromEntries(rows.map((r) => [r.slug, r.modes ?? {}]));
}

/** How many learning resources (links) the Course's Topics list, for the sidebar. */
export async function resourceCount(courseSlug: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    select coalesce(sum(jsonb_array_length(t.resources)), 0)::int as n
      from course_topics t join courses c on c.id = t.course_id
     where c.slug = ${courseSlug}`;
  return row?.n ?? 0;
}

/** The sidebar profile card; null when signed out or if the social tables aren't reachable. */
export async function viewerCard(playerId: string | null): Promise<ProfileCard | null> {
  if (!playerId) return null;
  try {
    await ensureProfile(playerId);
    return await profileCard(playerId);
  } catch (e) {
    console.error("explore: profile card unavailable", e);
    return null;
  }
}
