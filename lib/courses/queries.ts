import "server-only";
import type postgres from "postgres";
import { sql } from "@/lib/db";
import { PASS_BAR_TEXT } from "@/lib/modes/rules";
import { MODE_IDS, type ModeId } from "@/lib/modes";
import { courseBadgeId, topicBadgeId } from "@/lib/social/badges";
import { inTx, onTopicRead } from "@/lib/social/xp";
import { lockedTopics, nextTopicIndex, sortModes, type ModeRecords } from "./rules";
import type {
  CourseDetail, CourseSummary, TopicDetail, TopicPracticeGame, TopicProgress, TopicReadResponse, TopicResource, TopicSummary,
} from "./types";

// Read side of Courses (catalogue, Course page, Topic page) and "mark as read". The catalogue
// and readings are public (Q24): pass playerId = null when signed out and every progress
// field comes back null. Spec: docs/architecture/courses.md.

type Db = postgres.Sql | postgres.TransactionSql;

/** An expected failure with an HTTP status; courseRoute turns it into `{ error }`. */
export class CourseError extends Error {
  constructor(public status: 400 | 404, message: string) {
    super(message);
  }
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type CourseRow = {
  id: string; slug: string; title: string; level: string; summary: string; description: string; banner: string | null;
};

type TopicRow = {
  id: string; course_id: string; position: number; slug: string; title: string; summary: string; minutes: number | null;
  source_document_id: string; resources: TopicResource[]; modes: ModeId[];
  read_at: Date | null; passed_at: Date | null; records: ModeRecords | null;
};

async function courseRows(db: Db, slug: string | null): Promise<CourseRow[]> {
  if (slug !== null && !SLUG.test(slug)) return [];
  return db<CourseRow[]>`
    select id, slug, title, level, summary, description, banner from courses
     where published ${slug === null ? db`` : db`and slug = ${slug}`}
     order by sort, title`;
}

/** Every Topic of these Courses in order, with the caller's progress (none when playerId is null). */
async function topicRows(db: Db, courseIds: string[], playerId: string | null): Promise<TopicRow[]> {
  if (courseIds.length === 0) return [];
  return db<TopicRow[]>`
    select t.id, t.course_id, t.position, t.slug, t.title, t.summary, t.minutes, t.source_document_id, t.resources,
           coalesce((select array_agg(tg.mode) from topic_games tg join games g on g.id = tg.game_id
                      where tg.topic_id = t.id and g.status = 'ready' and g.visibility = 'public'), '{}') as modes,
           tp.read_at, tp.passed_at, tp.modes as records
      from course_topics t
      left join topic_progress tp on tp.topic_id = t.id and tp.player_id = ${playerId}
     where t.course_id = any(${courseIds}::uuid[])
     order by t.course_id, t.position`;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const inModeOrder = (modes: ModeId[]) => MODE_IDS.filter((m) => modes.includes(m));

/** Topic summaries for one Course's rows (already in order), with lock state for a signed-in caller. */
function summarize(course: CourseRow, topics: TopicRow[], signedIn: boolean): TopicSummary[] {
  const locked = lockedTopics(topics.map((t) => t.passed_at !== null));
  return topics.map((t, i) => ({
    number: t.position,
    slug: t.slug,
    title: t.title,
    summary: t.summary,
    minutes: t.minutes,
    modes: inModeOrder(t.modes),
    badgeId: topicBadgeId(course.slug, t.position),
    progress: signedIn ? progressOf(t, locked[i]) : null,
  }));
}

function progressOf(t: TopicRow, locked: boolean): TopicProgress {
  return { locked, passed: t.passed_at !== null, passedAt: iso(t.passed_at), read: t.read_at !== null, readAt: iso(t.read_at) };
}

function courseSummary(course: CourseRow, topics: TopicRow[], signedIn: boolean): CourseSummary {
  const passed = topics.map((t) => t.passed_at !== null);
  const next = nextTopicIndex(passed);
  return {
    slug: course.slug,
    title: course.title,
    level: course.level,
    summary: course.summary,
    banner: course.banner,
    topicCount: topics.length,
    minutes: topics.reduce((s, t) => s + (t.minutes ?? 0), 0),
    modes: inModeOrder([...new Set(topics.flatMap((t) => t.modes))]),
    badgeId: courseBadgeId(course.slug),
    progress: signedIn
      ? {
          passed: passed.filter(Boolean).length,
          total: topics.length,
          finished: topics.length > 0 && passed.every(Boolean),
          nextTopicSlug: next === null ? null : topics[next].slug,
        }
      : null,
  };
}

/** GET /api/courses: the published Courses, in catalogue order. */
export async function listCourses(playerId: string | null, db: Db = sql): Promise<CourseSummary[]> {
  const courses = await courseRows(db, null);
  const topics = await topicRows(db, courses.map((c) => c.id), playerId);
  return courses.map((c) => courseSummary(c, topics.filter((t) => t.course_id === c.id), playerId !== null));
}

/** GET /api/courses/[slug]: the Course page, or null if there is no such published Course. */
export async function getCourse(slug: string, playerId: string | null, db: Db = sql): Promise<CourseDetail | null> {
  const [course] = await courseRows(db, slug);
  if (!course) return null;
  const topics = await topicRows(db, [course.id], playerId);
  return {
    ...courseSummary(course, topics, playerId !== null),
    description: course.description,
    topics: summarize(course, topics, playerId !== null),
  };
}

/** GET /api/courses/[slug]/topics/[topicSlug]: the Topic page, or null if either doesn't exist. */
export async function getTopic(slug: string, topicSlug: string, playerId: string | null, db: Db = sql): Promise<TopicDetail | null> {
  const [course] = await courseRows(db, slug);
  if (!course || !SLUG.test(topicSlug)) return null;
  const topics = await topicRows(db, [course.id], playerId);
  const i = topics.findIndex((t) => t.slug === topicSlug);
  if (i === -1) return null;
  const t = topics[i];
  const locked = lockedTopics(topics.map((x) => x.passed_at !== null));

  const [doc] = await db<{ filename: string }[]>`select filename from source_documents where id = ${t.source_document_id}`;
  const pages = await db<{ pageNumber: number; contentMd: string }[]>`
    select page_number as "pageNumber", content_md as "contentMd" from source_pages
     where source_document_id = ${t.source_document_id} order by page_number`;
  const games = await db<{ mode: ModeId; game_id: string; title: string; prompt_count: number | null }[]>`
    select tg.mode, g.id as game_id, g.title, g.prompt_count
      from topic_games tg join games g on g.id = tg.game_id
     where tg.topic_id = ${t.id} and g.status = 'ready' and g.visibility = 'public'`;
  const records = t.records ?? {};
  const signedIn = playerId !== null;

  const practice: TopicPracticeGame[] = sortModes(games).map((g) => ({
    mode: g.mode,
    gameId: g.game_id,
    title: g.title,
    promptCount: g.prompt_count ?? 0,
    passBar: PASS_BAR_TEXT[g.mode as keyof typeof PASS_BAR_TEXT] ?? "",
    me: signedIn
      ? { best: records[g.mode]?.best ?? null, passed: records[g.mode]?.passed ?? false, runs: records[g.mode]?.runs ?? 0 }
      : null,
  }));

  const link = (x: TopicRow | undefined) => (x ? { slug: x.slug, title: x.title } : null);
  return {
    course: { slug: course.slug, title: course.title, topicCount: topics.length, badgeId: courseBadgeId(course.slug) },
    number: t.position,
    slug: t.slug,
    title: t.title,
    summary: t.summary,
    minutes: t.minutes,
    resources: t.resources,
    reading: { documentId: t.source_document_id, title: doc?.filename ?? t.title, pages },
    games: practice,
    prev: link(topics[i - 1]),
    next: link(topics[i + 1]),
    badgeId: topicBadgeId(course.slug, t.position),
    progress: signedIn ? progressOf(t, locked[i]) : null,
  };
}

/**
 * POST .../read: the optional "mark as read" (Q27). +20 XP once per Topic; gates nothing, and
 * works on a locked Topic too (its reading is public). Idempotent.
 */
export async function markTopicRead(playerId: string, slug: string, topicSlug: string, db: Db = sql): Promise<TopicReadResponse> {
  return inTx(db, async (tx) => {
    const [course] = await courseRows(tx, slug);
    if (!course || !SLUG.test(topicSlug)) throw new CourseError(404, "Topic not found");
    const topics = await topicRows(tx, [course.id], playerId);
    const i = topics.findIndex((t) => t.slug === topicSlug);
    if (i === -1) throw new CourseError(404, "Topic not found");
    const t = topics[i];

    const [row] = await tx<{ read_at: Date }[]>`
      insert into topic_progress (player_id, topic_id, read_at) values (${playerId}, ${t.id}, now())
      on conflict (player_id, topic_id) do update set read_at = coalesce(topic_progress.read_at, excluded.read_at)
      returning read_at`;
    const xp = await onTopicRead(playerId, { course: course.slug, topicNumber: t.position }, tx);
    const locked = lockedTopics(topics.map((x) => x.passed_at !== null));
    return { progress: progressOf({ ...t, read_at: row.read_at }, locked[i]), xp };
  });
}
