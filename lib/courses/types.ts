// Shapes the Courses API returns. Plain types, safe to import from client components (F27
// Explore, Course and Topic pages). Spec: docs/architecture/courses.md.
//
//   GET  /api/courses                                    → { courses: CourseSummary[] }   public
//   GET  /api/courses/[slug]                             → { course: CourseDetail }       public
//   GET  /api/courses/[slug]/topics/[topicSlug]          → { topic: TopicDetail }         public
//   POST /api/courses/[slug]/topics/[topicSlug]/read     → TopicReadResponse              signed in
//   POST /api/games/[gameId]/runs                        → { runId } (403 if the Topic is locked)
//
// The GETs work signed out (Q24): then every `progress` / `me` field is null.
import type { ModeId } from "@/lib/modes";
import type { XpAward } from "@/lib/social/types";

export type { ModeId };

/** A learning link on a Topic page. `source`: the site's name ("Python docs", "Real Python" …). */
export type TopicResource = { title: string; url: string; source?: string };

/** The caller's state on one Topic. Null when signed out. */
export type TopicProgress = {
  /** Topic 1 never is; Topic N+1 is until a practice Game of Topic N is passed. */
  locked: boolean;
  passed: boolean;
  passedAt: string | null; //  ISO, the first Pass
  read: boolean;
  readAt: string | null; //    ISO, "mark as read"
};

/** One Topic in a Course's timeline. */
export type TopicSummary = {
  number: number; //           1-based, the Topic's place in the Course
  slug: string;
  title: string;
  summary: string;
  minutes: number | null; //   reading time
  /** Practice Game Modes on offer, in MODES order. */
  modes: ModeId[];
  /** `topic-<course>-<n>`; name and icon via badgeInfo() from lib/social/badges. */
  badgeId: string;
  progress: TopicProgress | null;
};

/** A card in the Explore catalogue. */
export type CourseSummary = {
  slug: string;
  title: string;
  level: string; //            "Beginner" …
  summary: string;
  banner: string | null; //    pixel banner id
  topicCount: number;
  minutes: number; //          total reading time
  modes: ModeId[]; //          every Mode any Topic offers
  /** `course-<course>`. */
  badgeId: string;
  progress: {
    passed: number; //         Topics passed
    total: number;
    finished: boolean; //      every Topic passed
    /** Where "Continue" goes: the first unlocked Topic not passed yet (null once finished). */
    nextTopicSlug: string | null;
  } | null;
};

export type CourseDetail = CourseSummary & {
  description: string;
  topics: TopicSummary[];
};

/** One practice Game on a Topic page. Play it with POST /api/games/[gameId]/runs. */
export type TopicPracticeGame = {
  mode: ModeId;
  gameId: string;
  title: string;
  promptCount: number;
  /** The Mode's pass bar in words ("Score 150 or more"). */
  passBar: string;
  /** The caller's record on this Game; null when signed out. */
  me: { best: number | null; passed: boolean; runs: number } | null;
};

export type TopicDetail = {
  course: { slug: string; title: string; topicCount: number; badgeId: string };
  number: number;
  slug: string;
  title: string;
  summary: string;
  minutes: number | null;
  resources: TopicResource[];
  /** The reading, page by page (markdown). Practice Answers cite these page numbers as Evidence. */
  reading: { documentId: string; title: string; pages: { pageNumber: number; contentMd: string }[] };
  /** In MODES order: dive, apogee, leap, pairs, blitz. */
  games: TopicPracticeGame[];
  prev: { slug: string; title: string } | null;
  next: { slug: string; title: string } | null;
  badgeId: string;
  progress: TopicProgress | null;
};

export type TopicReadResponse = { progress: TopicProgress; xp: XpAward };

/**
 * In a Run's Reveal when its Game is a Topic practice Game, so the Reveal can celebrate:
 * `passedNow` = this Run is the Topic's first Pass (+150 XP and the Topic Badge were awarded),
 * `unlockedNext` = it unlocked `nextTopicSlug`, `courseFinished` = it was the Course's last Topic.
 */
export type TopicReveal = {
  courseSlug: string;
  courseTitle: string;
  topicSlug: string;
  topicNumber: number;
  topicTitle: string;
  /** This Run met its Mode's pass bar (same as the Reveal's `passed`). */
  passed: boolean;
  passedNow: boolean;
  /** The Topic was already passed before this Run. */
  passedBefore: boolean;
  nextTopicSlug: string | null;
  unlockedNext: boolean;
  courseFinished: boolean;
};
