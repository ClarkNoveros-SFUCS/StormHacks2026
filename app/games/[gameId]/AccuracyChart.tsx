"use client";
// Accuracy per day (Vancouver days) from F07's player_game_daily continuous aggregate.
// One series of bars, 0–100 %, with a hover tooltip per day.
import { useState } from "react";
import type { PageDay } from "./model";

const W = 560;
const H = 150;
const PAD = { l: 34, r: 6, t: 12, b: 22 };

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Vancouver" });

export function AccuracyChart({ days }: { days: PageDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (days.length === 0) return <p className="text-sm text-muted">Your daily accuracy shows up here after your first Run.</p>;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const slot = plotW / Math.max(days.length, 7); // at least 7 slots, so one day isn't a slab
  const bw = Math.max(4, Math.min(28, slot - 2)); // 2 px gap between bars
  const y = (f: number) => PAD.t + (1 - f) * plotH;
  const total = days.reduce((a, d) => ({ g: a.g + d.guesses, c: a.c + d.correct }), { g: 0, c: 0 });
  const overall = total.g === 0 ? 0 : Math.round((100 * total.c) / total.g);
  const h = hover === null ? null : days[hover];
  return (
    <figure className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full overflow-visible"
        role="img"
        aria-label={`Accuracy over ${days.length} ${days.length === 1 ? "day" : "days"}: ${overall}% overall.`}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(f)} y2={y(f)} stroke="color-mix(in srgb, var(--muted) 18%, transparent)" strokeDasharray={f === 0 ? undefined : "3 4"} />
            <text x={PAD.l - 6} y={y(f) + 4} textAnchor="end" fontSize="12" className="font-hud" fill="var(--muted)">
              {f * 100}%
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const bx = PAD.l + i * slot + (slot - bw) / 2;
          const bh = Math.max(2, d.accuracy * plotH);
          const by = H - PAD.b - bh;
          const r = Math.min(4, bw / 2);
          return (
            <g key={d.day} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={PAD.l + i * slot} y={PAD.t} width={slot} height={plotH} fill="transparent" />
              <path
                d={`M${bx},${H - PAD.b} V${by + r} Q${bx},${by} ${bx + r},${by} H${bx + bw - r} Q${bx + bw},${by} ${bx + bw},${by + r} V${H - PAD.b} Z`}
                fill="var(--signal)"
                opacity={hover === null || hover === i ? 1 : 0.5}
                style={{ transformOrigin: `0 ${H - PAD.b}px`, animation: `acc-grow .7s ${i * 40}ms var(--ease-out) both` }}
              />
            </g>
          );
        })}
        <text x={PAD.l} y={H - 5} fontSize="12" className="font-hud" fill="var(--muted)">
          {dayLabel(days[0].day)}
        </text>
        {days.length > 1 && (
          <text x={PAD.l + (days.length - 0.5) * slot} y={H - 5} textAnchor="end" fontSize="12" className="font-hud" fill="var(--muted)">
            {dayLabel(days[days.length - 1].day)}
          </text>
        )}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-sm border border-border-strong bg-surface-2 px-2 py-1 text-xs whitespace-nowrap shadow-lg"
          style={{ left: `${Math.min(88, Math.max(12, ((PAD.l + (hover + 0.5) * slot) / W) * 100))}%` }}
        >
          <span className="text-muted">{dayLabel(h.day)}</span>{" "}
          <span className="font-hud text-[15px] text-text">{Math.round(h.accuracy * 100)}%</span>{" "}
          <span className="text-muted">
            ({h.correct} of {h.guesses} guesses)
          </span>
        </div>
      )}
      <figcaption className="mt-1 text-sm text-muted">
        {days.length === 1
          ? `${overall}% of your guesses were right on ${dayLabel(days[0].day)}.`
          : `${overall}% of your guesses were right over these ${days.length} days.`}
      </figcaption>
      <style>{`@keyframes acc-grow { from { transform: scaleY(0) } }`}</style>
    </figure>
  );
}
