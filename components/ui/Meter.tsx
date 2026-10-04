"use client";
import { useEffect, useRef, useState } from "react";
import { burstFrom } from "@/lib/motion/particles";

/** A segmented pixel bar (e.g. Mastery). Newly filled segments play `gild`. */
export function Meter({ value, segments = 10, label }: { value: number; segments?: number; label?: string }) {
  const filled = Math.round((Math.max(0, Math.min(100, value)) / 100) * segments);
  const prev = useRef(filled);
  const [from, setFrom] = useState(filled);
  useEffect(() => {
    if (filled !== prev.current) {
      setFrom(prev.current);
      prev.current = filled;
    }
  }, [filled]);
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      aria-label={label ?? "Progress"}
      className="flex gap-[3px]"
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className="h-3 flex-1 rounded-[2px]"
          style={{
            background: i < filled ? "var(--reward)" : "var(--band-miss)",
            animation: i < filled && i >= from ? `gild .9s ${(i - from) * 80}ms both` : undefined,
          }}
        />
      ))}
    </div>
  );
}

type BarProps = {
  value: number;
  max: number;
  tone?: string; // CSS colour, default --primary
  label?: string;
  showValue?: boolean;
  height?: number;
  className?: string;
};

/** A rounded progress bar that fills on mount with a shine sweep. */
export function ProgressBar({ value, max, tone = "var(--primary)", label, showValue, height = 10, className = "" }: BarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1.5 flex justify-between text-xs text-muted">
          <span>{label}</span>
          {showValue && (
            <span className="font-display tabular-nums text-text">
              {value.toLocaleString()} / {max.toLocaleString()}
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
        className="overflow-hidden rounded-full bg-bg-2 ring-1 ring-border"
        style={{ height }}
      >
        <div
          className="shine h-full rounded-full"
          style={{
            width: `${shown}%`,
            background: `linear-gradient(180deg, color-mix(in srgb, white 25%, ${tone}), ${tone})`,
            transition: "width 1.1s var(--ease-out)",
          }}
        />
      </div>
    </div>
  );
}

type XpProps = {
  /** Total XP. */
  xp: number;
  /** Total XP at the start of the current level. */
  levelStartXp: number;
  /** Total XP needed for the next level. */
  nextLevelXp: number;
  level: number;
  className?: string;
};

/** XP toward the next level: a gold bar with shine, and spark particles from its tip when XP grows. */
export function XpBar({ xp, levelStartXp, nextLevelXp, level, className = "" }: XpProps) {
  const span = Math.max(1, nextLevelXp - levelStartXp);
  const into = Math.max(0, xp - levelStartXp);
  const pct = Math.min(100, (into / span) * 100);
  const tip = useRef<HTMLSpanElement>(null);
  const last = useRef(xp);
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(pct));
    const grew = xp > last.current;
    last.current = xp;
    let t: ReturnType<typeof setTimeout> | undefined;
    if (grew) t = setTimeout(() => burstFrom(tip.current, { kind: "spark", count: 16, spread: 160, colors: ["#ffd84d", "#fff", "#ffd166"] }), 700);
    return () => {
      cancelAnimationFrame(id);
      if (t) clearTimeout(t);
    };
  }, [pct, xp]);
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-display text-sm text-reward">Level {level}</span>
        <span className="text-xs text-muted tabular-nums">
          {into.toLocaleString()} / {span.toLocaleString()} XP
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`Level ${level} progress`}
        aria-valuemin={0}
        aria-valuemax={span}
        aria-valuenow={into}
        className="relative h-3.5 overflow-hidden rounded-sm bg-bg-2 ring-1 ring-border"
      >
        <div
          className="shine relative h-full"
          style={{
            width: `${w}%`,
            background:
              "repeating-linear-gradient(90deg, transparent 0 6px, rgba(0,0,0,.12) 6px 8px), linear-gradient(180deg, #ffe58a, var(--primary) 55%, var(--primary-drop))",
            transition: "width 1.2s var(--ease-out)",
          }}
        >
          <span ref={tip} className="absolute top-1/2 right-0 h-0 w-0" />
        </div>
      </div>
    </div>
  );
}
