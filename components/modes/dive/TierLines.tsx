"use client";
import { useEffect, useRef } from "react";
import { burstFrom } from "@/lib/motion/particles";
import { prefersReducedMotion } from "@/lib/motion/reduced";
import { springStep } from "@/lib/motion/spring";
import type { Tier } from "@/lib/scoring/tiers";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { ResultChip } from "@/components/round/ResultChip";
import { TIER_ORDER, TIER_UI } from "./tiers";

/** Where each tier line sits, as a fraction of the play area's height. */
export const LINE_AT: Record<Tier, number> = { common: 0.16, solid: 0.4, deep: 0.66, rare: 0.9 };

export type Sink = { key: number; text: string; tier: Tier; points: number; stale?: boolean; hinted?: boolean };

type Props = {
  /** Single-answer Prompts: the line this Prompt scores on (`THIS PROMPT ▸`); the rest dim. */
  thisPrompt?: Tier | null;
  /** Drop a chip: it sinks on a spring to its line, flashing each line it passes. */
  sink?: Sink | null;
  onLanded?: (sink: Sink) => void;
  className?: string;
};

/** Dive's play area: four dashed tier lines, and the answer chip that sinks to its line. */
export function TierLines({ thisPrompt, sink, onLanded, className = "" }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Partial<Record<Tier, HTMLDivElement | null>>>({});
  const landedRef = useRef(onLanded);

  useEffect(() => {
    landedRef.current = onLanded;
  }, [onLanded]);

  useEffect(() => {
    if (!sink) return;
    const root = rootRef.current;
    const chip = chipRef.current;
    if (!root || !chip) return;
    const H = root.getBoundingClientRect().height;
    const to = LINE_AT[sink.tier] * H;
    const passed = new Set<Tier>();
    const flash = (t: Tier) => {
      const line = lineRefs.current[t];
      if (!line || prefersReducedMotion()) return;
      line.animate(
        [{ boxShadow: `0 0 34px 4px ${TIER_UI[t].hex}`, opacity: 1 }, { boxShadow: "0 0 16px 0 transparent", opacity: 1 }],
        { duration: 600, easing: "ease-out" },
      );
    };
    const place = (y: number) => {
      chip.style.transform = `translate3d(-50%, ${y}px, 0)`;
      for (const t of TIER_ORDER) {
        if (!passed.has(t) && y >= LINE_AT[t] * H - 2 && TIER_ORDER.indexOf(t) <= TIER_ORDER.indexOf(sink.tier)) {
          passed.add(t);
          flash(t);
        }
      }
    };
    let done = false;
    const land = () => {
      if (done) return;
      done = true;
      place(to);
      if (!prefersReducedMotion()) {
        burstFrom(chip, {
          kind: "bubble",
          count: sink.tier === "rare" ? 24 : 8,
          colors: sink.tier === "rare" ? ["#ffd166", "#fff3c4"] : ["#cfe6ff", "#4de3ff"],
          size: [2, 4],
        });
      }
      landedRef.current?.(sink);
    };
    if (prefersReducedMotion()) {
      land();
      return;
    }
    let y = -8;
    let v = 0;
    let last = performance.now();
    let raf = 0;
    let settled = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let left = dt;
      while (left > 0) {
        const s = Math.min(left, 1 / 120);
        [y, v] = springStep(y, v, to, s, 120, 14, 1);
        left -= s;
      }
      place(y);
      if (Math.abs(y - to) < 0.5 && Math.abs(v) < 4) settled++;
      else settled = 0;
      if (settled > 3) {
        land();
        return;
      }
      if (done) return;
      raf = requestAnimationFrame(tick);
    };
    place(y);
    raf = requestAnimationFrame(tick);
    // rAF stops in hidden or throttled tabs; never strand the Run mid-sink.
    const fallback = setTimeout(() => {
      cancelAnimationFrame(raf);
      land();
    }, 2500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
  }, [sink]);

  return (
    <div ref={rootRef} className={`pointer-events-none relative h-full w-full ${className}`}>
      {TIER_ORDER.map((t) => {
        const ui = TIER_UI[t];
        const dim = thisPrompt && thisPrompt !== t;
        return (
          <div key={t} className="absolute inset-x-0" style={{ top: `${LINE_AT[t] * 100}%`, opacity: dim ? 0.3 : 1, transition: "opacity .3s" }}>
            <div
              ref={(el) => {
                lineRefs.current[t] = el;
              }}
              className="h-0 w-full"
              style={{ borderTop: `2px dashed color-mix(in srgb, ${ui.color} 45%, transparent)` }}
            />
            <div className="absolute right-0 -translate-y-1/2 flex items-center gap-1.5 bg-[#050a14]/60 pl-2 font-hud text-[13px] tracking-[0.15em] sm:text-[15px]" style={{ color: ui.color }}>
              {thisPrompt === t && <span className="text-text">THIS PROMPT ▸</span>}
              <PixelIcon name={ui.icon} size={14} palette={{ c: ui.hex, b: ui.hex, v: ui.hex, y: ui.hex }} />
              <span className="uppercase">{ui.label}</span>
              <span className="hidden text-muted sm:inline">{ui.depth.toLocaleString("en-US")} M</span>
            </div>
          </div>
        );
      })}
      {sink && (
        <div key={sink.key} ref={chipRef} className="absolute top-0 left-1/2 -mt-5" style={{ transform: "translate3d(-50%, -8px, 0)" }}>
          <ResultChip text={sink.text} band={TIER_UI[sink.tier].band} points={sink.points} stale={sink.stale} hinted={sink.hinted} />
        </div>
      )}
    </div>
  );
}
