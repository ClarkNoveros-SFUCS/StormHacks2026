import { PixelIcon } from "@/components/ui/PixelIcon";
import { APOGEE_TIERS, type TierKey } from "./altitude";

type Props = { prompts: { points: number; tier: TierKey }[]; className?: string };

const MAX = 100; // km, a Deep Space answer
const GRID = [0, 25, 50, 75, 100];

/** MISSION LOG · higher = rarer: one burn per Prompt, rising from the pad to the km it added. */
export function MissionLogChart({ prompts, className = "" }: Props) {
  const n = Math.max(1, prompts.length);
  return (
    <section className={`w-full ${className}`}>
      <h3 className="label-line">
        MISSION LOG <span className="tracking-[0.2em] text-faint normal-case">· higher = rarer</span>
      </h3>
      <div className="relative mt-3 h-[200px] pl-10" role="img" aria-label={`Mission log: ${prompts.map((p, i) => `prompt ${i + 1} +${p.points} km`).join(", ")}`}>
        <div className="relative h-[calc(100%-22px)]">
          {GRID.map((g) => (
            <div key={g} className="absolute inset-x-0 border-t border-dashed border-white/10" style={{ bottom: `${(g / MAX) * 100}%` }}>
              <span className="absolute -left-10 -translate-y-1/2 font-hud text-[11px] text-faint">{g === 0 ? "pad" : `${g}km`}</span>
            </div>
          ))}
          {prompts.map((p, i) => {
            const ui = APOGEE_TIERS[p.tier];
            const h = Math.min(MAX, p.points);
            const left = `${((i + 0.5) / n) * 100}%`;
            return (
              <div key={i} className="absolute bottom-0 -translate-x-1/2" style={{ left, height: `${(h / MAX) * 100}%` }}>
                <div className="mx-auto h-full w-[3px] origin-bottom rounded-t" style={{ background: `linear-gradient(to top, ${ui.hex}33, ${ui.hex})`, boxShadow: `0 0 10px ${ui.hex}66`, animation: `ml-rise .9s var(--ease-out) ${i * 90}ms both` }} />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ filter: `drop-shadow(0 0 6px ${ui.hex})`, animation: `ap-fade-in .5s ${300 + i * 90}ms both` }}>
                  <PixelIcon name={ui.icon} size={p.tier === "miss" ? 12 : 18} palette={{ c: ui.hex, b: ui.hex, v: ui.hex, y: ui.hex, Y: ui.hex, B: ui.hex }} title={ui.label} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="relative h-[22px]">
          {prompts.map((_, i) => (
            <span key={i} className="absolute top-1 -translate-x-1/2 font-hud text-[12px] text-faint" style={{ left: `${((i + 0.5) / n) * 100}%` }}>
              {i + 1}
            </span>
          ))}
        </div>
      </div>
      <style>{`@keyframes ml-rise { from { transform: scaleY(0) } }`}</style>
    </section>
  );
}
