"use client";
// The Dive Reveal page (/runs/[runId]/reveal): DiveReveal wired to the real Reveal payload.
// Spec: docs/design/modes/dive.md §7. A Daily Dive Run (F23/F28) adds today's crowd (the
// distribution of today's players, "% found" per Answer) and the Daily block (share, counted or
// practice, today's leaderboard).
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { crowdCaption, findRateLookup, histogramPoints, metres } from "@/components/daily/format";
import { ShareButton } from "@/components/daily/ShareButton";
import { TierSquares } from "@/components/daily/TierSquares";
import { celebrate } from "@/components/ui/Confetti";
import { vancouverDay } from "@/lib/daily/days";
import type { CrowdReveal, DailyReveal } from "@/lib/daily/types";
import { RunApiError, runApi } from "@/lib/runs/client";
import type { DiveReveal as DiveRevealData } from "@/lib/runs/types";
import { sfx } from "@/lib/ui/sfx";
import { DiveReveal } from "./DiveReveal";
import { revealLinks } from "../shared/reveal-links";
import { revealTopic, TopicPassBanner } from "../shared/TopicPassBanner";

type Props = {
  reveal: DiveRevealData;
  context: { runId: string; gameId: string; moduleId: string; gameTitle: string };
  /** This Player's finished dives on the Game, up to this one. */
  history: { number: number; scores: number[] };
  /**
   * Public Games other than the Daily (Courses): a crowd curve instead of your own dives.
   * The Daily's comes from `reveal.crowd`.
   */
  crowd?: { values: number[]; caption: string } | null;
  /** Overrides `DIVE #N COMPLETE` (the Daily uses its day number). */
  title?: string;
};

/** "BETTER THAN 6 OF YOUR 9 DIVES", or a first-dive line when there's nothing to compare. */
export function personalCaption(score: number, scores: number[]): string {
  const others = scores.length - 1;
  if (others <= 0) return "YOUR FIRST DIVE ON THIS GAME · DIVE AGAIN TO DRAW YOUR CURVE";
  const beaten = scores.filter((s) => s < score).length;
  return `BETTER THAN ${beaten} OF YOUR ${others} OTHER DIVE${others === 1 ? "" : "S"}`;
}

/** The curve from the Daily's crowd: today's counted scores, weighted by bucket. */
function crowdDistribution(crowd: CrowdReveal, counted: boolean) {
  const { values, weights } = histogramPoints(crowd);
  const players = `${crowd.players.toLocaleString("en-US")} ${crowd.players === 1 ? "PLAYER" : "PLAYERS"} TODAY`;
  return {
    values,
    weights,
    minValues: 1,
    caption: crowdCaption(crowd, counted),
    subcaption: crowd.medianScore === null ? players : `${players} · MEDIAN ${metres(crowd.medianScore)}`,
  };
}

/** DAILY #N: counted or practice, the share grid and the copy button. */
function DailyBlock({ daily }: { daily: DailyReveal }) {
  return (
    <section className="dv-panel w-full px-4 py-4" aria-label={`Daily Dive #${daily.number}`} style={{ animation: "rise-in .5s var(--ease-out) .3s both" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-hud text-[16px] tracking-[0.22em] text-muted">{daily.title.toUpperCase()}</p>
        <span
          className="px-2 py-0.5 font-hud text-[15px] tracking-[0.2em]"
          style={{
            color: daily.counted ? "var(--success)" : "var(--caution)",
            boxShadow: `inset 0 0 0 1px ${daily.counted ? "var(--success)" : "var(--caution)"}`,
          }}
        >
          {daily.counted ? "✓ COUNTED" : "PRACTICE"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <TierSquares tiers={daily.tiers} size={26} />
        <ShareButton text={daily.shareText} look="dive" />
      </div>
      <p className="mt-3 font-sans text-[13px] text-muted">
        {daily.counted
          ? "This dive is on today's board. Replays from here are practice."
          : "Practice dive: your counted result stays on the board. Practice still finds new answers."}
      </p>
    </section>
  );
}

export function DiveRevealScreen({ reveal, context, history, crowd, title }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progress = reveal.progress;
  const daily = reveal.daily ?? null;
  const dailyCrowd = reveal.crowd ?? null;

  // A fresh counted Daily: a burst of confetti once (not on reload of an old one).
  useEffect(() => {
    if (!daily?.counted || daily.day !== vancouverDay(new Date())) return;
    const key = `daily-celebrated-${daily.number}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // storage blocked: celebrate anyway
    }
    const id = setTimeout(() => celebrate(), 900);
    return () => clearTimeout(id);
  }, [daily]);

  // The Daily's fact sheet belongs to the system "Daily Dive" Module, which Players can't open:
  // its Evidence stays plain text.
  // Course practice Games (F22): Evidence and Back go to the Topic page; the Topic-pass banner shows.
  const links = revealLinks(reveal, context);
  const topic = revealTopic(reveal);
  const evidenceHref = daily ? () => null : links.evidenceHref;

  const again = async () => {
    if (pending) return;
    sfx.whoosh();
    setPending(true);
    setError(null);
    try {
      const { runId } = await runApi.create(context.gameId);
      router.push(`/runs/${runId}`);
    } catch (e) {
      setPending(false);
      setError(e instanceof RunApiError ? e.message : "Couldn't start a new dive");
    }
  };

  const isToday = daily ? daily.day === vancouverDay(new Date()) : false;
  const dailyActions = daily && (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => {
          sfx.click();
          router.push(isToday ? "/daily#leaderboard" : "/daily#archive");
        }}
        className="px-8 py-3 font-hud text-[22px] tracking-[0.2em] text-text transition hover:-translate-y-0.5 active:translate-y-[2px] sm:text-[24px]"
        style={{
          background: "color-mix(in srgb, var(--accent) 35%, #12081a)",
          boxShadow: "inset 0 0 0 3px var(--accent), 0 0 22px color-mix(in srgb, var(--accent) 40%, transparent), 0 5px 0 #3b0f22",
          animation: "btn-bob 2.4s ease-in-out infinite",
        }}
      >
        {isToday ? "SEE TODAY'S LEADERBOARD ▸" : "BACK TO THE ARCHIVE ▸"}
      </button>
      <button type="button" onClick={again} disabled={pending} className="font-hud text-[20px] tracking-[0.2em] text-signal transition hover:text-accent disabled:opacity-60">
        {pending ? "▼ DIVING… ▼" : "▼ PRACTICE DIVE ▼"}
      </button>
    </div>
  );

  return (
    <div data-theme="dive" className="relative isolate h-[100dvh] w-full overflow-hidden bg-bg font-hud text-text">
      <DiveReveal
        title={title ?? (daily ? `DAILY #${daily.number} COMPLETE` : `DIVE #${history.number} COMPLETE`)}
        score={reveal.score}
        prompts={reveal.prompts}
        distribution={
          daily && dailyCrowd
            ? crowdDistribution(dailyCrowd, daily.counted)
            : (crowd ?? {
                values: history.scores,
                caption: personalCaption(reveal.score, history.scores),
                best: progress?.personalBest ?? null,
              })
        }
        afterHeader={daily ? <DailyBlock daily={daily} /> : topic?.passed ? <TopicPassBanner topic={topic} /> : undefined}
        actions={dailyActions || undefined}
        findRate={daily ? findRateLookup(dailyCrowd) : undefined}
        personalBest={daily ? false : progress?.isNewPersonalBest}
        mastery={daily ? null : progress && { before: progress.masteryBefore, after: progress.masteryAfter }}
        evidenceHref={evidenceHref}
        onAgain={again}
        againPending={pending}
        notice={error && <p className="font-hud text-[18px] text-danger">{error}</p>}
        onBack={() => router.push(daily ? "/daily" : links.backHref)}
        backLabel={daily ? "BACK TO THE DAILY" : links.backLabel.toUpperCase()}
      />
    </div>
  );
}
