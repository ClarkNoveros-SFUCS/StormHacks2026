// Daily Dive display helpers (F28). Pure and client-safe; tested in format.test.ts.
import type { CrowdReveal, DailyToday } from "@/lib/daily/types";

/** HH:MM:SS parts of a duration.  */
export function clockParts(ms: number): [string, string, string] {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.min(99, Math.floor(total / 3600));
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, "0")) as [string, string, string];
}

/** "Sunday, Oct 4" for a Vancouver day (YYYY-MM-DD). */
export function dayLabel(day: string, opts: { weekday?: boolean } = {}): string {
  const d = new Date(`${day}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: opts.weekday === false ? undefined : "long",
    month: "short",
    day: "numeric",
  });
}

/** "−1,400 m" from points (10 m per point, true minus sign); 0 → "0 m". */
export function metres(points: number): string {
  const m = Math.max(0, Math.round(points)) * 10;
  return m === 0 ? "0 m" : `−${m.toLocaleString("en-US")} m`;
}

/** The Reveal's crowd caption, Krillion style. */
export function crowdCaption(crowd: Pick<CrowdReveal, "players" | "betterThanPct">, counted: boolean): string {
  if (crowd.players === 0 || crowd.betterThanPct === null) {
    return counted ? "YOU'RE THE FIRST DIVER TODAY" : "NOBODY HAS COUNTED A DIVE YET TODAY";
  }
  if (counted && crowd.players === 1) return "YOU'RE THE FIRST DIVER TODAY";
  return counted
    ? `BETTER THAN ${crowd.betterThanPct}% OF TODAY'S PLAYERS`
    : `PRACTICE · WOULD BEAT ${crowd.betterThanPct}% OF TODAY'S PLAYERS`;
}

/** The histogram as weighted points for the distribution curve: bucket middles, weighted by count. */
export function histogramPoints(crowd: Pick<CrowdReveal, "histogram" | "bucketSize">): { values: number[]; weights: number[] } {
  const used = crowd.histogram.filter((h) => h.count > 0);
  return { values: used.map((h) => h.bucket + crowd.bucketSize / 2), weights: used.map((h) => h.count) };
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Look up "% of players found this" for an Answer of the Prompt at `position`. Matches the
 * canonical text; a single-answer Prompt (one rate at that position) matches by position alone.
 * Null when there's no crowd yet.
 */
export function findRateLookup(crowd: Pick<CrowdReveal, "players" | "answerFindRates"> | null | undefined) {
  if (!crowd || crowd.players === 0) return () => null;
  const byText = new Map<string, number>();
  const byPosition = new Map<number, number[]>();
  for (const r of crowd.answerFindRates) {
    byText.set(`${r.position}:${norm(r.answer)}`, r.pct);
    byPosition.set(r.position, [...(byPosition.get(r.position) ?? []), r.pct]);
  }
  return (position: number, answer?: string | null): number | null => {
    if (answer != null) {
      const hit = byText.get(`${position}:${norm(answer)}`);
      if (hit !== undefined) return hit;
    }
    const at = byPosition.get(position);
    return at && at.length === 1 ? at[0] : null;
  };
}

/** What Lumen says on the hub. */
export function lumenLine(daily: Pick<DailyToday, "theme" | "players" | "me">, betterThanPct: number | null): string {
  const me = daily.me;
  if (!me) return "Same seven prompts for everyone today. Sign in and show me how deep you can go!";
  if (me.status === "in_progress") return "Your dive is still down there. Want to finish it before midnight?";
  if (me.status === "not_played") {
    if (me.dailyStreak.current > 0) return `${me.dailyStreak.current}-day Daily streak! Keep the lantern lit: today's theme is ${daily.theme}.`;
    return `Today's theme is ${daily.theme}. One counted dive. Rarer answers sink deeper!`;
  }
  if (daily.players <= 1) return "First one down today! Share your grid and see who can beat it.";
  if (betterThanPct !== null && betterThanPct >= 75) return `Trench-level work! Deeper than ${betterThanPct}% of today's divers.`;
  if (betterThanPct !== null && betterThanPct >= 40) return "Solid dive. Replays are practice, but they still find new answers.";
  return "Every dive maps more of the ocean. Practice runs are open all day!";
}
