import { Odometer, PixelIcon, StreakFlame, XpBar } from "@/components/ui";
import type { LevelInfo, Streak } from "@/lib/social/types";
import { RankEmblem } from "./RankEmblem";

type Props = { level: LevelInfo; totalXp: number; badges: number; streak: Streak; className?: string };

function Stat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center">{icon}</span>
      <div className="min-w-0 leading-tight">
        <div className="font-display text-[17px] text-text">{value}</div>
        <div className="truncate text-[12px] text-muted">{label}</div>
      </div>
    </div>
  );
}

/**
 * The profile sidebar's stats: the ProfileCard's 2×2 (Total XP, Rank, Badges, Day streak, Q12)
 * in the same stepped pixel frame, plus the Level bar. No avatar or View profile button: the
 * page header already has both.
 */
export function StatsCard({ level, totalXp, badges, streak, className = "" }: Props) {
  return (
    <section aria-label="Stats" className={`px-frame m-[2px] bg-[#0d1124] p-5 ${className}`}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        <Stat icon={<PixelIcon name="star" size={30} />} value={<Odometer value={totalXp} />} label="Total XP" />
        <Stat icon={<RankEmblem rank={level.rank} size={30} />} value={level.rank} label={`Rank · Level ${level.level}`} />
        <Stat icon={<PixelIcon name="gem" size={30} />} value={<Odometer value={badges} />} label="Badges" />
        <Stat
          icon={<StreakFlame days={streak.current} active={streak.playedToday} showCount={false} size={30} />}
          value={<Odometer value={streak.current} />}
          label="Day streak"
        />
      </div>
      <div className="mt-5">
        <XpBar xp={totalXp} levelStartXp={level.levelStartXp} nextLevelXp={level.nextLevelXp} level={level.level} />
        <p className="mt-2 text-xs text-muted">
          {(level.nextLevelXp - totalXp).toLocaleString("en-US")} XP to Level {level.level + 1}
        </p>
      </div>
    </section>
  );
}
