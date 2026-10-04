// Daily Dive API shapes. Plain types, safe to import from client components.
// Spec: docs/architecture/daily-dive.md § API.
import type { Leaderboard, Streak } from "../social/types.ts";
import type { Tier } from "../scoring/tiers.ts";

export type { Leaderboard, Streak, Tier };

/** Per Prompt in play order: the Tier it scored at, or null for a miss. The share grid. */
export type ShareTiers = (Tier | null)[];

/** not_played: no Run on today's puzzle yet · in_progress: a Run to resume · counted: today's result is in. */
export type DailyStatus = "not_played" | "in_progress" | "counted";

/** A Player's counted Run for one day. */
export type DailyResult = {
  runId: string;
  score: number;
  /** score × 10, the metres the Dive screens show */
  depth: number;
  finishedAt: string;
  tiers: ShareTiers;
  shareText: string;
};

/** GET /api/daily/today → { daily: DailyToday } (works signed out: `me` is null). */
export type DailyToday = {
  number: number; //          "Daily #N"
  day: string; //             YYYY-MM-DD, America/Vancouver
  theme: string;
  title: string;
  gameId: string;
  /** The first Prompt's text, for the landing page and the hub card. */
  teaser: string;
  promptCount: number; //     7
  /** Counted Runs so far today. */
  players: number;
  /** ISO: the next Vancouver midnight, when the next Daily goes live (the countdown target). */
  nextAt: string;
  serverNow: string;
  me: {
    status: DailyStatus;
    /** The Run to resume when in_progress, the counted Run when counted, else null. */
    runId: string | null;
    result: DailyResult | null;
    /** Days in a row with any finished Run (F21's Streak). */
    streak: Streak;
    /** Days in a row with a counted Daily Run. */
    dailyStreak: Streak;
  } | null;
};

/** POST /api/daily/today/run → resumes the in-progress Run on today's puzzle, else starts one. */
export type DailyRunResponse = {
  runId: string;
  resumed: boolean;
  /** False: today's counted Run is already in, so this one is practice (no daily_results, normal Run XP). */
  counted: boolean;
  number: number;
  day: string;
};

/** GET /api/daily/leaderboard?day=&scope=&limit= */
export type DailyLeaderboardResponse = {
  daily: { number: number; day: string; title: string; gameId: string };
  /** F21 board: value = score of each Player's counted Run, `at` = its finish time. */
  leaderboard: Leaderboard;
};

/** One past (or today's) puzzle in GET /api/daily/archive → { days: DailyArchiveEntry[] }, newest first. */
export type DailyArchiveEntry = {
  number: number;
  day: string;
  theme: string;
  title: string;
  /** Play it as practice: POST /api/games/[gameId]/runs (today's: POST /api/daily/today/run). */
  gameId: string;
  isToday: boolean;
  players: number;
  me: {
    counted: { score: number; depth: number; finishedAt: string; tiers: ShareTiers } | null;
    /** Best finished Run on this puzzle, counted or practice. */
    bestScore: number | null;
    runs: number;
  } | null;
};

/** Reveal.daily: set on every Run of a Daily puzzle's Game, else null. */
export type DailyReveal = {
  number: number;
  day: string;
  title: string;
  /** This Run is the Player's counted Run for that day (false = practice). */
  counted: boolean;
  tiers: ShareTiers;
  /** Ready to copy; a practice Run's header says "(practice)". */
  shareText: string;
};

/** Reveal.crowd: the day's counted Runs, from the continuous aggregates. Null outside the Daily. */
export type CrowdReveal = {
  /** Counted Runs that day. */
  players: number;
  /** % of that day's players who scored less than this Run (0–100), null when nobody counted yet. */
  betterThanPct: number | null;
  /** The day's median score (approx_percentile 0.5), null when nobody counted yet. */
  medianScore: number | null;
  /** Width of a histogram bucket, in points (×10 for metres). */
  bucketSize: number;
  /** Counted scores per bucket: `bucket` is the lower bound in points (0, 50, 100, …), up to the highest bucket in use. */
  histogram: { bucket: number; count: number }[];
  /** Per Answer: % of that day's players whose counted Run found it. `position` = the Prompt's place in the Run. */
  answerFindRates: { answerId: string; position: number; answer: string; pct: number }[];
};
