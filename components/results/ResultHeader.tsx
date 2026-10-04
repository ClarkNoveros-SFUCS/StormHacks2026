"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { tween } from "@/lib/motion/spring";
import { sfx } from "@/lib/ui/sfx";

type Props = {
  /** e.g. "DIVE #12 COMPLETE" */
  title: string;
  score: number;
  /** The Mode's metaphor beside the score, e.g. "−1,400 m". */
  secondary?: ReactNode;
  personalBest?: boolean;
  /** Left of the title row (a small logo). */
  logo?: ReactNode;
  className?: string;
};

/** Big counting score with the Mode's secondary metric and an optional NEW PERSONAL BEST banner. */
export function ResultHeader({ title, score, secondary, personalBest, logo, className = "" }: Props) {
  const numRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = numRef.current;
    if (!el) return;
    let lastSound = 0;
    let lastShown = -1;
    return tween({
      from: 0,
      to: score,
      duration: Math.min(1600, 500 + score * 3),
      onUpdate: (v) => {
        const n = Math.round(v);
        if (n === lastShown) return;
        lastShown = n;
        el.textContent = String(n);
        const now = performance.now();
        if (now - lastSound > 45) {
          lastSound = now;
          sfx.count();
        }
      },
    });
  }, [score]);

  return (
    <header className={`w-full ${className}`}>
      <div className="flex items-center justify-between gap-4">
        <div>{logo}</div>
        <span className="font-hud text-[14px] tracking-[0.3em] text-muted uppercase sm:text-[16px]">{title}</span>
      </div>
      <div className="mt-4 flex items-end gap-4">
        <span ref={numRef} className="font-hud text-[88px] leading-[0.8] text-text tabular-nums sm:text-[112px]" aria-label={`Score ${score}`}>
          {score}
        </span>
        {secondary && <span className="pb-1 font-hud text-[20px] text-signal glow-signal sm:text-[24px]">{secondary}</span>}
      </div>
      {personalBest && (
        <div
          className="mt-4 inline-block px-4 py-1.5 font-hud text-[20px] tracking-[0.2em] text-reward"
          style={{
            boxShadow: "inset 0 0 0 2px var(--reward)",
            animation: "banner-in .6s var(--ease-snap) both, gold-breathe 3s ease-in-out .6s infinite",
          }}
        >
          ★ NEW PERSONAL BEST
        </div>
      )}
    </header>
  );
}
