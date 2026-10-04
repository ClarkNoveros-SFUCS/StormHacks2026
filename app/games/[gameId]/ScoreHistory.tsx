"use client";
// Your Run scores on this Game: a sparkline over time (Personal Best marked) and a spread
// histogram with your latest Run marked. One series, so no legend; hover shows a tooltip.
import { useId, useMemo, useState, type PointerEvent } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { scoreBuckets, type PageRun } from "./model";

const W = 560;
const H = 160;
const PAD = { l: 8, r: 8, t: 18, b: 22 };

type Props = { runs: PageRun[]; score: (n: number) => string; runWord: string; runsWord: string };

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Vancouver" });

export function ScoreHistory({ runs, score, runWord, runsWord }: Props) {
  const [view, setView] = useState("time");
  const ordered = useMemo(() => [...runs].reverse(), [runs]); // oldest first
  if (runs.length < 2) {
    return (
      <p className="text-sm text-muted">
        {runs.length === 0 ? `Play a ${runWord} to start your chart.` : `One more ${runWord} and your score line appears here.`}
      </p>
    );
  }
  return (
    <div>
      <Tabs
        label="Score chart view"
        value={view}
        onChange={setView}
        tabs={[
          { id: "time", label: "Over time" },
          { id: "spread", label: "Spread" },
        ]}
      />
      <div className="mt-3">{view === "time" ? <Sparkline runs={ordered} score={score} /> : <Spread runs={ordered} score={score} runWord={runWord} runsWord={runsWord} />}</div>
    </div>
  );
}

function Sparkline({ runs, score }: { runs: PageRun[]; score: (n: number) => string }) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(1, ...runs.map((r) => r.score));
  const best = runs.reduce((b, r, i) => (r.score > runs[b].score ? i : b), 0);
  const x = (i: number) => PAD.l + (i / (runs.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);
  const line = runs.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r.score).toFixed(1)}`).join(" ");
  const area = `${line} L${x(runs.length - 1)},${H - PAD.b} L${x(0)},${H - PAD.b} Z`;
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(runs.length - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (runs.length - 1)))));
  };
  const h = hover === null ? null : runs[hover];
  return (
    <figure className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none overflow-visible"
        role="img"
        aria-label={`Your last ${runs.length} scores, from ${score(runs[0].score)} to ${score(runs[runs.length - 1].score)}. Best ${score(runs[best].score)}.`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--signal)" stopOpacity=".28" />
            <stop offset="1" stopColor="var(--signal)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.5, 1].map((f) => (
          <line key={f} x1={PAD.l} x2={W - PAD.r} y1={y(top * f)} y2={y(top * f)} stroke="color-mix(in srgb, var(--muted) 18%, transparent)" strokeDasharray="3 4" />
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="color-mix(in srgb, var(--muted) 35%, transparent)" />
        <path d={area} fill={`url(#${gid})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--signal)"
          strokeWidth="2"
          strokeLinejoin="round"
          pathLength={1}
          className="motion-safe:animate-[spark-draw_1.2s_var(--ease-out)_both]"
          style={{ strokeDasharray: 1 }}
        />
        {/* Personal Best */}
        <circle cx={x(best)} cy={y(runs[best].score)} r="6" fill="var(--reward)" stroke="var(--surface)" strokeWidth="2" className="motion-safe:animate-[gold-pulse_2s_ease-in-out_infinite]" />
        <text x={x(best)} y={y(runs[best].score) - 10} textAnchor={best > runs.length * 0.8 ? "end" : best < runs.length * 0.2 ? "start" : "middle"} fontSize="12" className="font-display" fill="var(--text)">
          BEST
        </text>
        <circle cx={x(runs.length - 1)} cy={y(runs[runs.length - 1].score)} r="4" fill="var(--signal)" stroke="var(--surface)" strokeWidth="2" />
        <text x={PAD.l} y={H - 6} fontSize="12" className="font-hud" fill="var(--muted)">
          {shortDate(runs[0].finishedAt)}
        </text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize="12" className="font-hud" fill="var(--muted)">
          {shortDate(runs[runs.length - 1].finishedAt)}
        </text>
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t - 6} y2={H - PAD.b} stroke="color-mix(in srgb, var(--text) 40%, transparent)" />
            <circle cx={x(hover)} cy={y(runs[hover].score)} r="5" fill="var(--signal)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-sm border border-border-strong bg-surface-2 px-2 py-1 text-xs whitespace-nowrap shadow-lg"
          style={{ left: `${Math.min(88, Math.max(12, (x(hover) / W) * 100))}%` }}
        >
          <span className="text-muted">#{h.number} · {shortDate(h.finishedAt)}</span>{" "}
          <span className="font-hud text-[15px] text-text">{score(h.score)}</span>
        </div>
      )}
      <style>{`@keyframes spark-draw { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }`}</style>
    </figure>
  );
}

function Spread({ runs, score, runWord, runsWord }: { runs: PageRun[]; score: (n: number) => string; runWord: string; runsWord: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const buckets = scoreBuckets(runs.map((r) => r.score));
  const latest = runs[runs.length - 1].score;
  const size = buckets[0].to;
  const you = Math.min(buckets.length - 1, Math.floor(latest / size));
  const peak = Math.max(1, ...buckets.map((b) => b.n));
  const bw = (W - PAD.l - PAD.r) / buckets.length;
  const beaten = runs.filter((r) => r.score < latest).length;
  return (
    <figure className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={`Spread of your ${runs.length} scores. Your latest beat ${beaten} of them.`} onPointerLeave={() => setHover(null)}>
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="color-mix(in srgb, var(--muted) 35%, transparent)" />
        {buckets.map((b, i) => {
          const h = b.n === 0 ? 0 : Math.max(6, (b.n / peak) * (H - PAD.t - PAD.b));
          const bx = PAD.l + i * bw + 1;
          const by = H - PAD.b - h;
          const mine = i === you;
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={bx - 1} y={PAD.t} width={bw} height={H - PAD.t - PAD.b} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${bx},${H - PAD.b} V${by + 4} Q${bx},${by} ${bx + 4},${by} H${bx + bw - 6} Q${bx + bw - 2},${by} ${bx + bw - 2},${by + 4} V${H - PAD.b} Z`}
                  fill={mine ? "var(--accent)" : "color-mix(in srgb, var(--signal) 70%, transparent)"}
                  opacity={hover === null || hover === i ? 1 : 0.55}
                  style={{ transformOrigin: `0 ${H - PAD.b}px`, animation: `spread-grow .7s ${i * 50}ms var(--ease-out) both` }}
                />
              )}
              {mine && (
                <text x={bx + bw / 2 - 1} y={by - 6} textAnchor="middle" fontSize="12" className="font-display" fill="var(--text)">
                  YOU
                </text>
              )}
            </g>
          );
        })}
        <text x={PAD.l} y={H - 6} fontSize="12" className="font-hud" fill="var(--muted)">
          {score(0)}
        </text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize="12" className="font-hud" fill="var(--muted)">
          {score(buckets[buckets.length - 1].to)}
        </text>
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-sm border border-border-strong bg-surface-2 px-2 py-1 text-xs whitespace-nowrap shadow-lg"
          style={{ left: `${Math.min(88, Math.max(12, ((PAD.l + (hover + 0.5) * bw) / W) * 100))}%` }}
        >
          <span className="text-muted">
            {score(buckets[hover].from)} – {score(buckets[hover].to)}
          </span>{" "}
          <span className="text-text">
            {buckets[hover].n} {buckets[hover].n === 1 ? runWord : runsWord}
          </span>
        </div>
      )}
      <figcaption className="mt-1 text-sm text-muted">
        Your latest {runWord} beat {beaten} of your {runs.length}.
      </figcaption>
      <style>{`@keyframes spread-grow { from { transform: scaleY(0) } }`}</style>
    </figure>
  );
}
