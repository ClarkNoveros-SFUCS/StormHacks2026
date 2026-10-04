"use client";
import { useEffect } from "react";
import { sfx } from "@/lib/ui/sfx";

type Props = {
  remainingMs: number;
  totalMs: number;
  paused?: boolean;
  /** Ping each second while hot (default true). */
  sound?: boolean;
  size?: number;
  className?: string;
};

/**
 * Round sonar clock: digits in the middle, a conic fill that drains, a rotating sweep line.
 * Hot (accent, faster sweep, ping per second) at ≤ 5 s. Announces only at 10 s and 5 s.
 */
export function SonarTimer({ remainingMs, totalMs, paused = false, sound = true, size = 64, className = "" }: Props) {
  const secs = Math.max(0, Math.ceil(remainingMs / 1000));
  const frac = Math.max(0, Math.min(1, remainingMs / totalMs));
  const hot = secs <= 5 && remainingMs > 0;
  const color = hot ? "var(--accent)" : "var(--signal)";
  const announce = secs <= 5 && secs > 0 ? "5 seconds left" : secs <= 10 && secs > 0 ? "10 seconds left" : "";

  useEffect(() => {
    if (sound && hot && !paused) sfx.ping();
  }, [secs, hot, paused, sound]);

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(color-mix(in srgb, ${color} 28%, transparent) ${frac * 360}deg, transparent 0)`,
          boxShadow: `inset 0 0 0 2px color-mix(in srgb, ${color} 70%, transparent), 0 0 18px color-mix(in srgb, ${color} 30%, transparent)`,
          transition: "background .2s linear",
        }}
      />
      <div className="absolute inset-[18%] rounded-full" style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 30%, transparent)` }} />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          animationName: "sonar-sweep",
          animationDuration: `${hot ? 0.7 : 2.2}s`,
          animationTimingFunction: "linear",
          animationIterationCount: "infinite",
          animationPlayState: paused ? "paused" : "running",
        }}
      >
        <span
          className="absolute top-[6%] left-1/2 h-[44%] w-[2px] -translate-x-1/2 origin-bottom"
          style={{ background: `linear-gradient(to top, ${color}, transparent)` }}
        />
      </div>
      <span
        className="absolute inset-0 grid place-items-center font-hud leading-none tabular-nums"
        style={{ color, fontSize: size * 0.42, textShadow: `0 0 10px ${color}` }}
        aria-hidden="true"
      >
        {secs}
      </span>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
