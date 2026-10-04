"use client";
// The Blitz Reveal (/runs/[runId]/reveal): REPLAY. Score, accuracy, best combo, a strip of every
// answer, then every statement with its truth, your answer, the explanation and Evidence.
// Spec: docs/design/modes/blitz.md § Reveal.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EvidenceLine } from "@/components/results/EvidenceLine";
import { ResultHeader } from "@/components/results/ResultHeader";
import { Logo } from "@/components/ui/Logo";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { BLITZ_PASS_SCORE } from "@/lib/modes/blitz/rules";
import { RunApiError, runApi } from "@/lib/runs/client";
import type { BlitzReveal, BlitzRevealStatement } from "@/lib/runs/types";
import { sfx } from "@/lib/ui/sfx";
import { MasteryBlock } from "../shared/MasteryBlock";
import { revealTopic, TopicPassBanner } from "../shared/TopicPassBanner";
import { accuracy } from "./beat";
import s from "./blitz.module.css";
import { revealLinks } from "../shared/reveal-links";
import { AskSonarButton } from "@/components/sonar/AskSonarButton";

type Props = {
  reveal: BlitzReveal;
  context: { runId: string; gameId: string; moduleId: string; gameTitle: string };
  history: { number: number; scores: number[] };
};

type Filter = "all" | "missed";

export function BlitzRevealScreen({ reveal, context, history }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const summary = reveal.summary.mode === "blitz" ? reveal.summary : null;
  const stats = summary?.stats;
  const topic = revealTopic(reveal);
  const missed = reveal.statements.filter((st) => !st.correct);
  const shown = filter === "all" ? reveal.statements : missed;

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
      setError(e instanceof RunApiError ? e.message : "Couldn't start a new Blitz");
    }
  };

  return (
    <div data-theme="blitz" className={`${s.replay} font-sans`}>
      <div className={s.stars} style={{ position: "fixed" }} aria-hidden="true" />
      <div className="absolute top-3 right-3 z-20 sm:top-5 sm:right-6">
        <SoundToggle />
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-[760px] flex-col gap-8 px-4 pt-6 pb-20 sm:px-6 sm:pt-10" style={{ animation: "page-in .5s var(--ease-out) both" }}>
        <ResultHeader
          title={`BLITZ #${history.number} · REPLAY`}
          score={reveal.score}
          secondary={summary?.outcome === "deck_cleared" ? "DECK CLEARED" : "TIME!"}
          personalBest={reveal.progress?.isNewPersonalBest}
          logo={<Logo size="sm" />}
        />

        <TopicPassBanner topic={topic} />

        {stats && (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="ACCURACY" value={`${accuracy(stats.correct, stats.answered)}%`} glow={s.neonCyan} />
            <Stat label="BEST COMBO" value={String(stats.bestCombo)} glow={s.neonYellow} />
            <Stat label="RIGHT" value={`${stats.correct}/${stats.answered}`} glow={s.neonCyan} />
            <Stat label="WRONG" value={String(stats.wrong)} glow={s.neonPink} />
          </dl>
        )}
        {!topic && (
          <p className="-mt-4 font-hud text-[16px] tracking-[0.2em] text-muted">
            {reveal.passed ? `★ PASS BAR MET · ${BLITZ_PASS_SCORE}+ POINTS` : `PASS BAR · ${BLITZ_PASS_SCORE} POINTS`}
          </p>
        )}

        {/* the run as a strip: one cell per statement */}
        {reveal.statements.length > 0 && (
          <section>
            <h3 className="label-line">THE RUN</h3>
            <ol className="mt-3 flex flex-wrap gap-1" aria-label="Every answer in order">
              {reveal.statements.map((st, i) => (
                <li
                  key={st.position}
                  title={`${st.position}. ${st.correct ? "right" : st.yourAnswer === null ? "no answer" : "wrong"}`}
                  className="h-5 w-5 rounded-[2px]"
                  style={{
                    background: st.correct ? (st.points > 10 ? "var(--reward)" : "var(--signal)") : st.yourAnswer === null ? "var(--band-miss)" : "var(--danger)",
                    boxShadow: st.correct ? `0 0 8px ${st.points > 10 ? "var(--reward)" : "var(--signal)"}` : undefined,
                    animation: `pop-in .3s var(--ease-snap) ${Math.min(i, 40) * 25}ms both`,
                  }}
                >
                  <span className="sr-only">
                    {st.position}: {st.correct ? `right, plus ${st.points}` : st.yourAnswer === null ? "no answer" : "wrong"}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-2 font-hud text-[14px] tracking-[0.15em] text-faint">
              <span className="text-signal">■</span> +10 · <span className="text-reward">■</span> +20 COMBO · <span className="text-danger">■</span> WRONG · <span className="text-muted">■</span> NO ANSWER
            </p>
          </section>
        )}

        <section aria-labelledby="replay-list">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="replay-list" className="label-line flex-1">
              EVERY STATEMENT
            </h3>
            <div role="tablist" aria-label="Filter statements" className="flex gap-1 font-hud text-[16px] tracking-[0.15em]">
              {(["all", "missed"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={filter === f}
                  onClick={() => {
                    sfx.toggle();
                    setFilter(f);
                  }}
                  className={`px-3 py-1 ${filter === f ? "bg-surface-2 text-text" : "text-muted hover:text-text"}`}
                  style={{ boxShadow: filter === f ? "0 0 0 2px var(--accent), 0 0 12px color-mix(in srgb, var(--accent) 50%, transparent)" : "0 0 0 1px var(--border)" }}
                >
                  {f === "all" ? `ALL ${reveal.statements.length}` : `MISSED ${missed.length}`}
                </button>
              ))}
            </div>
          </div>
          <ul className="mt-4 flex flex-col gap-3">
            {shown.length === 0 && <li className="font-hud text-[20px] text-signal">Nothing missed. Clean run.</li>}
            {shown.map((st, i) => (
              <StatementRow key={st.position} st={st} i={i} href={st.evidence ? evidenceHref(st.evidence) : null} />
            ))}
          </ul>
        </section>

        <MasteryBlock progress={reveal.progress} />

        <div className="flex flex-col items-center gap-4 pt-2">
          {error && <p className="font-hud text-[18px] text-danger">{error}</p>}
          <button type="button" onClick={again} disabled={pending} className={`${s.answer} h-[68px] w-[240px] rounded-md`} data-value="true">
            <span className="text-[30px] leading-none">{pending ? "LOADING…" : "GO AGAIN ▶"}</span>
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

function Stat({ label, value, glow }: { label: string; value: string; glow: string }) {
  return (
    <div className={`${s.hudBox} flex flex-col items-start px-3 py-2`}>
      <dt className="font-hud text-[13px] tracking-[0.25em] text-muted">{label}</dt>
      <dd className={`font-hud text-[34px] leading-none tabular-nums ${glow}`}>{value}</dd>
    </div>
  );
}

function StatementRow({ st, i, href }: { st: BlitzRevealStatement; i: number; href: string | null }) {
  const tone = st.correct ? "var(--signal)" : st.yourAnswer === null ? "var(--faint)" : "var(--danger)";
  return (
    <li className="stagger" style={{ ["--i" as string]: Math.min(i, 12) }}>
      <div className="bg-surface/90 px-4 py-3" style={{ boxShadow: `inset 4px 0 0 ${tone}, 0 0 0 1px var(--border)` }}>
        <div className="flex items-start gap-3">
          <span className="w-7 shrink-0 pt-0.5 font-hud text-[18px] text-faint tabular-nums">{st.position}</span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[17px] leading-snug text-text">{st.text}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-hud text-[17px] tracking-[0.1em]">
              <span
                className="px-1.5"
                style={{
                  color: st.isTrue ? "var(--neon-true)" : "var(--neon-false)",
                  boxShadow: `0 0 0 1px ${st.isTrue ? "var(--neon-true)" : "var(--neon-false)"}`,
                }}
              >
                {st.isTrue ? "TRUE" : "FALSE"}
              </span>
              <span style={{ color: tone }}>
                {st.yourAnswer === null ? "no answer" : `you said ${st.yourAnswer ? "TRUE" : "FALSE"} ${st.correct ? "✓" : "✗"}`}
              </span>
              {st.points > 0 && <span className="text-reward">+{st.points}</span>}
            </p>
            {st.explanation && <p className="mt-1.5 text-[14px] leading-snug text-muted">{st.explanation}</p>}
            {st.evidence && <EvidenceLine evidence={st.evidence} href={href} className="mt-1.5" />}
          </div>
        </div>
      </div>
    </li>
  );
}
