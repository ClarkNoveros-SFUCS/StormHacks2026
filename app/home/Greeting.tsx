"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Mascot, StreakFlame, type MascotHandle } from "@/components/ui";
import type { Streak } from "@/lib/social/types";

const noop = () => () => {};

function hello(hour: number | null): string {
  if (hour === null) return "Welcome back";
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Up late";
}

function nudge(streak: Streak, hasModules: boolean, hasPlayed: boolean): string {
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  if (streak.playedToday) return `Streak safe for today: ${days(streak.current)} and counting. I'm proud of you.`;
  if (streak.current > 0) return `Your ${days(streak.current)} streak goes out at midnight. One Run keeps the flame lit!`;
  if (!hasModules && !hasPlayed) return "New down here? Make a Module from your notes, or warm up with the Python Basics course.";
  return "Play one Run today to light your streak. I'll keep the lantern on.";
}

/** "Good evening, Anton!" with Lumen and a speech bubble: time of day plus a streak nudge. */
export function Greeting({ name, streak, hasModules, hasPlayed }: { name: string; streak: Streak; hasModules: boolean; hasPlayed: boolean }) {
  // Local time on the client; the server renders a neutral greeting.
  const hour = useSyncExternalStore(noop, () => new Date().getHours(), () => null);
  const lumen = useRef<MascotHandle>(null);
  useEffect(() => {
    const t = setTimeout(() => lumen.current?.react(streak.playedToday ? "happy" : "wow"), 700);
    return () => clearTimeout(t);
  }, [streak.playedToday]);
  const first = name.split(" ")[0] || name;

  return (
    <section aria-labelledby="greeting" className="flex items-end gap-3 sm:gap-5">
      <div className="shrink-0">
        <Mascot ref={lumen} size={92} sleepAfterMs={40000} />
      </div>
      <div className="relative mb-5 min-w-0 flex-1 rounded-lg border-2 border-border-strong bg-surface/95 px-5 py-4 shadow-xl backdrop-blur" style={{ animation: "pop-in .45s var(--ease-snap) both" }}>
        <span aria-hidden="true" className="absolute bottom-4 -left-[9px] h-4 w-4 rotate-45 border-b-2 border-l-2 border-border-strong bg-surface" />
        <h1 id="greeting" className="text-[clamp(22px,3.4vw,30px)] text-text">
          {hello(hour)}, {first}!
        </h1>
        <p className="mt-1 flex items-center gap-2 text-muted">
          {streak.current > 0 && <StreakFlame days={streak.current} active={streak.playedToday} size={20} showCount={false} />}
          <span>{nudge(streak, hasModules, hasPlayed)}</span>
        </p>
      </div>
    </section>
  );
}
