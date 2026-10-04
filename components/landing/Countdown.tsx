"use client";
import { useEffect, useState } from "react";
import { formatCountdown, msUntilNextDaily } from "./daily-teaser";

/** Ticking "HH:MM:SS" until the next Daily (Vancouver midnight). Renders "--:--:--" until mounted. */
export function NextDailyCountdown({ className = "" }: { className?: string }) {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setMs(msUntilNextDaily());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  const text = ms === null ? "--:--:--" : formatCountdown(ms);
  return (
    <time className={`font-hud tabular-nums ${className}`} aria-label={ms === null ? undefined : `Next Daily in ${text}`}>
      {text}
    </time>
  );
}
