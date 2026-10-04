"use client";
import type { Tier } from "@/lib/scoring/tiers";
import { HINTED_COMMON_POINTS } from "@/lib/scoring/tiers";
import { sfx } from "@/lib/ui/sfx";
import { TIER_UI } from "@/components/modes/dive/tiers";

type Props = {
  from: Tier;
  /** The Tier after the Hint, or null when a common Prompt drops to a flat 5 points. */
  to: Tier | null;
  used?: boolean;
  onUse: () => void;
  className?: string;
};

/** The Hint button: ghost style, shows the cost (`ABYSS → REEF`), usable once. */
export function HintButton({ from, to, used = false, onUse, className = "" }: Props) {
  const cost = `${TIER_UI[from].label.toUpperCase()} → ${to ? TIER_UI[to].label.toUpperCase() : `${HINTED_COMMON_POINTS} PTS`}`;
  return (
    <button
      type="button"
      disabled={used}
      onMouseEnter={() => sfx.hover()}
      onClick={() => {
        sfx.click();
        onUse();
      }}
      className={`inline-flex items-center gap-2 px-3 py-1 font-hud text-[16px] tracking-[0.12em] transition hover:text-caution disabled:opacity-50 sm:text-[18px] ${className}`}
      style={{ color: used ? "var(--faint)" : "var(--muted)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--caution) 45%, transparent)" }}
      aria-label={used ? "Hint used" : `Use hint: ${cost}`}
    >
      <span className="text-caution">?</span> {used ? "HINT USED" : "HINT"}
      <span className="text-faint">· {cost}</span>
    </button>
  );
}
