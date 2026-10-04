"use client";
// Pairs' stats block on the Game page: best score, fastest time to clear both Boards, and Mastery.
// Prop-driven; F25 may refine the look. Words: docs/design/modes/pairs.md.
import { MasteryStat, StatLabel, StatNumber, StatPanel, type MasteryValue } from "@/components/modes/GameStatKit";
import { PixelIcon } from "@/components/ui/PixelIcon";

export type PairsGameStatsProps = {
  personalBest: number;
  /** Fastest clear of both Boards in ms; null if never cleared. */
  bestClearMs: number | null;
  clears: number;
  mastery: MasteryValue;
  runs: number;
};

/** 83_400 → "1:23.4" */
function clock(ms: number) {
  const t = Math.round(ms / 100);
  return `${Math.floor(t / 600)}:${String(Math.floor((t % 600) / 10)).padStart(2, "0")}.${t % 10}`;
}

export function PairsGameStats({ personalBest, bestClearMs, clears, mastery, runs }: PairsGameStatsProps) {
  return (
    <StatPanel mode="pairs">
      <div className="grid gap-5 sm:grid-cols-2">
        <StatNumber
          label="Best score"
          value={personalBest}
          tone="var(--signal)"
          glow={personalBest > 0}
          sub={runs > 0 ? `${clears} of ${runs} ${runs === 1 ? "round" : "rounds"} all pairs` : "No rounds yet"}
        />
        <div>
          <StatLabel>Best time</StatLabel>
          <div className="mt-1 flex items-center gap-2 font-hud text-[40px] leading-none text-accent sm:text-[48px]">
            <PixelIcon name="clock" size={26} />
            {bestClearMs === null ? <span className="text-muted">—:—</span> : <span>{clock(bestClearMs)}</span>}
          </div>
          <div className="mt-1 text-sm text-muted">{bestClearMs === null ? "Clear both boards to set one" : "to clear both boards"}</div>
        </div>
      </div>
      <div className="mt-5">
        <MasteryStat mastery={mastery} label="Pairs learned" />
      </div>
    </StatPanel>
  );
}
