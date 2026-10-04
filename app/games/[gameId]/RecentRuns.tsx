"use client";
// Recent Runs: number, date, the score in the Mode's words, the Mode's ending, and a link to
// each Reveal (/runs/[runId]/reveal).
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { Chip } from "@/components/ui/Chip";
import { sfx } from "@/lib/ui/sfx";
import type { ModeWords, PageRun } from "./model";

const SHOW = 6;

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Vancouver" });

export function RecentRuns({ runs, words, best }: { runs: PageRun[]; words: ModeWords; best: number }) {
  const [all, setAll] = useState(false);
  if (runs.length === 0) {
    return <p className="text-sm text-muted">No {words.runs} yet. Your first one shows up here with a link to its results.</p>;
  }
  const shown = all ? runs.slice(0, 20) : runs.slice(0, SHOW);
  const bestId = best > 0 ? runs.find((r) => r.score === best)?.runId : undefined;
  return (
    <div>
      <ol className="stagger grid gap-1.5">
        {shown.map((r, i) => {
          const isBest = r.runId === bestId;
          const outcome = r.outcome ? words.outcome?.[r.outcome] : undefined;
          return (
            <li key={r.runId} style={{ "--i": i } as CSSProperties}>
              <Link
                href={`/runs/${r.runId}/reveal`}
                onMouseEnter={() => sfx.hover()}
                className="group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border border-transparent px-3 py-2 transition duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-2 focus-visible:bg-surface-2"
              >
                <span className="font-hud text-[18px] text-faint tabular-nums">#{r.number}</span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`font-hud text-[22px] leading-none ${isBest ? "text-reward" : "text-text"}`}>{words.score(r.score)}</span>
                    {isBest && <Chip tone="reward">★ Best</Chip>}
                    {outcome && <Chip tone={r.outcome === "cleared" || r.outcome === "deck_cleared" ? "success" : "neutral"}>{outcome}</Chip>}
                  </span>
                  <span className="block text-[13px] text-muted" suppressHydrationWarning>{when(r.finishedAt)}</span>
                </span>
                <span className="font-display text-[13px] tracking-widest text-signal transition-transform duration-200 group-hover:translate-x-1">
                  RESULTS →
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      {runs.length > SHOW && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 px-3 text-sm text-signal underline-offset-4 hover:underline">
          {all ? "Show fewer" : `Show ${Math.min(20, runs.length) - SHOW} more`}
        </button>
      )}
    </div>
  );
}
