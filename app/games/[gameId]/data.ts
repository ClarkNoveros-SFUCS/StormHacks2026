import "server-only";
import { lockedTopics, type ModeRecords } from "@/lib/courses/rules";
import { sql } from "@/lib/db";
import { getPlayerGame } from "@/lib/games/queries";
import type { GameStatus } from "@/lib/games/types";
import type { ModeId } from "@/lib/modes";
import { PASS_BAR_TEXT } from "@/lib/modes/rules";
import { dailyStats, mastery, masteryByTier, personalBest } from "@/lib/progress";
import { modeRunStats, type GamePageData, type PageTopic } from "./model";

// Everything /games/[gameId] shows, read for the signed-in Player. A Game is visible when
// the Player owns it (any status) or it's public (Course practice Games, the Daily Dive).
// Personal Best, Mastery and Runs are always the Player's own (lib/progress.ts).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_LIMIT = 60;

type GameRow = {
  id: string;
  title: string;
  mode: ModeId;
  status: GameStatus;
  error: string | null;
  prompt_count: number | null;
  created_at: Date;
};

/** Null when the Game doesn't exist or isn't the Player's and isn't public (treat as 404). */
export async function loadGamePage(playerId: string, gameId: string): Promise<GamePageData | null> {
  if (!UUID.test(gameId)) return null;

  // Owner first: getPlayerGame also marks a stuck generation as failed.
  const own = await getPlayerGame(playerId, gameId);
  let row: GameRow | undefined = own;
  let isPublic = false;
  if (!own) {
    [row] = await sql<GameRow[]>`
      select id, title, mode, status, error, prompt_count, created_at
        from games where id = ${gameId} and visibility = 'public'`;
    isPublic = true;
  }
  if (!row) return null;

  const [module] = own
    ? await sql<{ id: string; name: string }[]>`
        select id, name from modules where id = ${own.module_id} and player_id = ${playerId}`
    : [];

  const base: GamePageData["game"] = {
    id: row.id,
    title: row.title,
    mode: row.mode,
    status: row.status,
    error: row.error,
    promptCount: row.prompt_count,
    createdAt: row.created_at.toISOString(),
    isPublic,
    module: module ?? null,
    sources: own?.sources ?? [],
  };

  const empty = {
    personalBest: 0,
    mastery: { found: 0, total: 0, pct: 0 },
    byTier: { common: { found: 0, total: 0 }, solid: { found: 0, total: 0 }, deep: { found: 0, total: 0 }, rare: { found: 0, total: 0 } },
    modeStats: modeRunStats([]),
    runs: [],
    runCount: 0,
    daily: [],
  };
  if (row.status !== "ready") return { game: base, topic: null, ...empty };

  const [best, mast, byTier, runs, days, topic] = await Promise.all([
    personalBest(playerId, gameId),
    mastery(playerId, gameId),
    masteryByTier(playerId, gameId),
    sql<{ id: string; score: number; finished_at: Date; outcome: string | null; state: Record<string, unknown> | null }[]>`
      select id, score, finished_at, mode_state->>'outcome' as outcome, mode_state as state
        from runs
       where player_id = ${playerId} and game_id = ${gameId} and status = 'finished' and finished_at is not null
       order by finished_at desc`, // every finished Run: the Mode stats fold over all of them
    dailyStats(playerId, gameId, 30),
    isPublic ? topicFor(playerId, gameId, row.mode) : Promise.resolve(null),
  ]);

  const count = runs.length;
  return {
    game: base,
    topic,
    personalBest: best,
    mastery: mast,
    byTier,
    modeStats: modeRunStats(runs),
    runs: runs.slice(0, RUN_LIMIT).map((r, i) => ({
      runId: r.id,
      number: count - i,
      score: r.score,
      finishedAt: r.finished_at.toISOString(),
      outcome: r.outcome,
    })),
    runCount: count,
    daily: days.map((d) => ({ day: d.day.toISOString(), guesses: d.guesses, correct: d.correct, accuracy: d.accuracy })),
  };
}

/** The Course Topic this public Game practises, with the Player's lock and pass state. */
async function topicFor(playerId: string, gameId: string, mode: ModeId): Promise<PageTopic | null> {
  const [t] = await sql<{ topic_id: string; course_id: string; course_slug: string; course_title: string }[]>`
    select t.id as topic_id, c.id as course_id, c.slug as course_slug, c.title as course_title
      from topic_games tg
      join course_topics t on t.id = tg.topic_id
      join courses c on c.id = t.course_id
     where tg.game_id = ${gameId}`;
  if (!t) return null;
  const topics = await sql<{ id: string; position: number; slug: string; title: string; passed: boolean; modes: ModeRecords | null }[]>`
    select t.id, t.position, t.slug, t.title, (tp.passed_at is not null) as passed, tp.modes
      from course_topics t
      left join topic_progress tp on tp.topic_id = t.id and tp.player_id = ${playerId}
     where t.course_id = ${t.course_id}
     order by t.position`;
  const i = topics.findIndex((x) => x.id === t.topic_id);
  if (i === -1) return null;
  const locked = lockedTopics(topics.map((x) => x.passed));
  const me = topics[i];
  const prev = i > 0 ? topics[i - 1] : null;
  return {
    courseSlug: t.course_slug,
    courseTitle: t.course_title,
    number: me.position,
    slug: me.slug,
    title: me.title,
    locked: locked[i],
    passed: me.modes?.[mode]?.passed ?? false,
    passBar: PASS_BAR_TEXT[mode as keyof typeof PASS_BAR_TEXT] ?? "",
    prev: prev ? { number: prev.position, slug: prev.slug, title: prev.title } : null,
  };
}
