// Daily Dive calendar: America/Vancouver days and midnights. Pure and client-safe.
// A "day" is a YYYY-MM-DD string in America/Vancouver, the same days lib/social/days.ts and
// the continuous aggregates use. Vancouver changes clocks at 02:00, so midnight always exists
// exactly once (days are 23 or 25 hours long around DST, never ambiguous at 00:00).

import { addDays, TIME_ZONE, vancouverDay } from "../social/days.ts";

export { addDays, isDay, TIME_ZONE, vancouverDay } from "../social/days.ts";

/** Daily #1 went live on this day (Q23). */
export const DAILY_EPOCH = "2026-10-04";

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Vancouver's offset from UTC at an instant, in ms (−7 h in summer, −8 h in winter). */
function offsetMs(at: Date): number {
  const p = Object.fromEntries(parts.formatToParts(at).map((x) => [x.type, x.value]));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant a Vancouver day starts (its 00:00). */
export function startOfVancouverDay(day: string): Date {
  const midnightUtc = Date.parse(`${day}T00:00:00Z`);
  // Two passes: the offset at the first guess can differ from the offset at midnight only
  // when a DST change falls between them.
  let t = midnightUtc - offsetMs(new Date(midnightUtc));
  t = midnightUtc - offsetMs(new Date(t));
  return new Date(t);
}

/** When the next Daily goes live: the next Vancouver midnight after `now`. */
export function nextVancouverMidnight(now: Date): Date {
  return startOfVancouverDay(addDays(vancouverDay(now), 1));
}

/** Today's Vancouver day. */
export function dailyDay(now: Date): string {
  return vancouverDay(now);
}
