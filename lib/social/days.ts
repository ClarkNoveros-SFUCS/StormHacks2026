// Vancouver calendar days and the Streak. Pure.
// A "day" here is a YYYY-MM-DD string in America/Vancouver (StormHacks is at SFU), the same
// days the continuous aggregates bucket by.
import type { Streak } from "./types";

export const TIME_ZONE = "America/Vancouver";

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Vancouver calendar day an instant falls on, as YYYY-MM-DD. */
export function vancouverDay(at: Date): string {
  return dayFormat.format(at); // en-CA formats as YYYY-MM-DD
}

/** Calendar arithmetic on YYYY-MM-DD strings (no time zone involved). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isDay(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && addDays(s, 0) === s;
}

/**
 * Streak from the set of days with at least one finished Run.
 * `current` counts back from today if today is played, else from yesterday (the flame stays
 * lit until today ends); it is 0 if neither was played. `longest` is the longest run ever.
 */
export function computeStreak(activeDays: Iterable<string>, today: string): Streak {
  const days = new Set(activeDays);
  const sorted = [...days].filter((d) => d <= today).sort();

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }

  const playedToday = days.has(today);
  let current = 0;
  let cursor = playedToday ? today : addDays(today, -1);
  while (days.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, longest, playedToday };
}
