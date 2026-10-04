// The Badge catalogue and the pure criteria behind the automatic ones. Client-safe.
// Who has what lives in player_badges; awarding happens in lib/social/xp.ts.
import type { Badge, BadgeTier } from "./types";

/** Every Mode a Run can be played in (F20). Kept as a string so a new Mode needs no change here. */
export type ModeName = "dive" | "apogee" | "leap" | "pairs" | "blitz" | (string & {});

/**
 * A finished Run, as F20's RunSummary (lib/runs/types.ts) plus its id. Only the stats this
 * file reads are typed; anything else is ignored.
 */
export type SocialRunSummary = {
  runId: string;
  mode: ModeName;
  score: number;
  finishedAt: string | Date;
  outcome?: string | null; // leap: cleared | fell · pairs: cleared | time_up · blitz: time_up | deck_cleared · dive: finished
  stats?: {
    questions?: number; //  leap
    correct?: number; //    leap, blitz, dive
    boardsCleared?: number; // pairs
    timeBonus?: number; //  pairs: 5 points per second left, summed over both Boards
    [key: string]: unknown;
  } | null;
};

const b = (id: string, name: string, description: string, icon: string, tier: BadgeTier): Badge => ({
  id, name, description, icon, tier,
});

/** Fixed Badges. Topic and Course Badges are generated per Course (topicBadge, courseBadge). */
export const BADGES = {
  "first-dive": b("first-dive", "First Dive", "Finish your first Run.", "anchor", "bronze"),
  "streak-7": b("streak-7", "Week of Tides", "Play 7 days in a row.", "flame", "silver"),
  "streak-30": b("streak-30", "Moon Cycle", "Play 30 days in a row.", "moon", "gold"),
  "trench-diver": b("trench-diver", "Trench Diver", "Find a rare-tier Answer.", "trench", "silver"),
  "perfect-leap": b("perfect-leap", "Perfect Leap", "Answer every question right in a Leap Run.", "frog", "gold"),
  "pairs-speedrun": b("pairs-speedrun", "Pairs Speedrun", "Clear both Pairs boards with a minute or more to spare.", "stopwatch", "gold"),
  "daily-top-10": b("daily-top-10", "Daily Top 10", "Finish in the top 10 of a Daily Dive.", "trophy", "gold"),
  "level-5": b("level-5", "Reef Regular", "Reach Level 5.", "coral", "bronze"),
  "level-10": b("level-10", "Deep Veteran", "Reach Level 10.", "trident", "silver"),
} as const satisfies Record<string, Badge>;
export type FixedBadgeId = keyof typeof BADGES;

/** Course names for generated Badges; an unknown slug is title-cased. */
const COURSE_NAMES: Record<string, string> = { "python-basics": "Python Basics" };

function courseName(slug: string): string {
  return COURSE_NAMES[slug] ?? slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `topic-<course>-<n>`, e.g. topic-python-basics-3. F22 awards it when Topic n is passed. */
export function topicBadgeId(course: string, topicNumber: number): string {
  if (!SLUG.test(course) || !Number.isInteger(topicNumber) || topicNumber < 1) {
    throw new Error(`Bad topic badge: ${course} #${topicNumber}`);
  }
  return `topic-${course}-${topicNumber}`;
}

/** `course-<course>`, e.g. course-python-basics. */
export function courseBadgeId(course: string): string {
  if (!SLUG.test(course)) throw new Error(`Bad course badge: ${course}`);
  return `course-${course}`;
}

/** Name, description and icon for any Badge id (fixed or generated); null if unknown. */
export function badgeInfo(id: string): Badge | null {
  if (id in BADGES) return BADGES[id as FixedBadgeId];
  const topic = /^topic-([a-z0-9-]+)-(\d+)$/.exec(id);
  if (topic) {
    const n = Number(topic[2]);
    return b(id, `${courseName(topic[1])}: Topic ${n}`, `Pass Topic ${n} of ${courseName(topic[1])}.`, "scroll", "bronze");
  }
  const course = /^course-([a-z0-9-]+)$/.exec(id);
  if (course) {
    return b(id, `${courseName(course[1])} Graduate`, `Finish every Topic of ${courseName(course[1])}.`, "diploma", "gold");
  }
  return null;
}

/** Every Badge a Player could see in a catalogue view: the fixed ones plus Python Basics. */
export function badgeCatalogue(): Badge[] {
  const topics = [1, 2, 3, 4, 5, 6].map((n) => badgeInfo(topicBadgeId("python-basics", n))!);
  return [...Object.values(BADGES), ...topics, badgeInfo(courseBadgeId("python-basics"))!];
}

/** Badges earned by totals alone (after any XP award). */
export function progressBadges(level: number, longestStreak: number): FixedBadgeId[] {
  const out: FixedBadgeId[] = [];
  if (level >= 5) out.push("level-5");
  if (level >= 10) out.push("level-10");
  if (longestStreak >= 7) out.push("streak-7");
  if (longestStreak >= 30) out.push("streak-30");
  return out;
}

export const PAIRS_SPEEDRUN_TIME_BONUS = 300; // 5 points per second → 60 s left over both Boards

/** Badges a finished Run earns by itself. `rareFound`: rare-tier Answers found in this Run. */
export function runBadges(summary: SocialRunSummary, rareFound: number): FixedBadgeId[] {
  const out: FixedBadgeId[] = ["first-dive"]; // already-held Badges are skipped on insert
  const stats = summary.stats ?? {};
  if (rareFound > 0) out.push("trench-diver");
  if (
    summary.mode === "leap" && summary.outcome !== "fell" &&
    typeof stats.questions === "number" && stats.questions > 0 && stats.correct === stats.questions
  ) out.push("perfect-leap");
  if (
    summary.mode === "pairs" && summary.outcome === "cleared" &&
    typeof stats.timeBonus === "number" && stats.timeBonus >= PAIRS_SPEEDRUN_TIME_BONUS
  ) out.push("pairs-speedrun");
  return out;
}
