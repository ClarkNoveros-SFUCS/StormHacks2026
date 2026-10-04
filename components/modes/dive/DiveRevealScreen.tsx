"use client";
// The Dive Reveal page (/runs/[runId]/reveal): DiveReveal wired to the real Reveal payload.
// Spec: docs/design/modes/dive.md §7.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RunApiError, runApi } from "@/lib/runs/client";
import type { DiveReveal as DiveRevealData, Evidence } from "@/lib/runs/types";
import { sfx } from "@/lib/ui/sfx";
import { DiveReveal } from "./DiveReveal";

type Props = {
  reveal: DiveRevealData;
  context: { runId: string; gameId: string; moduleId: string; gameTitle: string };
  /** This Player's finished dives on the Game, up to this one. */
  history: { number: number; scores: number[] };
  /**
   * Public Games (Daily Dive, Courses; F23): today's players instead of your own dives.
   * When given, it replaces the personal curve.
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
  return `BETTER THAN ${beaten} OF YOUR ${scores.length} DIVES`;
}

export function DiveRevealScreen({ reveal, context, history, crowd, title }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progress = reveal.progress;

  const evidenceHref = (e: NonNullable<Evidence>) => `/modules/${context.moduleId}?doc=${e.documentId}&page=${e.pageNumber}`;

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

  return (
    <div data-theme="dive" className="relative isolate h-[100dvh] w-full overflow-hidden bg-bg font-hud text-text">
      <DiveReveal
        title={title ?? `DIVE #${history.number} COMPLETE`}
        score={reveal.score}
        prompts={reveal.prompts}
        distribution={
          crowd ?? {
            values: history.scores,
            caption: personalCaption(reveal.score, history.scores),
            best: progress?.personalBest ?? null,
          }
        }
        personalBest={progress?.isNewPersonalBest}
        mastery={progress && { before: progress.masteryBefore, after: progress.masteryAfter }}
        evidenceHref={evidenceHref}
        onAgain={again}
        againPending={pending}
        notice={error && <p className="font-hud text-[18px] text-danger">{error}</p>}
        onBack={() => router.push(`/games/${context.gameId}`)}
        backLabel="BACK TO GAME"
      />
    </div>
  );
}
