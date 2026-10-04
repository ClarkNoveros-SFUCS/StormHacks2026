import type { ShareTiers } from "@/lib/daily/types";
import { TIER_UI } from "@/components/modes/dive/tiers";

type Props = {
  tiers: ShareTiers;
  /** Square edge in px. */
  size?: number;
  /** Flip each square in, one after another. */
  animate?: boolean;
  className?: string;
};

/**
 * The Daily share grid as pixel squares (one per Prompt, the Tier it scored at; a miss is dark).
 * Same colours as the share text's emoji: Trench 🟨, Abyss 🟪, Reef 🟦, Shallows ⬜, miss ⬛.
 */
export function TierSquares({ tiers, size = 26, animate = true, className = "" }: Props) {
  const label = tiers.map((t, i) => `${i + 1}: ${t ? TIER_UI[t].label : "miss"}`).join(", ");
  return (
    <ol className={`flex flex-wrap gap-1.5 ${className}`} aria-label={`Your dive, prompt by prompt. ${label}`}>
      {tiers.map((t, i) => {
        const ui = TIER_UI[t ?? "miss"];
        return (
          <li
            key={i}
            title={`Prompt ${i + 1} · ${ui.label}`}
            style={{
              width: size,
              height: size,
              background: ui.hex,
              boxShadow: `inset 0 -${Math.max(2, size / 8)}px 0 rgba(0,0,0,.28), inset 0 ${Math.max(2, size / 10)}px 0 rgba(255,255,255,.22)${t === "rare" ? ", 0 0 12px rgba(255,209,102,.55)" : ""}`,
              animation: animate ? `square-flip .5s var(--ease-out) ${180 + i * 110}ms both` : undefined,
            }}
          />
        );
      })}
      <style>{`@keyframes square-flip { from { transform: perspective(200px) rotateX(90deg); opacity: 0 } 60% { transform: perspective(200px) rotateX(-15deg); opacity: 1 } }`}</style>
    </ol>
  );
}
