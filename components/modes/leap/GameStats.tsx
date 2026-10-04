"use client";
// Leap's stats block on the Game page: best score, best streak, Hearts left on the best climb,
// and Mastery. Prop-driven; F24 may refine the look. Words: docs/design/modes/leap.md.
import { MasteryStat, StatLabel, StatNumber, StatPanel, type MasteryValue } from "@/components/modes/GameStatKit";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { LEAP_HEARTS } from "@/lib/modes/leap/rules";

export type LeapGameStatsProps = {
  personalBest: number;
  bestStreak: number;
  /** Hearts left on the best-scoring climb; null before the first. */
  heartsLeft: number | null;
  summits: number;
  mastery: MasteryValue;
  runs: number;
};

export function LeapGameStats({ personalBest, bestStreak, heartsLeft, summits, mastery, runs }: LeapGameStatsProps) {
  return (
    <StatPanel mode="leap">
      <div className="grid gap-5 sm:grid-cols-2">
        <StatNumber
          label="Best score"
          value={personalBest}
          tone="var(--reward)"
          glow={personalBest > 0}
          sub={runs > 0 ? `${summits} ${summits === 1 ? "summit" : "summits"} · ${runs} ${runs === 1 ? "climb" : "climbs"}` : "No climbs yet"}
        />
        <MasteryStat mastery={mastery} />
        <StatNumber label="Best streak" value={bestStreak} format={(n) => `${Math.round(n)} IN A ROW`} tone="var(--accent)" />
        <div>
          <StatLabel>Hearts left</StatLabel>
          <div
            className="mt-2 flex items-center gap-1.5"
            role="img"
            aria-label={heartsLeft === null ? "No climbs yet" : `${heartsLeft} of ${LEAP_HEARTS} hearts left on your best climb`}
          >
            {Array.from({ length: LEAP_HEARTS }, (_, i) => {
              const full = heartsLeft !== null && i < heartsLeft;
              return (
                <span
                  key={i}
                  className="transition-transform duration-200 hover:-translate-y-1 hover:scale-110"
                  style={{ opacity: full ? 1 : 0.28, filter: full ? undefined : "grayscale(1)", animation: full ? `pop-in .4s ${i * 120 + 300}ms both` : undefined }}
                >
                  <PixelIcon name="heart" size={30} />
                </span>
              );
            })}
          </div>
          <div className="mt-1 text-sm text-muted">{heartsLeft === null ? "—" : "on your best climb"}</div>
        </div>
      </div>
    </StatPanel>
  );
}
