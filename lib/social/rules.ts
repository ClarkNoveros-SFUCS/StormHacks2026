// XP, Levels, Ranks and heatmap intensity. Pure and client-safe.
// Spec: docs/architecture/social.md (decisions §6).
import { RANKS, type LevelInfo, type RankName } from "./types";

/** XP amounts. A Run's XP comes from xpForRun. */
export const XP = {
  runMin: 5,
  runMax: 200,
  runDivisor: 5,
  topicPassed: 150,
  courseFinished: 500,
  topicRead: 20,
  dailyPlayed: 50,
  dailyPerStreakDay: 5,
  dailyStreakCap: 50,
} as const;

/** Run finished: floor(score / 5), at least 5 and at most 200 (so a 0-point Run still earns 5). */
export function xpForRun(score: number): number {
  const raw = Math.floor(Math.max(0, score) / XP.runDivisor);
  return Math.min(XP.runMax, Math.max(XP.runMin, raw));
}

/** Daily Dive played: 50, plus 5 per day of the current streak, the bonus capped at 50. */
export function xpForDaily(streakDays: number): number {
  return XP.dailyPlayed + Math.min(XP.dailyStreakCap, XP.dailyPerStreakDay * Math.max(0, streakDays));
}

/**
 * Total XP at which a Level begins: 50·(n−1)·n, so L1 0, L2 100, L3 300, L4 600, L5 1000.
 * (Decisions §6 writes 50·n·(n+1) but lists L2 at 100; the listed values win.)
 */
export function levelStartXp(level: number): number {
  return 50 * (level - 1) * level;
}

export function rankFor(level: number): RankName {
  let name: RankName = RANKS[0].name;
  for (const r of RANKS) if (level >= r.minLevel) name = r.name;
  return name;
}

export function levelFor(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  // Solve 50·(n−1)·n ≤ xp for the largest n, then fix any float rounding at the boundary
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2));
  while (levelStartXp(level + 1) <= xp) level++;
  while (level > 1 && levelStartXp(level) > xp) level--;
  const start = levelStartXp(level);
  const next = levelStartXp(level + 1);
  return {
    level,
    totalXp: xp,
    levelStartXp: start,
    nextLevelXp: next,
    xpIntoLevel: xp - start,
    xpForNext: next - start,
    rank: rankFor(level),
  };
}

/** Heatmap cell intensity from a day's XP: 0 none, 1 < 40, 2 < 100, 3 < 200, 4 ≥ 200. */
export function heatLevel(xp: number): 0 | 1 | 2 | 3 | 4 {
  if (xp <= 0) return 0;
  if (xp < 40) return 1;
  if (xp < 100) return 2;
  if (xp < 200) return 3;
  return 4;
}
