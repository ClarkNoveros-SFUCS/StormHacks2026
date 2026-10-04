"use client";
import { useRouter } from "next/navigation";
import { DawnScene } from "@/components/daily/DawnScene";
import { FlipClock } from "@/components/daily/FlipClock";
import { dayLabel, lumenLine } from "@/components/daily/format";
import { Chip, Mascot, Odometer, PixelIcon, StreakFlame } from "@/components/ui";
import type { DailyArchiveEntry, DailyToday, Leaderboard } from "@/lib/daily/types";
import { Archive } from "./Archive";
import { DailyBoard } from "./DailyBoard";
import { TodayCard } from "./TodayCard";

type Props = { daily: DailyToday; archive: DailyArchiveEntry[]; board: Leaderboard | null; betterThanPct: number | null };

/** Lumen with a speech bubble that wraps inside 375 px (the Mascot's own bubble doesn't). */
function Lumen({ say, mood, className = "" }: { say: string; mood?: "happy"; className?: string }) {
  return (
    <div className={`flex items-end gap-3 ${className}`}>
      <p
        className="relative mb-6 max-w-[260px] rounded-md border-2 border-border-strong bg-surface-2/95 px-3 py-2 font-display text-[13px] leading-snug text-text shadow-xl"
        style={{ animation: "pop-in .45s var(--ease-snap) .6s both" }}
      >
        {say}
        <span aria-hidden="true" className="absolute -right-[7px] bottom-3 h-3 w-3 rotate-45 border-t-2 border-r-2 border-border-strong bg-surface-2" />
      </p>
      <Mascot size={76} sleepAfterMs={0} mood={mood} className="shrink-0" />
    </div>
  );
}

const RULES: { icon: "target" | "lantern" | "cards"; text: string }[] = [
  { icon: "target", text: "Seven prompts, the same for everyone. 25 seconds each." },
  { icon: "lantern", text: "Rarer correct answers sink you deeper: Shallows, Reef, Abyss, Trench." },
  { icon: "cards", text: "Your first finished dive counts. Replays are practice." },
];

export function DailyHub({ daily, archive, board, betterThanPct }: Props) {
  const router = useRouter();
  const me = daily.me;
  const say = lumenLine(daily, betterThanPct);
  const happy = me?.status === "counted" ? "happy" : undefined;

  return (
    <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <DawnScene className="rounded-lg border border-border shadow-[0_20px_60px_-30px_rgba(255,138,106,.45)]">
        <div className="flex min-h-[300px] flex-col justify-end gap-4 p-5 sm:min-h-[380px] sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div className="min-w-0" style={{ animation: "rise-in .7s var(--ease-out) both" }}>
            <p className="font-display text-sm tracking-[0.22em] text-[#ffd391] uppercase">The Daily Dive · {dayLabel(daily.day)}</p>
            <h1 className="font-hud text-[clamp(104px,26vw,200px)] leading-[0.78] text-text" style={{ textShadow: "4px 0 0 var(--accent), -4px 0 0 var(--signal), 0 8px 30px rgba(0,0,0,.45)" }}>
              <span className="sr-only">Daily Dive </span>#{daily.number}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Chip tone="signal" size="md">
                {daily.theme}
              </Chip>
              <span className="font-display text-lg text-text sm:text-xl">{daily.title}</span>
            </div>
            <p className="mt-2 flex items-center gap-2 text-sm text-[#e9dcff]">
              <PixelIcon name="users" size={14} />
              <span className="font-hud text-xl text-reward">
                <Odometer value={daily.players} />
              </span>
              {daily.players === 1 ? "diver has" : "divers have"} surfaced today
            </p>
          </div>
          <Lumen say={say} mood={happy} className="hidden self-end md:flex" />
        </div>
      </DawnScene>
      <Lumen say={say} mood={happy} className="mt-4 justify-end md:hidden" />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 lg:col-start-1">
          <TodayCard daily={daily} board={board} betterThanPct={betterThanPct} />
        </div>

        <aside aria-label="Countdown and streak" className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <section className="card bg-surface/95 p-5" style={{ animation: "rise-in .5s var(--ease-out) .1s both" }}>
            <h2 className="label-line">Next Daily in</h2>
            <FlipClock className="mt-4 justify-center text-[38px] sm:text-[52px] lg:text-[44px]" target={daily.nextAt} serverNow={daily.serverNow} onDone={() => setTimeout(() => router.refresh(), 1500)} />
            <p className="mt-4 text-center text-xs text-faint">A new puzzle every midnight, Vancouver time.</p>
          </section>

          <section className="card bg-surface/95 p-5" style={{ animation: "rise-in .5s var(--ease-out) .2s both" }}>
            <h2 className="label-line">Daily streak</h2>
            {me ? (
              <div className="mt-3 flex items-center gap-4">
                <StreakFlame days={me.dailyStreak.current} active={me.dailyStreak.playedToday} size={56} showCount={false} />
                <div>
                  <p className="font-hud text-[44px] leading-none text-text">
                    {me.dailyStreak.current}
                    <span className="ml-2 font-display text-base text-muted">{me.dailyStreak.current === 1 ? "day" : "days"}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {me.dailyStreak.playedToday ? "Lit for today." : me.dailyStreak.current > 0 ? "Dive today to keep it burning." : "Dive today to light it."} Longest: {me.dailyStreak.longest}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 flex items-center gap-3 text-sm text-muted">
                <StreakFlame days={0} active={false} size={40} showCount={false} />
                Sign in and dive every day to grow a streak.
              </p>
            )}
          </section>

          <section className="card bg-surface/95 p-5" style={{ animation: "rise-in .5s var(--ease-out) .3s both" }}>
            <h2 className="label-line">How it works</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {RULES.map((r) => (
                <li key={r.icon} className="flex items-start gap-3 text-sm text-muted">
                  <PixelIcon name={r.icon} size={18} className="mt-0.5 shrink-0" />
                  {r.text}
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <div className="min-w-0 lg:col-start-1">
          <DailyBoard initial={board} signedIn={!!me} number={daily.number} />
        </div>
        <div className="min-w-0 lg:col-start-1">
          <Archive days={archive} signedIn={!!me} />
        </div>
      </div>
    </main>
  );
}
