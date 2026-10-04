"use client";
// The right-edge depth ruler with the YOU marker. Follows a DiveCamera without re-rendering:
// tick positions use a CSS var (--ppm) and the column/marker move via transforms.
import { useEffect, useRef } from "react";
import { anchorY, pxPerMetre, type DiveCamera } from "./depth";

type Props = { camera: DiveCamera; maxMetres?: number; className?: string };

const STEP = 25;

export function DepthRuler({ camera, maxMetres = 8000, className = "" }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const youRef = useRef<HTMLDivElement>(null);
  const ticks = Array.from({ length: Math.floor(maxMetres / STEP) + 1 }, (_, i) => i * STEP);

  useEffect(() => {
    const root = rootRef.current;
    const col = colRef.current;
    const you = youRef.current;
    if (!root || !col || !you) return;
    let H = root.getBoundingClientRect().height;
    let depth = camera.depth;
    const place = () => {
      const ppm = pxPerMetre(H);
      root.style.setProperty("--ppm", `${ppm}px`);
      const a = anchorY(depth, H);
      col.style.transform = `translate3d(0, ${a - depth * ppm}px, 0)`;
      you.style.transform = `translate3d(0, ${a}px, 0)`;
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
    place();
    return () => {
      ro.disconnect();
      unsub();
    };
  }, [camera]);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={`pointer-events-none absolute top-0 right-0 bottom-0 w-14 overflow-hidden font-hud sm:w-20 ${className}`}
    >
      <div ref={colRef} className="absolute inset-x-0 top-0 will-change-transform">
        {/* the spine */}
        <div className="absolute top-0 right-3 w-px bg-[#8fa3c4]/40 sm:right-5" style={{ height: `calc(var(--ppm) * ${maxMetres})` }} />
        {ticks.map((m) => {
          const major = m % 100 === 0;
          return (
            <div key={m} className="absolute right-3 flex items-center gap-1 sm:right-5" style={{ top: `calc(var(--ppm) * ${m})` }}>
              {major && m > 0 && (
                <span className="-translate-y-1/2 text-[11px] whitespace-nowrap text-[#8fa3c4]/80 sm:text-[13px]">
                  -{m.toLocaleString("en-US")}m
                </span>
              )}
              <span className={`block h-px -translate-y-1/2 bg-[#8fa3c4]/60 ${major ? "w-3 sm:w-4" : "w-1.5 sm:w-2"}`} />
            </div>
          );
        })}
      </div>
      <div ref={youRef} className="absolute top-0 right-0 flex -translate-y-1/2 items-center gap-1 bg-[#050a14]/80 py-0.5 pl-1 will-change-transform">
        <span className="text-[12px] tracking-[0.1em] text-accent sm:text-[14px]" style={{ textShadow: "0 0 8px var(--accent)" }}>
          YOU
        </span>
        <span className="block h-0.5 w-3 bg-accent sm:w-4" />
        <span className="text-[14px] leading-none text-accent">◀</span>
      </div>
    </div>
  );
}
