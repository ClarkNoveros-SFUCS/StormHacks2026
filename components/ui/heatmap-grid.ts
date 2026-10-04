// Pure helpers for the activity heatmap (GitHub-style). Dates are 'YYYY-MM-DD' calendar days,
// handled in UTC so the grid never shifts with the viewer's timezone.

export type HeatDay = { date: string; count: number; xp?: number };
export type HeatCell = { date: string; count: number; xp: number; level: 0 | 1 | 2 | 3 | 4; future: boolean };

const DAY = 86_400_000;

export function parseDay(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}
export function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Intensity 0–4 relative to the busiest day (any activity is at least 1). */
export function levelFor(count: number, max: number): HeatCell["level"] {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4))) as HeatCell["level"];
}

/**
 * Columns of 7 cells (Sunday → Saturday), oldest week first, ending with the week that
 * contains `endDate`. Days after endDate in the last column are marked `future`.
 */
export function buildHeatGrid(days: HeatDay[], weeks: number, endDate: string): HeatCell[][] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const max = days.reduce((m, d) => Math.max(m, d.count), 0);
  const end = parseDay(endDate);
  const endDow = new Date(end).getUTCDay();
  const start = end - (endDow + (weeks - 1) * 7) * DAY;
  const cols: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const ms = start + (w * 7 + d) * DAY;
      const date = formatDay(ms);
      const hit = byDate.get(date);
      col.push({
        date,
        count: hit?.count ?? 0,
        xp: hit?.xp ?? 0,
        level: levelFor(hit?.count ?? 0, max),
        future: ms > end,
      });
    }
    cols.push(col);
  }
  return cols;
}

/** Month labels: [columnIndex, "Jan"] where a new month starts in that column's first day. */
export function monthLabels(cols: HeatCell[][]): [number, string][] {
  const out: [number, string][] = [];
  let last = -1;
  cols.forEach((col, i) => {
    const m = new Date(parseDay(col[0].date)).getUTCMonth();
    if (m !== last) {
      out.push([i, new Date(parseDay(col[0].date)).toLocaleString("en", { month: "short", timeZone: "UTC" })]);
      last = m;
    }
  });
  // Drop a label squeezed into the first two columns when the next one follows right after.
  if (out.length > 1 && out[1][0] - out[0][0] < 3) out.shift();
  return out;
}
