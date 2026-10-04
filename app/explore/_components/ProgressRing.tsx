"use client";
import { useEffect, useState } from "react";
import s from "../explore.module.css";

type Props = { value: number; max: number; size?: number; label?: string; tone?: string };

/** A pixel-ish progress ring that fills on mount, with "n/m" in the middle. */
export function ProgressRing({ value, max, size = 64, label, tone = "var(--primary)" }: Props) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  const done = max > 0 && value >= max;
  return (
    <div
      role="img"
      aria-label={label ?? `${value} of ${max} Topics passed`}
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 64 64" width={size} height={size} className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="rgba(5,7,15,.75)" stroke="var(--border)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={done ? "var(--success)" : tone}
          strokeWidth="6"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
          className={s.ring}
        />
      </svg>
      <span className="absolute font-display text-[13px] leading-none text-text tabular-nums">
        {value}/{max}
      </span>
    </div>
  );
}
