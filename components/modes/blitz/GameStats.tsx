"use client";
// Blitz's stats block on the Game page: best score, best Combo and Mastery.
// Prop-driven; F25 may refine the look. Words: docs/design/modes/blitz.md.
import { MasteryStat, StatNumber, StatPanel, type MasteryValue } from "@/components/modes/GameStatKit";
import { BLITZ_COMBO_AT } from "@/lib/modes/blitz/rules";

export type BlitzGameStatsProps = {
  personalBest: number;
  bestCombo: number;
  bestCorrect: number;
  mastery: MasteryValue;
  runs: number;
};

export function BlitzGameStats({ personalBest, bestCombo, bestCorrect, mastery, runs }: BlitzGameStatsProps) {
  return (
    <StatPanel mode="blitz">
      <div className="grid gap-5 sm:grid-cols-2">
        <StatNumber
          label="Best score"
          value={personalBest}
          tone="var(--reward)"
          glow={personalBest > 0}
          sub={runs > 0 ? `${bestCorrect} right in one blitz · ${runs} played` : "No blitzes yet"}
        />
        <StatNumber
          label="Best combo"
          value={bestCombo}
          tone="var(--accent)"
          glow={bestCombo >= BLITZ_COMBO_AT}
          sub={bestCombo >= BLITZ_COMBO_AT ? "in a row · you hit COMBO ×2" : `in a row · ${BLITZ_COMBO_AT} starts COMBO ×2`}
        />
      </div>
      <div className="mt-5">
        <MasteryStat mastery={mastery} label="Statements learned" />
      </div>
    </StatPanel>
  );
}
