"use client";
// Dive's stats block on the Game page (docs/design/modes/dive.md §4): PERSONAL BEST as depth,
// MASTERY with a Meter, and FOUND per Tier. Prop-driven; F09 may refine the look.
import { FoundRows, MasteryStat, StatNumber, StatPanel, type MasteryValue } from "@/components/modes/GameStatKit";
import { PixelIcon } from "@/components/ui/PixelIcon";
import type { Tier } from "@/lib/scoring/tiers";
import { depthForScore, TIER_ORDER, TIER_UI } from "./tiers";

export type DiveGameStatsProps = {
  personalBest: number;
  mastery: MasteryValue;
  byTier: Record<Tier, { found: number; total: number }>;
  /** Finished dives. */
  runs: number;
};

export function DiveGameStats({ personalBest, mastery, byTier, runs }: DiveGameStatsProps) {
  return (
    <StatPanel mode="dive" className="dv-panel !rounded-none !border-0">
      <div className="grid gap-5 sm:grid-cols-2">
        <StatNumber
          label="Personal best"
          value={personalBest}
          format={(n) => (n <= 0 ? "0" : `−${depthForScore(n).toLocaleString("en-US")}`)}
          unit="M"
          tone="var(--reward)"
          glow={personalBest > 0}
          sub={personalBest > 0 ? `${personalBest.toLocaleString("en-US")} pts · ${runs} ${runs === 1 ? "dive" : "dives"}` : "No dives yet"}
        />
        <MasteryStat mastery={mastery} />
      </div>
      <div className="mt-5">
        <FoundRows
          rows={TIER_ORDER.map((t) => ({
            key: t,
            label: TIER_UI[t].label,
            icon: <PixelIcon name={TIER_UI[t].icon} size={18} palette={{ c: TIER_UI[t].hex, b: TIER_UI[t].hex, v: TIER_UI[t].hex, y: TIER_UI[t].hex }} />,
            color: TIER_UI[t].color,
            found: byTier[t].found,
            total: byTier[t].total,
          }))}
        />
      </div>
    </StatPanel>
  );
}
