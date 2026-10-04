"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildHeatGrid, formatDay, monthLabels, parseDay, type HeatCell, type HeatDay } from "./heatmap-grid";

type Props = {
  /** One entry per active day; missing days are zero. */
  days: HeatDay[];
  weeks?: number;
  /** Last day shown (YYYY-MM-DD). Defaults to the latest day in `days`, else today (UTC). */
  endDate?: string;
  /** Unit for the tooltip, e.g. "dives". */
  unit?: string;
  className?: string;
};

const CELL = 12;
const GAP = 3;
const DOW = ["", "Mon", "", "Wed", "", "Fri", ""];

function prettyDate(d: string) {
  return new Date(parseDay(d)).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * GitHub-style activity grid: 7 rows × N weeks, five intensity levels in the signal colour.
 * Cells ripple in from the most recent day on mount; hover/focus shows a tooltip.
 */
export function Heatmap({ days, weeks = 52, endDate, unit = "dives", className = "" }: Props) {
  const [today] = useState(() => formatDay(Date.now()));
  const end = endDate ?? (days.length ? days.reduce((m, d) => (d.date > m ? d.date : m), days[0].date) : today);
  const cols = useMemo(() => buildHeatGrid(days, weeks, end), [days, weeks, end]);
  const months = useMemo(() => monthLabels(cols), [cols]);
  const total = days.reduce((s, d) => s + d.count, 0);
  const scroller = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ cell: HeatCell; x: number; y: number } | null>(null);

  // Start scrolled to the most recent weeks on narrow screens.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const width = weeks * (CELL + GAP);
  const show = (cell: HeatCell, el: Element) => {
    const host = scroller.current?.parentElement?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (host) setTip({ cell, x: r.left - host.left + r.width / 2, y: r.top - host.top });
  };

  return (
    <div className={`relative ${className}`}>
      <div ref={scroller} className="overflow-x-auto pb-2" onMouseLeave={() => setTip(null)}>
        <div className="flex gap-2" style={{ width: width + 32 }}>
          <div className="flex flex-col pt-5 text-[10px] text-faint" style={{ gap: GAP }}>
            {DOW.map((d, i) => (
              <span key={i} style={{ height: CELL, lineHeight: `${CELL}px` }}>
                {d}
              </span>
            ))}
          </div>
          <div>
            <div className="relative h-5 text-[10px] text-faint">
              {months.map(([i, m]) => (
                <span key={`${i}${m}`} className="absolute top-0" style={{ left: i * (CELL + GAP) }}>
                  {m}
                </span>
              ))}
            </div>
            <div role="grid" aria-label={`Activity over the last ${weeks} weeks: ${total} ${unit}`} className="flex" style={{ gap: GAP }}>
              {cols.map((col, w) => (
                <div role="row" key={w} className="flex flex-col" style={{ gap: GAP }}>
                  {col.map((cell, d) => (
                    <span
                      key={cell.date}
                      role="gridcell"
                      tabIndex={cell.future ? -1 : 0}
                      aria-label={`${prettyDate(cell.date)}: ${cell.count} ${unit}`}
                      onMouseEnter={(e) => !cell.future && show(cell, e.currentTarget)}
                      onFocus={(e) => !cell.future && show(cell, e.currentTarget)}
                      onBlur={() => setTip(null)}
                      className="rounded-[3px] outline-offset-1 transition-transform hover:scale-125"
                      style={{
                        width: CELL,
                        height: CELL,
                        background: cell.future ? "transparent" : `var(--heat-${cell.level})`,
                        boxShadow: cell.level === 4 ? "0 0 6px color-mix(in srgb, var(--heat-4) 60%, transparent)" : undefined,
                        animation: `ripple-in .45s var(--ease-snap) ${((weeks - 1 - w) * 7 + (6 - d)) * 2}ms both`,
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-faint">
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: `var(--heat-${l})` }} />
        ))}
        More
      </div>
      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 w-max -translate-x-1/2 -translate-y-full rounded-sm border border-border-strong bg-bg-2 px-2.5 py-1.5 text-xs text-text shadow-xl"
          style={{ left: tip.x, top: tip.y - 6 }}
        >
          <span className="font-display">
            {tip.cell.count} {unit}
          </span>
          {tip.cell.xp > 0 && <span className="text-reward"> · +{tip.cell.xp} XP</span>}
          <span className="block text-muted">{prettyDate(tip.cell.date)}</span>
        </div>
      )}
    </div>
  );
}
