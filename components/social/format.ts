// Pure formatting helpers for the social pages (F26). Client-safe, unit-tested.
import { TIME_ZONE } from "@/lib/social/days";

/** "Oct 4" etc. for a YYYY-MM-DD day, without the viewer's time zone shifting it. */
export function formatDay(day: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** Heatmap tooltip: "3 runs · 120 XP on Oct 4". */
export function heatTip(d: { runs: number; xp: number; day: string }): string {
  const when = formatDay(d.day, { month: "short", day: "numeric" });
  if (d.runs === 0 && d.xp === 0) return `No activity on ${when}`;
  return `${plural(d.runs, "run")} · ${d.xp.toLocaleString("en-US")} XP on ${when}`;
}

/** "Joined October 2026". */
export function joinedText(iso: string): string {
  return `Joined ${new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: TIME_ZONE })}`;
}

/** "just now", "5m ago", "3h ago", "2d ago", else "Oct 4". */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TIME_ZONE });
}

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Milliseconds until the weekly XP board resets: the next Monday 00:00 in Vancouver (F21's
 * weeks are Monday-first Vancouver weeks). Ignores a DST shift inside the window (±1 h).
 */
export function msUntilWeeklyReset(now = new Date()): number {
  const parts = Object.fromEntries(clock.formatToParts(now).map((p) => [p.type, p.value]));
  const dow = DOW[parts.weekday] ?? 0;
  const elapsed = ((Number(parts.hour) * 60 + Number(parts.minute)) * 60 + Number(parts.second)) * 1000 + now.getMilliseconds();
  const daysAfterMidnight = (7 - dow) % 7; // Sunday → 0 (tonight is Monday), Monday → 6
  return 86_400_000 - elapsed + daysAfterMidnight * 86_400_000;
}

/** "2d 04:12:09" or "04:12:09". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86_400);
  const hh = Math.floor((total % 86_400) / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const hms = [hh, mm, ss].map((n) => String(n).padStart(2, "0")).join(":");
  return d > 0 ? `${d}d ${hms}` : hms;
}
