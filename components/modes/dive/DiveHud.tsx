"use client";
import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion/reduced";
import { spring } from "@/lib/motion/spring";
import { HudPlate } from "@/components/round/HudPlate";
import { ProgressSquares, type SquareResult } from "@/components/round/ProgressSquares";
import type { DiveCamera } from "./depth";

type Props = {
  /** Metres (score × 10). Counts up on a spring. */
  depth: number;
  /** Follow this camera instead, so the depth counts live while the chip falls (Krillion). */
  camera?: DiveCamera;
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
export function DiveHud({ depth, camera, score, current, total, results, className = "" }: Props) {
  const depthRef = useRef<HTMLSpanElement>(null);
  const shown = useRef(depth);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const shownScore = useRef(score);

  // The score counts up to its new total, as Krillion's does on the catch screen.
  useEffect(() => {
    const el = scoreRef.current;
    if (!el) return;
    const from = shownScore.current;
    if (score <= from) {
      shownScore.current = score;
      el.textContent = String(score);
      return;
    }
    if (!prefersReducedMotion()) {
      el.animate([{ transform: "scale(1)" }, { transform: "scale(1.35) rotate(-2deg)", textShadow: "0 0 22px var(--reward)" }, { transform: "scale(1)" }], {
        duration: 500,
        easing: "cubic-bezier(.3,1.6,.5,1)",
      });
    }
    return spring({
      from,
      to: score,
      stiffness: 70,
      damping: 18,
      onUpdate: (v) => {
        shownScore.current = v;
        el.textContent = String(Math.round(v));
      },
    });
  }, [score]);

  useEffect(() => {
    const el = depthRef.current;
    if (!el || !camera) return;
    return camera.subscribe((d) => {
      el.textContent = fmt(Math.max(0, d));
    });
  }, [camera]);

  useEffect(() => {
    const el = depthRef.current;
    if (!el || camera) return;
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
  }, [depth, camera]);

  return (
    <div className={`flex items-start justify-center gap-2 sm:gap-8 ${className}`}>
      <HudPlate label="Depth" tone="signal" value={<span ref={depthRef}>{fmt(depth)}</span>} />
      <ProgressSquares className="pt-2" total={total} current={current} results={results} />
      <HudPlate
        label="Score"
        tone="accent"
        value={
          <span ref={scoreRef} className="inline-block" />
        }
      />
    </div>
  );
}
