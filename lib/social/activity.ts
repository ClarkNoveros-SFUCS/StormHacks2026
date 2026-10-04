import "server-only";
import { sql } from "@/lib/db";
import { addDays, vancouverDay } from "./days";
import { heatLevel } from "./rules";
import type { Heatmap, HeatmapDay } from "./types";
import type { Db } from "./xp";

/** Days in the heatmap: 52 full weeks before this one, plus this week up to today. */
export function heatmapRange(now: Date): { from: string; to: string } {
  const to = vancouverDay(now);
  const dow = new Date(`${to}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return { from: addDays(to, -(52 * 7 + dow)), to };
}

/**
 * The GitHub-style activity grid for the last 53 weeks (Vancouver days, Sunday-first columns).
 * Reads the `player_activity_daily` continuous aggregate (real-time, so a Run just finished
 * shows) with `time_bucket_gapfill`, so days without play come back as 0.
 */
export async function heatmap(playerId: string, db: Db = sql, now = new Date()): Promise<Heatmap> {
  const { from, to } = heatmapRange(now);
  const rows = await db<{ day: string; xp: number; runs: number }[]>`
    with bounds as (
      select (${from}::date::timestamp at time zone 'America/Vancouver') as lo,
             ((${to}::date + 1)::timestamp at time zone 'America/Vancouver') as hi
    )
    select to_char(g.d at time zone 'America/Vancouver', 'YYYY-MM-DD') as day, g.xp, g.runs
    from (
      select time_bucket_gapfill('1 day', a.day, 'America/Vancouver', b.lo, b.hi) as d,
             coalesce(sum(a.xp), 0)::int as xp,
             coalesce(sum(a.runs), 0)::int as runs
      from player_activity_daily a, bounds b
      where a.player_id = ${playerId} and a.day >= b.lo and a.day < b.hi
      group by 1
    ) g
    order by g.d`;

  // Build the grid from the range itself, so it always has every day exactly once.
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const days: HeatmapDay[] = [];
  let totalXp = 0, totalRuns = 0, activeDays = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = byDay.get(d);
    const xp = r?.xp ?? 0, runs = r?.runs ?? 0;
    days.push({ day: d, xp, runs, level: heatLevel(xp) });
    totalXp += xp;
    totalRuns += runs;
    if (xp > 0) activeDays++;
  }
  return { from, to, days, totalXp, totalRuns, activeDays };
}
