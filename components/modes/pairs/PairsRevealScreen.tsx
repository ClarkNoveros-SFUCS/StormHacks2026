"use client";
// The Pairs Reveal (/runs/[runId]/reveal): THE TABLE. Total score, each Board's time and bonus,
// and every pair laid out with its explanation and Evidence. Spec: docs/design/modes/pairs.md § Reveal.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EvidenceLine } from "@/components/results/EvidenceLine";
import { ResultHeader } from "@/components/results/ResultHeader";
import { Logo } from "@/components/ui/Logo";
import { Mascot } from "@/components/ui/Mascot";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { RunApiError, runApi } from "@/lib/runs/client";
import type { PairsReveal } from "@/lib/runs/types";
import { sfx } from "@/lib/ui/sfx";
import { MasteryBlock } from "../shared/MasteryBlock";
import { revealTopic, TopicPassBanner } from "../shared/TopicPassBanner";
import s from "./pairs.module.css";
import { revealLinks } from "../shared/reveal-links";
import { AskSonarButton } from "@/components/sonar/AskSonarButton";

type Props = {
  reveal: PairsReveal;
  context: { runId: string; gameId: string; moduleId: string; gameTitle: string };
  history: { number: number; scores: number[] };
};

export function PairsRevealScreen({ reveal, context, history }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summary = reveal.summary.mode === "pairs" ? reveal.summary : null;
  const stats = summary?.stats;
  const cleared = summary?.outcome === "cleared";
  const totalPairs = reveal.boards.reduce((n, b) => n + b.pairs.length, 0);
  const topic = revealTopic(reveal);

  const links = revealLinks(reveal, context);
  const evidenceHref = links.evidenceHref;

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
      setError(e instanceof RunApiError ? e.message : "Couldn't deal a new table");
    }
  };

  return (
    <div data-theme="pairs" className={`${s.room} font-sans`}>
      <div className="absolute top-3 right-3 z-10 sm:top-5 sm:right-6">
        <SoundToggle />
      </div>
      <div className="pointer-events-none absolute top-24 right-[6%] hidden xl:block">
        <Mascot size={84} mood={reveal.progress?.isNewPersonalBest || cleared ? "happy" : undefined} followCursor={false} />
      </div>

      <main className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-4 pt-6 pb-20 sm:px-6 sm:pt-10" style={{ animation: "page-in .5s var(--ease-out) both" }}>
        <ResultHeader
          title={`PAIRS #${history.number} · THE TABLE`}
          score={reveal.score}
          secondary={cleared ? "ALL PAIRS" : "TIME!"}
          personalBest={reveal.progress?.isNewPersonalBest}
          logo={<Logo size="sm" />}
        />

        <TopicPassBanner topic={topic} />

        {stats && (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="BOARDS CLEARED" value={`${stats.boardsCleared}/${reveal.boards.length}`} tone={stats.boardsCleared === reveal.boards.length ? "var(--success)" : "var(--text)"} />
            <Stat label="PAIRS" value={`${stats.matches}/${totalPairs}`} tone="var(--reward)" />
            <Stat label="MISSES" value={String(stats.mistakes)} tone={stats.mistakes ? "#ff8a96" : "var(--success)"} />
            <Stat label="TIME BONUS" value={`+${stats.timeBonus}`} tone="var(--signal)" />
          </dl>
        )}
        {!topic && (
          <p className="-mt-4 font-hud text-[16px] tracking-[0.2em] text-muted">
            {reveal.passed ? "★ PASS BAR MET · BOTH BOARDS CLEARED" : "PASS BAR · CLEAR BOTH BOARDS"}
          </p>
        )}

        {reveal.boards.map((b) => (
          <section key={b.board} className={`${s.table} px-3 py-4 sm:px-6 sm:py-6`} aria-labelledby={`board-${b.board}`}>
            <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id={`board-${b.board}`} className="font-display text-[24px] text-text">
                Board {b.board}
              </h2>
              <p className="font-hud text-[18px] tracking-[0.15em]">
                <span style={{ color: b.cleared ? "var(--success)" : "#ff8a96" }}>{b.cleared ? "CLEARED" : b.seconds === null ? "NOT PLAYED" : "TIME RAN OUT"}</span>
                {b.seconds !== null && <span className="text-muted"> · {b.seconds} s</span>}
                <span className="text-muted"> · {b.mistakes} miss{b.mistakes === 1 ? "" : "es"}</span>
                {b.timeBonus > 0 && <span className="text-reward"> · +{b.timeBonus} bonus</span>}
              </p>
            </header>
            <ul className="flex flex-col gap-3">
              {b.pairs.map((p, i) => (
                <li key={i} className="stagger" style={{ ["--i" as string]: i }}>
                  <div
                    className="rounded-md p-3 sm:p-4"
                    style={{
                      background: p.matched ? "var(--card)" : "color-mix(in srgb, var(--card) 72%, #7a6a55)",
                      color: "var(--card-ink)",
                      boxShadow: `0 -2px 0 0 var(--ink), 0 2px 0 0 var(--ink), -2px 0 0 0 var(--ink), 2px 0 0 0 var(--ink), inset 5px 0 0 0 ${p.matched ? "#3ddc97" : "#d9562e"}, 0 4px 0 0 rgba(0,0,0,.3)`,
                    }}
                  >
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
                      <p className="shrink-0 font-display text-[17px] font-semibold sm:w-[34%]">
                        <span aria-hidden="true" className="mr-1.5" style={{ color: "var(--card-term)" }}>
                          ◆
                        </span>
                        {p.term}
                      </p>
                      <p className="min-w-0 flex-1 text-[14px] leading-snug">{p.definition}</p>
                      <p className="shrink-0 font-hud text-[20px] leading-none" style={{ color: p.matched ? "#1f9e64" : "#b23a1d" }}>
                        {p.matched ? `✓ +${p.points}` : "✗ missed"}
                      </p>
                    </div>
                    {p.explanation && <p className="mt-2 text-[13px] leading-snug" style={{ color: "var(--card-muted)" }}>{p.explanation}</p>}
                    {p.evidence && (
                      <div className="mt-2 rounded-sm bg-[#062720] px-2.5 py-1.5">
                        <EvidenceLine evidence={p.evidence} href={evidenceHref(p.evidence)} />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <MasteryBlock progress={reveal.progress} />

        <div className="flex flex-col items-center gap-4 pt-2">
          {error && <p className="font-hud text-[18px] text-danger">{error}</p>}
          <button type="button" onClick={again} disabled={pending} className="px-btn h-14 px-8 text-[22px]" data-variant="primary">
            {pending ? "DEALING…" : "DEAL AGAIN ▶"}
          </button>
          <button
            type="button"
            onClick={() => router.push(links.backHref)}
            className="font-hud text-[18px] tracking-[0.25em] text-muted underline-offset-4 hover:text-text hover:underline"
          >
            {links.backLabel.toUpperCase()}
          </button>
          <AskSonarButton size="sm" message="What should I learn from this run?" />
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`${s.plate} flex flex-col items-start rounded-sm px-3 py-2`}>
      <dt className="font-hud text-[13px] tracking-[0.2em] text-muted">{label}</dt>
      <dd className="font-hud text-[32px] leading-none tabular-nums" style={{ color: tone }}>
        {value}
      </dd>
    </div>
  );
}
