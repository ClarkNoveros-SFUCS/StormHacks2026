import type { Tier } from "@/lib/scoring/tiers";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { TIER_UI } from "./tiers";

type Props = { prompts: { points: number; tier: Tier | "miss" }[]; className?: string };

const MAX = 1000; // m, the Trench line
const GRID = [0, 250, 500, 750, 1000];

/** DIVE LOG · deeper = rarer: one dropline per Prompt from 0 m to the depth it sank you. */
export function DiveLogChart({ prompts, className = "" }: Props) {
  const n = Math.max(1, prompts.length);
  return (
    <section className={`w-full ${className}`}>
      <h3 className="label-line">
        DIVE LOG <span className="tracking-[0.2em] text-faint normal-case">· deeper = rarer</span>
      </h3>
      <div className="relative mt-3 h-[220px] pl-12 sm:h-[260px]" role="img" aria-label={`Dive log: ${prompts.map((p, i) => `prompt ${i + 1} ${p.points} points`).join(", ")}`}>
        <div className="relative h-[calc(100%-22px)]">
          {GRID.map((g) => (
            <div key={g} className="absolute inset-x-0 border-t border-dashed border-white/10" style={{ top: `${(g / MAX) * 100}%` }}>
              <span className="absolute -left-12 -translate-y-1/2 font-hud text-[12px] text-faint">{g === 0 ? "0m" : `-${g.toLocaleString("en-US")}`}</span>
            </div>
          ))}
          {prompts.map((p, i) => {
            const ui = TIER_UI[p.tier];
            const depth = Math.min(MAX, p.points * 10);
            const left = `${((i + 0.5) / n) * 100}%`;
            return (
              <div key={i} className="absolute top-0 -translate-x-1/2" style={{ left, height: `${(depth / MAX) * 100}%` }}>
                <div
                  className="mx-auto h-full w-[2px] origin-top"
                  style={{ background: `linear-gradient(${ui.hex}55, ${ui.hex})`, animation: `drop-in .9s var(--ease-out) ${i * 90}ms both` }}
                />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2" style={{ filter: `drop-shadow(0 0 6px ${ui.hex})`, animation: `rise-in .5s var(--ease-out) ${300 + i * 90}ms both` }}>
                  <PixelIcon name={ui.icon} size={p.tier === "miss" ? 12 : 18} palette={{ c: ui.hex, b: ui.hex, v: ui.hex, y: ui.hex }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="relative h-[22px]">
          {prompts.map((_, i) => (
            <span key={i} className="absolute top-1 -translate-x-1/2 font-hud text-[13px] text-faint" style={{ left: `${((i + 0.5) / n) * 100}%` }}>
              {i + 1}
            </span>
          ))}
        </div>
      </div>
      <style>{`@keyframes drop-in { from { transform: scaleY(0) } }`}</style>
    </section>
  );
}
