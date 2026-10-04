import "server-only";
import type postgres from "postgres";
import { sql } from "@/lib/db";
import { badgeInfo, courseBadgeId, progressBadges, runBadges, topicBadgeId, type SocialRunSummary } from "./badges";
import { computeStreak, vancouverDay } from "./days";
import { levelFor, XP, xpForDaily, xpForRun } from "./rules";
import type { Badge, Streak, XpAward } from "./types";

// XP awards and the event hooks other features call (F20 Runs, F22 Courses, F23 Daily Dive).
// Spec: docs/architecture/social.md. Every hook is idempotent: calling it twice for the same
// event awards nothing the second time. Pass your transaction as `db` so the award commits
// or rolls back with the event that earned it.

/** The shared client or a transaction. */
export type Db = postgres.Sql | postgres.TransactionSql;
type Tx = postgres.TransactionSql;

export type XpReason = "run_finished" | "topic_passed" | "topic_read" | "course_finished" | "daily_played";

const LOCK_CLASS = 727_002; // advisory lock namespace for XP awards (727_001 is migrations)

/** Runs fn in db if it's already a transaction, else in a new one. */
export async function inTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if ("savepoint" in db) return fn(db as Tx);
  return (db as postgres.Sql).begin((tx) => fn(tx)) as Promise<T>;
}

/** Serializes XP awards per Player until the transaction ends, so "award once" is race-free. */
async function lockPlayer(tx: Tx, playerId: string) {
  await tx`select pg_advisory_xact_lock(${LOCK_CLASS}, hashtext(${playerId}))`;
}

/** Inserts the award unless (player, reason, ref) already exists. Needs lockPlayer first. */
async function insertXp(tx: Tx, playerId: string, amount: number, reason: XpReason, ref: string, at?: Date): Promise<number> {
  if (!Number.isInteger(amount) || amount < 1) throw new Error(`Bad XP amount: ${amount}`);
  const rows = await tx<{ amount: number }[]>`
    insert into xp_events (at, player_id, amount, reason, ref)
    select coalesce(${at ?? null}::timestamptz, now()), ${playerId}, ${amount}, ${reason}, ${ref}
    where not exists (
      select 1 from xp_events where player_id = ${playerId} and reason = ${reason} and ref = ${ref})
    returning amount`;
  return rows[0]?.amount ?? 0;
}

/**
 * Awards XP once per (playerId, reason, ref). Returns the XP awarded: `amount`, or 0 if this
 * event was already awarded. Prefer the on* hooks below, which also evaluate Badges.
 */
export async function awardXp(
  playerId: string, amount: number, reason: XpReason, ref: string, db: Db = sql, at?: Date,
): Promise<number> {
  return inTx(db, async (tx) => {
    await lockPlayer(tx, playerId);
    return insertXp(tx, playerId, amount, reason, ref, at);
  });
}

export async function totalXp(playerId: string, db: Db = sql): Promise<number> {
  const [row] = await db<{ xp: number }[]>`
    select coalesce(sum(amount), 0)::int as xp from xp_events where player_id = ${playerId}`;
  return row.xp;
}

/** Current and longest Streak: Vancouver days with at least one finished Run. */
export async function streakFor(playerId: string, db: Db = sql, now = new Date()): Promise<Streak> {
  const rows = await db<{ day: string }[]>`
    select distinct to_char(at at time zone 'America/Vancouver', 'YYYY-MM-DD') as day
    from xp_events where player_id = ${playerId} and reason = 'run_finished' and at <= ${now}`;
  return computeStreak(rows.map((r) => r.day), vancouverDay(now));
}

/** Grants Badges the Player doesn't have yet; returns only the new ones. Unknown ids are skipped. */
async function grantBadges(tx: Tx, playerId: string, ids: string[], ref: string | null): Promise<Badge[]> {
  const known = [...new Set(ids)].filter((id) => badgeInfo(id));
  if (known.length === 0) return [];
  const rows = await tx<{ badge_id: string }[]>`
    insert into player_badges (player_id, badge_id, ref)
    select ${playerId}, unnest(${known}::text[]), ${ref}
    on conflict do nothing
    returning badge_id`;
  return rows.map((r) => badgeInfo(r.badge_id)!);
}

/**
 * Awards a Badge directly (e.g. F23's Daily Top 10 at the end of a day). Returns it if newly
 * earned, null if the Player already had it. Throws on an unknown id.
 */
export async function awardBadge(playerId: string, badgeId: string, ref: string | null = null, db: Db = sql): Promise<Badge | null> {
  if (!badgeInfo(badgeId)) throw new Error(`Unknown badge: ${badgeId}`);
  return inTx(db, async (tx) => (await grantBadges(tx, playerId, [badgeId], ref))[0] ?? null);
}

/** Shared tail of every hook: totals after the award, Level/Streak Badges, the result. */
async function settle(
  tx: Tx, playerId: string, before: number, awarded: number, extraBadges: string[], ref: string, now: Date,
): Promise<XpAward> {
  const total = before + awarded;
  const streak = await streakFor(playerId, tx, now);
  const levelBefore = levelFor(before).level;
  const levelAfter = levelFor(total).level;
  const newBadges = await grantBadges(tx, playerId, [...extraBadges, ...progressBadges(levelAfter, streak.longest)], ref);
  return { xpAwarded: awarded, totalXp: total, levelBefore, levelAfter, leveledUp: levelAfter > levelBefore, newBadges, streak };
}

async function hook(
  db: Db, playerId: string, award: { amount: number | ((tx: Tx, now: Date) => Promise<number>); reason: XpReason; ref: string; at?: Date },
  badges: (tx: Tx) => Promise<string[]>, now: Date,
): Promise<XpAward> {
  return inTx(db, async (tx) => {
    await lockPlayer(tx, playerId);
    const before = await totalXp(playerId, tx);
    const amount = typeof award.amount === "number" ? award.amount : await award.amount(tx, now);
    const awarded = await insertXp(tx, playerId, amount, award.reason, award.ref, award.at);
    return settle(tx, playerId, before, awarded, await badges(tx), award.ref, now);
  });
}

/**
 * Call once when a Run finishes, inside the transaction that finishes it:
 *   const award = await onRunFinished(playerId, { runId, ...summary }, tx);
 * `summary` is F20's RunSummary. Awards floor(score / 5) XP (5..200), then First Dive, Trench
 * Diver (a rare-tier Answer in this Run), Perfect Leap, Pairs Speedrun, Level and Streak
 * Badges. Abandoned Runs earn nothing: don't call it for them.
 */
export async function onRunFinished(playerId: string, summary: SocialRunSummary, db: Db = sql): Promise<XpAward> {
  const finishedAt = new Date(summary.finishedAt);
  if (Number.isNaN(finishedAt.getTime())) throw new Error(`Bad finishedAt: ${String(summary.finishedAt)}`);
  return hook(
    db, playerId,
    { amount: xpForRun(summary.score), reason: "run_finished", ref: summary.runId, at: finishedAt },
    async (tx) => {
      // Rare-tier Answers (Dive and Apogee); other Modes have no Tiers and count 0.
      // The time bound lets TimescaleDB skip old chunks: a Run never lasts a day.
      const [{ rare }] = await tx<{ rare: number }[]>`
        select count(*)::int as rare from guess_events
        where player_id = ${playerId} and run_id::text = ${summary.runId} and is_correct and tier = 'rare'
          and created_at between ${finishedAt}::timestamptz - interval '1 day' and ${finishedAt}::timestamptz + interval '1 minute'`;
      return runBadges(summary, rare);
    },
    new Date(Math.max(Date.now(), finishedAt.getTime())),
  );
}

/** F22: a Topic's Practice Game was passed for the first time. +150 XP and the Topic Badge. */
export async function onTopicPassed(playerId: string, topic: { course: string; topicNumber: number }, db: Db = sql): Promise<XpAward> {
  const badge = topicBadgeId(topic.course, topic.topicNumber);
  return hook(db, playerId, { amount: XP.topicPassed, reason: "topic_passed", ref: `${topic.course}:${topic.topicNumber}` },
    async () => [badge], new Date());
}

/** F22: the optional "mark as read" on a Topic reading. +20 XP once per Topic. */
export async function onTopicRead(playerId: string, topic: { course: string; topicNumber: number }, db: Db = sql): Promise<XpAward> {
  topicBadgeId(topic.course, topic.topicNumber); // validates the slug and number
  return hook(db, playerId, { amount: XP.topicRead, reason: "topic_read", ref: `${topic.course}:${topic.topicNumber}` },
    async () => [], new Date());
}

/** F22: every Topic of a Course passed. +500 XP and the Course Badge. */
export async function onCourseFinished(playerId: string, course: string, db: Db = sql): Promise<XpAward> {
  const badge = courseBadgeId(course);
  return hook(db, playerId, { amount: XP.courseFinished, reason: "course_finished", ref: course }, async () => [badge], new Date());
}

/**
 * F23: the Player's counted Daily Dive Run for `day` (YYYY-MM-DD, Vancouver) finished. Call it
 * after onRunFinished for that Run, so today already counts toward the Streak.
 * +50 XP, plus 5 per Streak day (bonus capped at 50). Once per day.
 */
export async function onDailyPlayed(playerId: string, day: string, db: Db = sql): Promise<XpAward> {
  return hook(
    db, playerId,
    { amount: async (tx, now) => xpForDaily((await streakFor(playerId, tx, now)).current), reason: "daily_played", ref: day },
    async () => [], new Date(),
  );
}
