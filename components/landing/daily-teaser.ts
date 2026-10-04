// The Daily Dive teaser on the landing page and the home dashboard. Client-safe.
// TODO(F23 #36): replace getDailyTeaser()'s static sample with today's real puzzle (its first
// Prompt only, decision Q24) once the Daily Dive backend exists, e.g. from getDailyGame(day).
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
  /** Example correct Answers by Tier. The UI shows them only while isSample: never spoil the real puzzle. */
  examples: { answer: string; tier: 1 | 2 | 3 | 4 }[];
  /** True while this is static sample content rather than the real puzzle. */
  isSample: boolean;
};

export function dailyNumber(day: string): number {
  const ms = Date.parse(`${day}T00:00:00Z`) - Date.parse(`${DAILY_EPOCH}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/** Today's Daily Dive teaser. Static sample until F23 ships (see the TODO at the top). */
export function getDailyTeaser(now = new Date()): DailyTeaser {
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

/** Tier squares for the Wordle-style share line (decisions §7): one per Prompt, a miss is ⬛. */
export const SHARE_SQUARES = { 1: "🟦", 2: "🟩", 3: "🟪", 4: "🟨", miss: "⬛" } as const;
