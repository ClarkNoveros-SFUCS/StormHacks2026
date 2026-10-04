"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { StreakFlame } from "@/components/ui";
import type { Heatmap, Streak } from "@/lib/social/types";
import { formatDay as fmt, heatTip as tipText, plural } from "./format";

// The profile's activity heatmap (decision Q12): F21's 53-week grid (day i → column floor(i/7),
// row i%7, Sunday on top), intensity by XP. Cells ripple in from today; hover, focus or arrow
// keys show "3 runs · 120 XP on Oct 4".

const CELL = 12;
const GAP = 3;
const DOW = ["", "Mon", "", "Wed", "", "Fri", ""];

export function ActivityHeatmap({ heatmap, streak }: { heatmap: Heatmap; streak: Streak }) {
  const days = heatmap.days;
  const weeks = Math.ceil(days.length / 7);
  const scroller = useRef<HTMLDivElement>(null);
  const cells = useRef<(HTMLSpanElement | null)[]>([]);
  const [active, setActive] = useState(days.length - 1);
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null);

  const months = useMemo(() => {
    const out: { col: number; label: string }[] = [];
    let last = "";
    for (let c = 0; c < weeks; c++) {
      const d = days[c * 7];
      if (!d) continue;
      const m = d.day.slice(0, 7);
      if (m !== last) {
        out.push({ col: c, label: fmt(d.day, { month: "short" }) });
        last = m;
      }
    }
    if (out.length > 1 && out[1].col - out[0].col < 3) out.shift();
    return out;
  }, [days, weeks]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const show = (i: number) => {
    const el = cells.current[i];
    const host = scroller.current?.parentElement?.getBoundingClientRect();
    if (!el || !host) return;
    const r = el.getBoundingClientRect();
    setTip({ i, x: r.left - host.left + r.width / 2, y: r.top - host.top });
  };

  const move = (to: number) => {
    const i = Math.max(0, Math.min(days.length - 1, to));
    setActive(i);
    cells.current[i]?.focus();
  };

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const map: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
    if (e.key in map) {
      e.preventDefault();
      move(i + map[e.key]);
    } else if (e.key === "Home") {
      e.preventDefault();
      move(0);
    } else if (e.key === "End") {
      e.preventDefault();
      move(days.length - 1);
    }
  };

  const tipDay = tip ? days[tip.i] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="text-muted">
          <span className="font-display text-text">{plural(heatmap.totalRuns, "run")}</span> ·{" "}
          <span className="font-display text-reward">{heatmap.totalXp.toLocaleString("en-US")} XP</span> in the last year
        </span>
        <span className="flex items-center gap-1.5 text-muted">
          <StreakFlame days={streak.current} active={streak.playedToday} showCount={false} size={18} />
          Current streak <span className="font-display text-text">{plural(streak.current, "day")}</span>
        </span>
        <span className="text-muted">
          Longest <span className="font-display text-text">{plural(streak.longest, "day")}</span>
        </span>
      </div>

      <div className="relative">
        <div ref={scroller} className="overflow-x-auto pb-2" onMouseLeave={() => setTip(null)}>
          <div className="flex gap-2" style={{ width: weeks * (CELL + GAP) + 32 }}>
            <div className="flex flex-col pt-5 text-[10px] text-faint" style={{ gap: GAP }} aria-hidden="true">
              {DOW.map((d, i) => (
                <span key={i} style={{ height: CELL, lineHeight: `${CELL}px` }}>
                  {d}
                </span>
              ))}
            </div>
            <div>
              <div className="relative h-5 text-[10px] text-faint" aria-hidden="true">
                {months.map((m) => (
                  <span key={`${m.col}${m.label}`} className="absolute top-0" style={{ left: m.col * (CELL + GAP) }}>
                    {m.label}
                  </span>
                ))}
              </div>
              <div
                role="grid"
                aria-label={`Activity heatmap: ${plural(heatmap.activeDays, "active day")} in the last year. Use arrow keys to read days.`}
                className="grid grid-flow-col"
                style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, gridAutoColumns: `${CELL}px`, gap: GAP }}
              >
                {days.map((d, i) => {
                  const fromEnd = days.length - 1 - i;
                  return (
                    <span
                      key={d.day}
                      ref={(el) => {
                        cells.current[i] = el;
                      }}
                      role="gridcell"
                      tabIndex={i === active ? 0 : -1}
                      aria-label={tipText(d)}
                      onMouseEnter={() => show(i)}
                      onFocus={() => {
                        setActive(i);
                        show(i);
                      }}
                      onBlur={() => setTip(null)}
                      onKeyDown={(e) => onKey(e, i)}
                      className="rounded-[3px] outline-offset-1 transition-transform hover:scale-125 focus-visible:scale-125"
                      style={{
                        width: CELL,
                        height: CELL,
                        background: `var(--heat-${d.level})`,
                        boxShadow: d.level === 4 ? "0 0 6px color-mix(in srgb, var(--heat-4) 60%, transparent)" : undefined,
                        animation: `ripple-in .45s var(--ease-snap) ${Math.min(fromEnd * 3, 1100)}ms both`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {tip && tipDay && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-20 w-max -translate-x-1/2 -translate-y-full rounded-sm border border-border-strong bg-bg-2 px-2.5 py-1.5 text-xs text-text shadow-xl"
            style={{ left: Math.max(70, tip.x), top: tip.y - 6 }}
          >
            <span className="font-display">{tipText(tipDay)}</span>
          </div>
        )}
      </div>

      <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-faint">
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: `var(--heat-${l})` }} title={["No XP", "Under 40 XP", "40–99 XP", "100–199 XP", "200+ XP"][l]} />
        ))}
        More
      </div>
    </div>
  );
}
