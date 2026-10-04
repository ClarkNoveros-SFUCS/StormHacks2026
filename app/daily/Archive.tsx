"use client";
import { SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { TierSquares } from "@/components/daily/TierSquares";
import { dayLabel, metres } from "@/components/daily/format";
import { Button, Chip, PixelIcon } from "@/components/ui";
import type { DailyArchiveEntry } from "@/lib/daily/types";
import { usePlay } from "./play";

/** Past Dailies, newest first: your counted result and a practice replay. */
export function Archive({ days, signedIn }: { days: DailyArchiveEntry[]; signedIn: boolean }) {
  const play = usePlay();
  const past = days.filter((d) => !d.isToday);
  return (
    <section id="archive" aria-labelledby="archive-title" className="card scroll-mt-24 bg-surface/95 p-4 sm:p-6">
      <h2 id="archive-title" className="flex items-center gap-2 font-display text-xl text-text">
        <PixelIcon name="book" size={20} /> The archive
      </h2>
      <p className="mt-1 text-sm text-muted">Every past Daily, replayable as practice. Practice dives earn XP and find new answers, but never touch a day&apos;s board.</p>

      <ol className="stagger mt-4 flex flex-col gap-2">
        {days.map((d, i) => {
          const counted = d.me?.counted ?? null;
          return (
            <li
              key={d.number}
              style={{ "--i": i } as React.CSSProperties}
              className={`flex flex-col gap-3 rounded-md border px-3 py-3 sm:flex-row sm:items-center ${d.isToday ? "border-accent/60 bg-[#1f1430]" : "border-border/70 bg-bg-2/80"}`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="w-14 shrink-0 text-center font-hud text-[34px] leading-none text-accent" aria-label={`Daily number ${d.number}`}>
                  #{d.number}
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>{dayLabel(d.day)}</span>
                    <Chip tone={d.isToday ? "accent" : "neutral"} size="sm">
                      {d.isToday ? "Today" : d.theme}
                    </Chip>
                    <span>
                      {d.players.toLocaleString("en-US")} {d.players === 1 ? "diver" : "divers"}
                    </span>
                  </p>
                  <p className="truncate font-display text-base text-text">{d.title}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 sm:justify-end">
                {counted ? (
                  <div className="flex items-center gap-2">
                    <TierSquares tiers={counted.tiers} size={12} animate={false} className="gap-0.5" />
                    <span className="font-hud text-xl text-reward">{metres(counted.score)}</span>
                  </div>
                ) : d.me && d.me.runs > 0 ? (
                  <span className="text-xs text-muted">
                    Best practice <span className="font-hud text-lg text-text">{metres(d.me.bestScore ?? 0)}</span>
                  </span>
                ) : (
                  <span className="text-xs text-faint">{signedIn ? "Not played" : ""}</span>
                )}
                {d.isToday ? (
                  <Link href="#today" className="shrink-0 text-sm text-accent underline-offset-4 hover:underline">
                    Today ▴
                  </Link>
                ) : signedIn ? (
                  <Button size="sm" onClick={() => play.practice(d.gameId)} disabled={!!play.pending} iconRight="▶">
                    {play.pending === d.gameId ? "Diving…" : "Practice"}
                  </Button>
                ) : (
                  <SignInButton mode="modal" forceRedirectUrl="/daily">
                    <Button size="sm" iconRight="▶">
                      Practice
                    </Button>
                  </SignInButton>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {past.length === 0 && (
        <p className="mt-4 flex items-center gap-2 rounded-md border border-dashed border-border-strong px-3 py-3 text-sm text-muted">
          <PixelIcon name="clock" size={16} /> Nothing here yet: today&apos;s puzzle joins the archive at midnight, and every one after it.
        </p>
      )}
    </section>
  );
}
