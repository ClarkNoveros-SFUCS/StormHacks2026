import "server-only";
import type postgres from "postgres";
import type { RunSummary } from "@/lib/runs/types";
import { TIER_BELOW, type Tier } from "@/lib/scoring/tiers";
import { onDailyPlayed } from "@/lib/social/xp";
import { vancouverDay } from "./days";
import { shareText } from "./share";
import type { CrowdReveal, DailyReveal, ShareTiers } from "./types";

// The Daily's part of the run engine (lib/runs/run-engine.ts), inside its transaction:
// recordDailyRun() when a Run finishes, dailyReveal() for the Reveal. Spec: daily-dive.md.

type Tx = postgres.TransactionSql;
type Db = postgres.Sql | postgres.TransactionSql;

/** Histogram bucket width in points (500 m). Must match histogram(score, 0, 1000, 20) in the migration. */
export const BUCKET_SIZE = 50;
const HIST_MAX = 1000;

export type DailyPuzzleRef = { number: number; day: string | null; title: string; status: "pool" | "scheduled" | "live" };

/** The Daily puzzle a Game belongs to, or null for any other Game. */
export async function puzzleForGame(db: Db, gameId: string): Promise<DailyPuzzleRef | null> {
  const [p] = await db<DailyPuzzleRef[]>`
    select number, to_char(day, 'YYYY-MM-DD') as day, title, status from daily_puzzles where game_id = ${gameId}`;
  return p ?? null;
}

/**
 * The share grid of a Run: per Prompt in play order, the Tier it scored at (an Open Prompt:
 * its Answer's Tier; a single-answer Prompt: its Tier, one lower after a Hint), null if missed.
 */
export async function runTiers(db: Db, runId: string): Promise<ShareTiers> {
  const rows = await db<{ outcome: string | null; hint_used: boolean; kind: string; prompt_tier: Tier | null; answer_tier: Tier | null }[]>`
    select rp.outcome, rp.hint_used, p.kind, p.tier as prompt_tier, a.tier as answer_tier
      from run_prompts rp join prompts p on p.id = rp.prompt_id left join answers a on a.id = rp.answer_id
     where rp.run_id = ${runId} order by rp.position`;
  return rows.map((r) => {
    if (r.outcome !== "correct") return null;
    if (r.kind === "open") return r.answer_tier;
    const tier = r.prompt_tier ?? r.answer_tier;
    return tier && r.hint_used ? (TIER_BELOW[tier] ?? "common") : tier;
  });
}

/**
 * Called by afterFinish() for every finished Run, after the Run XP and the Course step.
 * A Run on a live Daily puzzle that finished on the puzzle's own (Vancouver) day is the
 * Player's Counted Run if it's their first: it writes daily_results (UNIQUE (player_id, day)
 * makes "first" race-free), copies the Answers it found from guess_events into
 * daily_answer_finds, and awards Daily XP (onDailyPlayed). Anything else is a Practice Run:
 * nothing here. Returns whether this Run was counted.
 */
export async function recordDailyRun(
  tx: Tx, run: { id: string; playerId: string; gameId: string; startedAt: Date; finishedAt: Date }, summary: RunSummary,
): Promise<boolean> {
  const puzzle = await puzzleForGame(tx, run.gameId);
  if (!puzzle || puzzle.status !== "live" || puzzle.day === null) return false;
  if (vancouverDay(run.finishedAt) !== puzzle.day) return false;

  const tiers = await runTiers(tx, run.id);
  const inserted = await tx`
    insert into daily_results (day, player_id, number, run_id, score, finished_at, tiers)
    values (${puzzle.day}, ${run.playerId}, ${puzzle.number}, ${run.id}, ${summary.score}, ${run.finishedAt}, ${tx.json(tiers)})
    on conflict (player_id, day) do nothing
    returning run_id`;
  if (inserted.length === 0) return false;

  await tx`
    insert into daily_answer_finds (day, player_id, answer_id)
    select distinct ${puzzle.day}::date, ${run.playerId}, matched_answer_id from guess_events
     where player_id = ${run.playerId} and run_id = ${run.id} and is_correct and matched_answer_id is not null
       and created_at >= ${run.startedAt} and created_at <= ${run.finishedAt}
    on conflict do nothing`;
  await onDailyPlayed(run.playerId, puzzle.day, tx);
  return true;
}

/** Reveal.daily and Reveal.crowd for a finished Run; both null unless its Game is a Daily puzzle. */
export async function dailyReveal(
  db: Db, playerId: string, run: { id: string; gameId: string; score: number },
): Promise<{ daily: DailyReveal | null; crowd: CrowdReveal | null }> {
  const puzzle = await puzzleForGame(db, run.gameId);
  if (!puzzle || puzzle.day === null) return { daily: null, crowd: null };
  const [own] = await db<{ run_id: string }[]>`
    select run_id from daily_results where player_id = ${playerId} and day = ${puzzle.day}`;
  const counted = own?.run_id === run.id;
  const tiers = await runTiers(db, run.id);
  return {
    daily: {
      number: puzzle.number, day: puzzle.day, title: puzzle.title, counted, tiers,
      shareText: shareText({ number: puzzle.number, score: run.score, tiers, counted }),
    },
    crowd: await crowdStats(db, puzzle.day, run),
  };
}

/** The day's counted Runs from the continuous aggregates, and where `run` sits among them. */
export async function crowdStats(db: Db, day: string, run: { id: string; score: number }): Promise<CrowdReveal> {
  const [stats] = await db<{ players: number; below: number; median: number; hist: number[]; top: number }[]>`
    select players::int, approx_percentile_rank(${run.score - 0.5}::float8, pct) as below,
           approx_percentile(0.5, pct) as median, hist, top
      from daily_score_stats where day = ${day}`;
  const players = stats?.players ?? 0;

  const lastBucket = Math.floor(Math.min(HIST_MAX, Math.max(run.score, stats?.top ?? 0)) / BUCKET_SIZE);
  const histogram = Array.from({ length: lastBucket + 1 }, (_, i) => ({
    bucket: i * BUCKET_SIZE,
    // hist[0] counts scores below 0 (none), hist[1..20] the buckets, hist[21] scores of 1000+
    count: stats ? Number(stats.hist[i + 1] ?? 0) : 0,
  }));

  const answers = await db<{ answer_id: string; position: number; canonical: string; finds: number }[]>`
    select a.id as answer_id, rp.position, a.canonical, coalesce(r.finds, 0)::int as finds
      from run_prompts rp
      join answers a on a.prompt_id = rp.prompt_id
      left join daily_answer_rates r on r.answer_id = a.id and r.day = ${day}
     where rp.run_id = ${run.id}
     order by rp.position, a.rarity_rank nulls last, a.canonical`;

  return {
    players,
    betterThanPct: players ? Math.round(Math.min(1, Math.max(0, stats!.below)) * 100) : null,
    medianScore: players ? Math.round(stats!.median) : null,
    bucketSize: BUCKET_SIZE,
    histogram,
    answerFindRates: answers.map((a) => ({
      answerId: a.answer_id, position: a.position, answer: a.canonical,
      pct: players ? Math.round((100 * a.finds) / players) : 0,
    })),
  };
}
