import "server-only";
import type postgres from "postgres";
import { passedRun } from "@/lib/modes/rules";
import { RunError } from "@/lib/runs/engines/common";
import type { RunSummary } from "@/lib/runs/types";
import { onCourseFinished, onTopicPassed } from "@/lib/social/xp";
import { lockedTopics, recordRun, type ModeRecords } from "./rules";
import type { TopicReveal } from "./types";

// What Runs do to Courses, called by the run engine inside its transactions:
//   createRun     → assertTopicUnlocked (403 on a locked Topic's Game)
//   Run finishes  → recordTopicRun (per-Mode record, first Pass: +150 XP, Topic Badge, maybe the Course)
//   getReveal     → topicReveal (the Reveal's `topic` block)
// Spec: docs/architecture/courses.md.

type Tx = postgres.TransactionSql;

type GameTopic = {
  topic_id: string;
  position: number;
  topic_slug: string;
  topic_title: string;
  course_id: string;
  course_slug: string;
  course_title: string;
};

/** The Topic whose practice Game this is, or null for any other Game. */
async function topicForGame(tx: Tx, gameId: string): Promise<GameTopic | null> {
  const [t] = await tx<GameTopic[]>`
    select t.id as topic_id, t.position, t.slug as topic_slug, t.title as topic_title,
           c.id as course_id, c.slug as course_slug, c.title as course_title
      from topic_games tg
      join course_topics t on t.id = tg.topic_id
      join courses c on c.id = t.course_id
     where tg.game_id = ${gameId}`;
  return t ?? null;
}

/** The Course's Topics in order, with whether the Player has passed each. */
async function courseTopics(tx: Tx, courseId: string, playerId: string) {
  return tx<{ id: string; position: number; slug: string; passed: boolean; passed_at: Date | null }[]>`
    select t.id, t.position, t.slug, (tp.passed_at is not null) as passed, tp.passed_at
      from course_topics t
      left join topic_progress tp on tp.topic_id = t.id and tp.player_id = ${playerId}
     where t.course_id = ${courseId}
     order by t.position`;
}

/** Refuses (403) a Run on a Topic practice Game while that Topic is locked for the Player. */
export async function assertTopicUnlocked(tx: Tx, playerId: string, gameId: string): Promise<void> {
  const topic = await topicForGame(tx, gameId);
  if (!topic) return;
  const topics = await courseTopics(tx, topic.course_id, playerId);
  const locked = lockedTopics(topics.map((t) => t.passed));
  const i = topics.findIndex((t) => t.id === topic.topic_id);
  if (locked[i]) {
    throw new RunError(403, `Topic ${topic.position} is locked: pass a practice Game of Topic ${topics[i - 1].position} first`);
  }
}

export type TopicRunResult = { topicId: string; passed: boolean; passedNow: boolean; courseFinished: boolean };

/**
 * Call once when a Run on any Game finishes, inside the finishing transaction, after
 * onRunFinished. Does nothing (null) unless the Game is a Topic practice Game. Otherwise
 * updates the Player's per-Mode record and, on the Topic's first Pass, sets passed_at and
 * awards the Topic (and, after the last Topic, the Course) through F21's hooks.
 */
export async function recordTopicRun(
  tx: Tx, playerId: string, run: { id: string; gameId: string; finishedAt: Date }, summary: RunSummary,
): Promise<TopicRunResult | null> {
  const topic = await topicForGame(tx, run.gameId);
  if (!topic) return null;

  await tx`
    insert into topic_progress (player_id, topic_id) values (${playerId}, ${topic.topic_id})
    on conflict (player_id, topic_id) do nothing`;
  const [row] = await tx<{ modes: ModeRecords; passed_at: Date | null }[]>`
    select modes, passed_at from topic_progress
     where player_id = ${playerId} and topic_id = ${topic.topic_id} for update`;

  const { modes, passed } = recordRun(row.modes, summary);
  const passedNow = passed && row.passed_at === null;
  await tx`
    update topic_progress
       set modes = ${tx.json(modes as postgres.JSONValue)}, updated_at = ${run.finishedAt},
           passed_at = coalesce(passed_at, ${passedNow ? run.finishedAt : null}),
           passed_run_id = case when passed_at is null then ${passedNow ? run.id : null}::uuid else passed_run_id end,
           passed_mode = case when passed_at is null then ${passedNow ? summary.mode : null} else passed_mode end
     where player_id = ${playerId} and topic_id = ${topic.topic_id}`;

  let courseFinished = false;
  if (passedNow) {
    await onTopicPassed(playerId, { course: topic.course_slug, topicNumber: topic.position }, tx);
    const topics = await courseTopics(tx, topic.course_id, playerId);
    if (topics.every((t) => t.passed)) {
      await onCourseFinished(playerId, topic.course_slug, tx);
      courseFinished = true;
    }
  }
  return { topicId: topic.topic_id, passed, passedNow, courseFinished };
}

/** The Reveal's `topic` block for a finished Run, or null unless its Game is a Topic practice Game. */
export async function topicReveal(
  tx: Tx, playerId: string, run: { id: string; gameId: string }, summary: RunSummary,
): Promise<TopicReveal | null> {
  const topic = await topicForGame(tx, run.gameId);
  if (!topic) return null;
  const [progress] = await tx<{ passed_at: Date | null; passed_run_id: string | null }[]>`
    select passed_at, passed_run_id from topic_progress where player_id = ${playerId} and topic_id = ${topic.topic_id}`;
  const topics = await courseTopics(tx, topic.course_id, playerId);
  const i = topics.findIndex((t) => t.id === topic.topic_id);
  const next = topics[i + 1] ?? null;
  const passedNow = progress?.passed_run_id === run.id;
  return {
    courseSlug: topic.course_slug,
    courseTitle: topic.course_title,
    topicSlug: topic.topic_slug,
    topicNumber: topic.position,
    topicTitle: topic.topic_title,
    passed: passedRun(summary),
    passedNow,
    passedBefore: !!progress?.passed_at && !passedNow,
    nextTopicSlug: next?.slug ?? null,
    unlockedNext: passedNow && next !== null,
    // This Run's Pass completed the Course: every other Topic was passed before it
    courseFinished:
      passedNow && topics.every((t) => t.passed && t.passed_at!.getTime() <= progress.passed_at!.getTime()),
  };
}
