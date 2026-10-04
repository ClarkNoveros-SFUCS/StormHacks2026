"use client";
// Real-ocean landmarks hung in the Dive world at their depths, on the left and right edges, so the
// descent reads as passing them (Krillion does the same). They scroll with the camera, no re-renders.
import { useEffect, useRef } from "react";
import { screenYOf, type DiveCamera } from "./depth";

type Mark = { m: number; side: "l" | "r"; text: string; zone?: boolean };

/** Depths in metres. Zones are the big cyan headings; the rest are faint asides. */
export const DEPTH_MARKS: Mark[] = [
  { m: 40, side: "r", text: "recreational scuba limit · 40m" },
  { m: 90, side: "l", text: "light begins to fade" },
  { m: 200, side: "r", text: "the sunlight zone ends · 200m" },
  { m: 200, side: "l", text: "THE TWILIGHT ZONE", zone: true },
  { m: 332, side: "r", text: "deepest scuba dive ever · 332m" },
  { m: 450, side: "l", text: "pressure: 46× the surface" },
  { m: 560, side: "r", text: "emperor penguins dive this deep" },
  { m: 800, side: "l", text: "siphonophores drift here" },
  { m: 1000, side: "l", text: "THE MIDNIGHT ZONE", zone: true },
  { m: 1000, side: "r", text: "no sunlight below here" },
  { m: 1300, side: "r", text: "sperm whales hunt down here" },
  { m: 1800, side: "l", text: "anglerfish territory" },
  { m: 2500, side: "r", text: "pressure: 250× the surface" },
  { m: 3000, side: "l", text: "THE ABYSS", zone: true },
  { m: 3800, side: "r", text: "the Titanic rests at 3,800m" },
  { m: 4500, side: "l", text: "gulper eels wait in the dark" },
  { m: 5500, side: "l", text: "THE TRENCH", zone: true },
  { m: 6000, side: "r", text: "hydrothermal vents glow here" },
  { m: 7000, side: "r", text: "the bottom of the dive · 7,000m" },
];

export function DepthMarks({ camera, className = "" }: { camera: DiveCamera; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let H = root.getBoundingClientRect().height;
    let depth = camera.depth;
    const place = () => {
      DEPTH_MARKS.forEach((mk, i) => {
        const el = refs.current[i];
        if (!el) return;
        const y = screenYOf(mk.m, depth, H);
        const on = y > 40 && y < H + 20;
        el.style.transform = `translate3d(0, ${Math.round(y)}px, 0)`;
        el.style.visibility = on ? "visible" : "hidden";
      });
    };
    const ro = new ResizeObserver(() => {
      H = root.getBoundingClientRect().height;
      place();
    });
    ro.observe(root);
    const unsub = camera.subscribe((d) => {
      depth = d;
      place();
    });
    return () => {
      ro.disconnect();
      unsub();
    };
  }, [camera]);

  return (
    <div ref={rootRef} aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden font-hud ${className}`}>
      {DEPTH_MARKS.map((mk, i) => (
        <div
          key={`${mk.m}-${mk.side}`}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={`absolute top-0 flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap will-change-transform ${mk.side === "l" ? "left-2 sm:left-5" : "right-2 flex-row-reverse sm:right-5"} ${mk.zone ? "text-[13px] tracking-[0.2em] text-signal sm:text-[15px]" : "text-[12px] tracking-[0.12em] text-[#8fa3c4]/70 sm:text-[14px]"}`}
          style={{ visibility: "hidden" }}
        >
          <span className="block h-px w-2 bg-current opacity-60" />
          <span style={mk.zone ? { textShadow: "0 0 8px var(--signal)" } : undefined}>{mk.text}</span>
        </div>
      ))}
    </div>
  );
}
