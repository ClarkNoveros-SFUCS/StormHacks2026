"use client";
import { useEffect, useRef } from "react";
import { spring } from "@/lib/motion/spring";
import { HudPlate } from "@/components/round/HudPlate";
import { ProgressSquares, type SquareResult } from "@/components/round/ProgressSquares";

type Props = {
  /** Metres (score × 10). Counts up on a spring. */
  depth: number;
  score: number;
  current: number;
  total: number;
  results: SquareResult[];
  className?: string;
};

function fmt(m: number) {
  return `${Math.round(m).toLocaleString("en-US")}m`;
}

/** Krillion's top HUD: DEPTH plate (cyan) · progress squares · SCORE plate (pink). */
export function DiveHud({ depth, score, current, total, results, className = "" }: Props) {
  const depthRef = useRef<HTMLSpanElement>(null);
  const shown = useRef(depth);

  useEffect(() => {
    const el = depthRef.current;
    if (!el) return;
    const from = shown.current;
    return spring({
      from,
      to: depth,
      stiffness: 90,
      damping: 16,
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = fmt(Math.max(0, v));
        el.style.transform = Math.abs(v - depth) > 1 ? `translateY(${Math.round(v) % 2 ? -1 : 0}px)` : "";
      },
    });
  }, [depth]);

  return (
    <div className={`flex items-start justify-center gap-2 sm:gap-8 ${className}`}>
      <HudPlate label="Depth" tone="signal" value={<span ref={depthRef}>{fmt(depth)}</span>} />
      <ProgressSquares className="pt-2" total={total} current={current} results={results} />
      <HudPlate
        label="Score"
        tone="accent"
        value={
          <span key={score} className="inline-block" style={{ animation: score > 0 ? "score-slam .5s var(--ease-snap)" : undefined }}>
            {score}
          </span>
        }
      />
    </div>
  );
}
