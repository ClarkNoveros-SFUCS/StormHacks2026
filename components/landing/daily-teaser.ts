// The Daily Dive teaser on the landing page and the home dashboard. Client-safe.
// Server pages pass today's real puzzle from F23's dailyToday() (GET /api/daily/today, works
// signed out); only its first Prompt is shown (decision Q24). With no puzzle (or the Daily
// backend unreachable) it falls back to a static sample.
import { MISS_SQUARE, TIER_SQUARES } from "@/lib/daily/share";
import type { DailyToday } from "@/lib/daily/types";
import { TIME_ZONE, vancouverDay } from "@/lib/social/days";

/** Daily #1 is the launch day (decision Q23). */
export const DAILY_EPOCH = "2026-10-04";

export type DailyTeaser = {
  /** Daily number: 1 on 2026-10-04, counting Vancouver days. */
  number: number;
  /** Vancouver day, YYYY-MM-DD. */
  day: string;
  /** Today's first Prompt. */
  prompt: string;
  /** The puzzle's title and theme (real puzzles only). */
  title?: string;
  theme?: string;
  /** Example correct Answers by Tier. The UI shows them only while isSample: never spoil the real puzzle. */
  examples: { answer: string; tier: 1 | 2 | 3 | 4 }[];
  /** True while this is static sample content rather than the real puzzle. */
  isSample: boolean;
};

export function dailyNumber(day: string): number {
  const ms = Date.parse(`${day}T00:00:00Z`) - Date.parse(`${DAILY_EPOCH}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/** Today's Daily Dive teaser: the real puzzle when given, else the static sample. */
export function getDailyTeaser(daily: Pick<DailyToday, "number" | "day" | "teaser" | "title" | "theme"> | null = null, now = new Date()): DailyTeaser {
  if (daily) {
    return { number: daily.number, day: daily.day, prompt: daily.teaser, title: daily.title, theme: daily.theme, examples: [], isSample: false };
  }
  const day = vancouverDay(now);
  return {
    number: dailyNumber(day),
    day,
    // Launch day is CS-themed (Q23); this is a sample in that spirit.
    prompt: "Name a programming language that is older than the World Wide Web (1989).",
    examples: [
      { answer: "C", tier: 1 },
      { answer: "Pascal", tier: 2 },
      { answer: "Smalltalk", tier: 3 },
      { answer: "APL", tier: 4 },
    ],
    isSample: true,
  };
}

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Milliseconds until the next America/Vancouver midnight (when the next Daily starts). */
export function msUntilNextDaily(now = new Date()): number {
  const [h, m, s] = clock.format(now).split(":").map(Number);
  const elapsed = ((h * 60 + m) * 60 + s) * 1000 + now.getMilliseconds();
  return Math.max(0, 86_400_000 - elapsed);
}

export function formatCountdown(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Tier squares for the Wordle-style share line, by band (1 Shallows … 4 Trench): the same as F23's share text. */
export const SHARE_SQUARES = { 1: TIER_SQUARES.common, 2: TIER_SQUARES.solid, 3: TIER_SQUARES.deep, 4: TIER_SQUARES.rare, miss: MISS_SQUARE } as const;
