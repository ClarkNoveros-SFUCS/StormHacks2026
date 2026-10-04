"use client";
// Krillion's descent: after a correct answer the chip drops into the water and the camera follows it
// down in one continuous move. The tier lines hang in the world below where you were (Shallows 100 m,
// Reef 250 m, …), flash as the chip passes them, and the chip stops on its own line. The prompt card
// scrolls away with the world (`onShift`), and the HUD depth counts along with the camera.
// Spec: docs/design/modes/dive.md §5–6. Mapping: ./depth.ts.
import { useEffect, useRef, type RefObject } from "react";
import { prefersReducedMotion } from "@/lib/motion/reduced";
import type { Tier } from "@/lib/scoring/tiers";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { anchorY, depthAtScreenY, fallCurve, fallMs, pxPerMetre, screenYOf, worldShift, type DiveCamera } from "./depth";
import { TIER_ORDER, TIER_UI } from "./tiers";

export type Sink = {
  key: number;
  text: string;
  tier: Tier;
  points: number;
  stale?: boolean;
  hinted?: boolean;
  /** Camera depth (m) when the answer landed: the tier lines hang below it. */
  from: number;
  /** Screen y (CSS px, from the stage top) where the chip appears, e.g. just under the card. */
  startY?: number;
};

type Props = {
  camera: DiveCamera;
  sink: Sink | null;
  onLanded?: (sink: Sink) => void;
  /** Bubbles streaming up off the chip while it falls (the stage's bubble emitter). */
  onTrail?: (xFrac: number, yFrac: number) => void;
  /** Fade the chip and lines out (the catch screen is up). */
  fade?: boolean;
  /** How far (CSS px) world-attached UI has scrolled since the fall began: move the prompt card by it. 0 when done. */
  onShift?: (px: number) => void;
  className?: string;
};

/** Where a fresh Run's camera starts: up in the sky, the waterline low on the screen (Krillion's title shot). */
export const SKY_DEPTH = -120;

/**
 * While the camera is above the waterline (the opening pan down from the sky), keep `target` (the
 * prompt card) riding with the water, so it comes up with the waterline into its place.
 */
export function useSkyCarry(camera: DiveCamera, target: RefObject<HTMLElement | null>, root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let lifted = false;
    return camera.subscribe((d) => {
      const el = target.current;
      if (!el) return;
      if (d < -0.5) {
        lifted = true;
        el.style.transform = `translate3d(0, ${-d * pxPerMetre(root.current?.clientHeight ?? 0)}px, 0)`;
      } else if (lifted) {
        lifted = false;
        el.style.transform = "";
      }
    });
  }, [camera, target, root]);
}

export function Descent({ camera, sink, onLanded, onTrail, onShift, fade = false, className = "" }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Partial<Record<Tier, HTMLDivElement | null>>>({});
  const landedRef = useRef(onLanded);
  const trailRef = useRef(onTrail);
  const shiftRef = useRef(onShift);

  useEffect(() => {
    landedRef.current = onLanded;
    trailRef.current = onTrail;
    shiftRef.current = onShift;
  }, [onLanded, onTrail, onShift]);

  useEffect(() => {
    if (!sink) return;
    const root = rootRef.current;
    const chip = chipRef.current;
    if (!root || !chip) return;
    let H = root.getBoundingClientRect().height;
    const reduced = prefersReducedMotion();
    const end = sink.from + sink.points * 10;
    const startScreen = sink.startY ?? anchorY(sink.from, H) + H * 0.12;
    const start = Math.min(end - 20, Math.max(sink.from, depthAtScreenY(startScreen, sink.from, H)));
    let chipDepth = start;
    const passed = new Set<Tier>();

    const place = (cam: number) => {
      chip.style.transform = `translate3d(-50%, ${screenYOf(chipDepth, cam, H)}px, 0)`;
      for (const t of TIER_ORDER) {
        const line = lineRefs.current[t];
        if (line) line.style.transform = `translate3d(0, ${screenYOf(sink.from + TIER_UI[t].depth, cam, H)}px, 0)`;
      }
      shiftRef.current?.(worldShift(sink.from, cam, H));
    };
    const cross = (t: Tier, landing: boolean) => {
      const line = lineRefs.current[t];
      if (!line) return;
      line.dataset.state = landing ? "landed" : "passed";
      if (!reduced) {
        line.animate([{ filter: "brightness(2.2)" }, { filter: "brightness(1)" }], { duration: landing ? 900 : 500, easing: "ease-out" });
      }
    };

    const ro = new ResizeObserver(() => {
      H = root.getBoundingClientRect().height;
      place(camera.depth);
    });
    ro.observe(root);
    const unsub = camera.subscribe((cam) => place(cam));

    let done = false;
    const land = () => {
      if (done) return;
      done = true;
      chipDepth = end;
      camera.set(end, true);
      cross(sink.tier, true);
      place(camera.depth);
      landedRef.current?.(sink);
    };

    if (reduced) {
      land();
      return () => {
        ro.disconnect();
        unsub();
      };
    }

    const dur = fallMs(end - sink.from);
    const t0 = performance.now();
    // The camera rides with the chip, keeping it where it dropped in (just under the card), and
    // closes that gap over the last stretch so it rests exactly on the new depth.
    const gap = start - sink.from;
    let raf = 0;
    let lastTrail = 0;
    let lastNow = t0;
    let lastCam = camera.depth;
    const tick = (now: number) => {
      if (done) return;
      const p = Math.min(1, (now - t0) / dur);
      chipDepth = start + (end - start) * fallCurve(p);
      const close = Math.min(1, Math.max(0, (p - 0.6) / 0.4));
      const cam = chipDepth - gap * (1 - close * close * (3 - 2 * close));
      const dt = Math.max(1e-3, (now - lastNow) / 1000);
      camera.follow(cam, (cam - lastCam) / dt);
      lastNow = now;
      lastCam = cam;
      for (const t of TIER_ORDER) {
        if (t === sink.tier) break;
        if (!passed.has(t) && chipDepth >= sink.from + TIER_UI[t].depth) {
          passed.add(t);
          cross(t, false);
        }
      }
      if (now - lastTrail > 90 && p < 0.97) {
        lastTrail = now;
        const y = screenYOf(chipDepth, camera.depth, H);
        trailRef.current?.(0.5, Math.max(0, Math.min(1, (y - 16) / H)));
      }
      place(camera.depth);
      if (p >= 1) {
        land();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    place(camera.depth);
    raf = requestAnimationFrame(tick);
    // rAF stops in hidden or throttled tabs; never strand the Run mid-fall.
    const fallback = setTimeout(land, dur + 2500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
      ro.disconnect();
      unsub();
      shiftRef.current?.(0);
    };
  }, [sink, camera]);

  const ui = sink ? TIER_UI[sink.tier] : null;
  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-300 ${className}`}
      style={{ opacity: fade ? 0 : 1 }}
    >
      {sink && (
        <div key={sink.key} className="absolute inset-0" style={{ animation: "dv-lines-in .4s ease-out both" }}>
          {TIER_ORDER.map((t) => {
            const tu = TIER_UI[t];
            return (
              <div
                key={t}
                ref={(el) => {
                  lineRefs.current[t] = el;
                }}
                data-state="ahead"
                className="dv-tierline absolute top-0 right-[10%] left-[10%] will-change-transform sm:right-[19%] sm:left-[19%]"
                style={{ ["--tc" as string]: tu.hex }}
              >
                <div className="dv-tierline-rule h-0 w-full" />
                <div className="dv-tierline-label absolute right-0 bottom-1 flex items-center gap-1.5 font-hud text-[13px] tracking-[0.15em] whitespace-nowrap uppercase sm:text-[15px]">
                  <PixelIcon name={tu.icon} size={13} palette={{ c: tu.hex, b: tu.hex, v: tu.hex, y: tu.hex }} />
                  <span>{tu.label}</span>
                  <span>· {tu.points}</span>
                </div>
              </div>
            );
          })}
          {ui && (
            <div ref={chipRef} className="absolute top-0 left-1/2 will-change-transform" style={{ transform: "translate3d(-50%, -200px, 0)" }}>
              <div className="relative -translate-y-1/2">
                {/* the tier's creatures swim around the chip on the way down */}
                {[0, 1, 2].map((i) => {
                  const period = 2.2 + i * 0.45;
                  return (
                    <span
                      key={i}
                      className="absolute top-1/2 left-1/2"
                      style={{ ["--r" as string]: `${64 + i * 12}px`, animation: `dv-swim-x ${period}s ease-in-out ${-i * 0.7}s infinite alternate` }}
                    >
                      <span
                        className="block"
                        style={{ ["--h" as string]: `${16 + i * 4}px`, animation: `dv-swim-y ${period}s ease-in-out ${-i * 0.7 - period / 2}s infinite alternate` }}
                      >
                        <span className="block -translate-x-1/2 -translate-y-1/2" style={{ filter: `drop-shadow(0 0 4px ${ui.hex})` }}>
                          <PixelIcon name={ui.icon} size={12} palette={{ c: ui.hex, b: ui.hex, v: ui.hex, y: ui.hex }} />
                        </span>
                      </span>
                    </span>
                  );
                })}
                <div
                  className="relative px-3 py-1 font-hud text-[22px] leading-none whitespace-nowrap uppercase sm:text-[26px]"
                  style={{
                    color: ui.hex,
                    background: "rgba(8,16,30,.92)",
                    boxShadow: `inset 0 0 0 2px #1b3050, 0 3px 0 #050a14, 0 0 22px color-mix(in srgb, ${ui.hex} 35%, transparent)`,
                    textShadow: `0 0 8px ${ui.hex}`,
                  }}
                >
                  <span className="inline-block max-w-[60vw] truncate align-bottom">“{sink.text}”</span> <span className="text-[0.7em]">▼</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      <style>{`
        @keyframes dv-lines-in { from { opacity: 0 } }
        @keyframes dv-swim-x { from { transform: translateX(calc(var(--r) * -1)) } to { transform: translateX(var(--r)) } }
        @keyframes dv-swim-y { from { transform: translateY(calc(var(--h) * -1)) } to { transform: translateY(var(--h)) } }
        .dv-tierline-rule { border-top: 2px dashed rgba(200, 220, 255, .22); transition: border-color .3s }
        .dv-tierline-label { color: rgba(200, 220, 255, .45); transition: color .3s, text-shadow .3s }
        .dv-tierline[data-state="passed"] .dv-tierline-rule { border-top-color: color-mix(in srgb, var(--tc) 70%, transparent) }
        .dv-tierline[data-state="passed"] .dv-tierline-label { color: var(--tc) }
        .dv-tierline[data-state="landed"] .dv-tierline-rule { border-top-color: var(--tc); box-shadow: 0 0 14px color-mix(in srgb, var(--tc) 60%, transparent) }
        .dv-tierline[data-state="landed"] .dv-tierline-label { color: var(--tc); text-shadow: 0 0 8px var(--tc) }
      `}</style>
    </div>
  );
}
