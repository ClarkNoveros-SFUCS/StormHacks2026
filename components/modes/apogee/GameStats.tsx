"use client";
// Apogee's stats block on the Game page: best altitude in km (1 point = 1 km, docs/design/modes/apogee.md),
// Mastery, and FOUND per altitude band. Prop-driven; F24 may refine the look.
import { FoundRows, MasteryStat, StatNumber, StatPanel, type MasteryValue } from "@/components/modes/GameStatKit";
import { PixelIcon, type PixelIconName } from "@/components/ui/PixelIcon";
import { MODES } from "@/lib/modes";
import { TIERS, type Tier } from "@/lib/scoring/tiers";

export type ApogeeGameStatsProps = {
  personalBest: number;
  mastery: MasteryValue;
  byTier: Record<Tier, { found: number; total: number }>;
  runs: number;
};

const BAND_HEX = ["#8fa3c4", "#8fd3ff", "#c39bff", "#ffe08a"] as const;
const BAND_ICON: PixelIconName[] = ["bubble", "rocket", "star", "sparkle"];

export function ApogeeGameStats({ personalBest, mastery, byTier, runs }: ApogeeGameStatsProps) {
  return (
    <StatPanel mode="apogee">
      <div className="grid gap-5 sm:grid-cols-2">
        <StatNumber
          label="Best altitude"
          value={personalBest}
          unit="KM"
          tone="var(--reward)"
          glow={personalBest > 0}
          sub={personalBest > 0 ? `${runs} ${runs === 1 ? "launch" : "launches"}` : "Still on the pad"}
        />
        <MasteryStat mastery={mastery} />
      </div>
      <div className="mt-5">
        <FoundRows
          title="Reached"
          rows={TIERS.map((t, i) => {
            const hex = BAND_HEX[i];
            return {
              key: t,
              label: MODES.apogee.bands[i],
              icon: <PixelIcon name={BAND_ICON[i]} size={18} palette={{ c: hex, b: hex, v: hex, y: hex, s: hex }} />,
              color: `var(--band-${i + 1})`,
              found: byTier[t].found,
              total: byTier[t].total,
            };
          })}
        />
      </div>
    </StatPanel>
  );
}
