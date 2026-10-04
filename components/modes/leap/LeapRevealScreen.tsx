"use client";
// The Leap Reveal: the CLIMB REPORT (/runs/[runId]/reveal for a Leap Run). The sky-island tower
// stays behind (the hopper where it ended, the flag raised on a summit), and the report scrolls
// over it: score, outcome, correct count, best streak, hearts left, then every question with your
// choice, the right option, its explanation and Evidence. Spec: docs/design/modes/leap.md § Climb Report.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RunApiError, runApi } from "@/lib/runs/client";
import type { Evidence, LeapReveal, LeapRevealQuestion } from "@/lib/runs/types";
import { sfx } from "@/lib/ui/sfx";
import { Meter } from "@/components/ui/Meter";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { DistributionChart } from "@/components/results/DistributionChart";
import { EvidenceLine } from "@/components/results/EvidenceLine";
import { ResultHeader } from "@/components/results/ResultHeader";
import { revealTopic, TopicPassBanner } from "@/components/results/TopicPassBanner";
import { LeapStage, type LeapStageHandle } from "./LeapStage";
import "./leap.css";

type Props = {
  reveal: LeapReveal;
  context: { runId: string; gameId: string; moduleId: string; gameTitle: string };
  history: { number: number; scores: number[] };
};

const MAX_SCORE = 2550;

function caption(score: number, scores: number[]): string {
  const others = scores.length - 1;
  if (others <= 0) return "YOUR FIRST CLIMB ON THIS GAME · CLIMB AGAIN TO DRAW YOUR CURVE";
  const beaten = scores.filter((s) => s < score).length;
  return `HIGHER THAN ${beaten} OF YOUR ${others} OTHER CLIMB${others === 1 ? "" : "S"}`;
}

export function LeapRevealScreen({ reveal, context, history }: Props) {
  const router = useRouter();
  const stage = useRef<LeapStageHandle>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const progress = reveal.progress;
  const [masteryShown, setMasteryShown] = useState(progress?.masteryBefore ?? 0);
  const summary = reveal.summary.mode === "leap" ? reveal.summary : null;
  const outcome = summary?.outcome ?? "cleared";
  const stats = summary?.stats;
  const qs = reveal.questions;
  const count = qs.length || 10;
  const platform = qs.filter((q) => q.outcome === "correct").reduce((m, q) => Math.max(m, q.position), 0);
  const crumbled = qs.filter((q) => q.outcome === "wrong" || q.outcome === "timeout").map((q) => q.position);
  const fellAt = outcome === "fell" ? (qs.filter((q) => q.outcome !== null).at(-1)?.position ?? null) : null;
  const topic = revealTopic(reveal);

  // Replay the ending: the flag goes up on a summit; on a fall the hopper leaps for the last island and drops.
  useEffect(() => {
    const id = setTimeout(() => stage.current?.run((s) => (outcome === "cleared" ? s.summit() : fellAt ? s.miss(fellAt, true) : undefined)), 700);
    return () => clearTimeout(id);
  }, [outcome, fellAt]);

  useEffect(() => {
    if (!progress) return;
    const id = setTimeout(() => setMasteryShown(progress.masteryAfter), 1400);
    return () => clearTimeout(id);
  }, [progress]);

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
      setError(e instanceof RunApiError ? e.message : "Couldn't start a new climb");
    }
  };

  const gained = progress ? progress.masteryAfter - progress.masteryBefore : 0;

  return (
    <div data-theme="leap" className="lp-root relative isolate h-[100dvh] w-full overflow-hidden font-sans">
      <LeapStage ref={stage} count={count} platform={platform} crumbled={crumbled} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 w-[min(760px,100%)] -translate-x-1/2 bg-[#0c1a33]/55" />
      <div className="absolute top-3 right-3 z-20 sm:top-4 sm:right-5">
        <SoundToggle />
      </div>

      <div className="absolute inset-0 overflow-y-auto overscroll-contain" style={{ animation: "page-in .6s var(--ease-out) both" }}>
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-7 px-4 pt-6 pb-24 sm:px-6">
          <ResultHeader
            title={`CLIMB REPORT · CLIMB #${history.number}`}
            score={reveal.score}
            secondary={
              <span style={{ color: outcome === "cleared" ? "var(--reward)" : "var(--danger)" }}>
                {outcome === "cleared" ? "▲ SUMMIT" : `▼ FELL${fellAt ? ` AT Q${fellAt}` : ""}`}
              </span>
            }
            personalBest={progress?.isNewPersonalBest}
            logo={<span className="font-display text-[22px] tracking-[0.1em] text-accent">LEAP</span>}
          />

          <TopicPassBanner passed={reveal.passed} topic={topic} />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="correct" value={`${stats?.correct ?? qs.filter((q) => q.outcome === "correct").length}/${count}`} />
            <Stat label="best streak" value={`${stats?.bestStreak ?? 0}`} icon={<PixelIcon name="flame" size={16} />} />
            <Stat
              label="hearts left"
              value={
                <span className="flex gap-0.5" aria-label={`${stats?.heartsLeft ?? 0} of 3 hearts left`}>
                  {Array.from({ length: 3 }, (_, i) => (
                    <span key={i} style={{ filter: i < (stats?.heartsLeft ?? 0) ? undefined : "grayscale(1) brightness(.45)" }}>
                      <PixelIcon name="heart" size={18} palette={{ p: "#ff4f7b", w: "#ffd0dc" }} />
                    </span>
                  ))}
                </span>
              }
            />
            <Stat label="50/50" value={stats?.lifelineUsed ? "used" : "saved"} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={again} disabled={pending} className="lp-btn lp-btn-primary px-7 py-3 text-[22px]" style={{ animation: pending ? undefined : "btn-bob 2.4s ease-in-out infinite" }}>
              {pending ? "…" : "▲ PLAY AGAIN"}
            </button>
            <button type="button" onClick={() => router.push(`/games/${context.gameId}`)} className="lp-btn text-[16px]">
              Back to Game
            </button>
            {error && <p className="w-full text-[14px] text-danger">{error}</p>}
          </div>

          <section className="lp-card p-4">
            <DistributionChart values={history.scores} you={reveal.score} max={MAX_SCORE} best={progress?.personalBest ?? null} caption={caption(reveal.score, history.scores)} />
          </section>

          <section className="lp-card p-4" aria-label="Climb log">
            <h3 className="label-line">CLIMB LOG · one island per question</h3>
            <div className="mt-3 flex items-end gap-1.5" style={{ height: 120 }}>
              {qs.map((q, i) => {
                const h = q.outcome === "correct" ? 24 + (q.points / 300) * 90 : 14;
                const color = q.outcome === "correct" ? "var(--success)" : q.outcome === null ? "rgba(255,255,255,.12)" : "var(--danger)";
                return (
                  <div key={q.position} className="flex flex-1 flex-col items-center gap-1" title={`Q${q.position}: ${q.outcome ?? "not reached"}${q.points ? ` · +${q.points}` : ""}`}>
                    {q.points > 0 && <span className="font-hud text-[13px] text-reward">+{q.points}</span>}
                    <div className="w-full rounded-t-[4px]" style={{ height: h, background: color, animation: `lp-card-in .5s var(--ease-out) ${i * 60}ms both` }} />
                    <span className="font-hud text-[13px] text-faint">{q.position}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {progress && (
            <section className="w-full">
              <h3 className="label-line">MASTERY</h3>
              <div className="mt-3 flex items-baseline gap-3 font-hud text-[30px]">
                <span className="text-muted tabular-nums">{progress.masteryBefore}%</span>
                <span className="text-faint">→</span>
                <span className="text-reward tabular-nums">{progress.masteryAfter}%</span>
                {gained > 0 && <span className="text-[18px] text-success">+{gained}</span>}
              </div>
              <div className="mt-2">
                <Meter value={masteryShown} segments={20} label={`Mastery ${progress.masteryAfter}%`} />
              </div>
            </section>
          )}

          <section>
            <h3 className="label-line">EVERY QUESTION · tap one for the explanation</h3>
            <ul className="mt-3 flex flex-col gap-2">
              {qs.map((q) => (
                <QuestionRow
                  key={q.position}
                  q={q}
                  open={open === q.position}
                  onToggle={() => {
                    sfx.click();
                    setOpen(open === q.position ? null : q.position);
                  }}
                  evidenceHref={evidenceHref}
                />
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="lp-card px-3 py-2.5">
      <b className="flex items-center gap-1.5 font-hud text-[24px] leading-none">
        {icon}
        {value}
      </b>
      <span className="text-[12px] text-muted">{label}</span>
    </div>
  );
}

function QuestionRow({ q, open, onToggle, evidenceHref }: { q: LeapRevealQuestion; open: boolean; onToggle: () => void; evidenceHref: (e: NonNullable<Evidence>) => string }) {
  const status = q.outcome === "correct" ? "right" : q.outcome === null ? "unplayed" : "miss";
  const yours = q.options.find((o) => o.id === q.yourOptionId);
  return (
    <li className="lp-card overflow-hidden !rounded-[12px]">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-center gap-3 px-3 py-3 text-left sm:px-4">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] font-display text-[15px]"
          style={{ background: status === "right" ? "var(--success)" : status === "miss" ? "var(--danger)" : "rgba(255,255,255,.1)", color: status === "unplayed" ? "var(--muted)" : "#06121f" }}
          aria-label={status === "right" ? "Correct" : status === "miss" ? "Missed" : "Not reached"}
        >
          {q.position}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold sm:text-[16px]">{q.text}</span>
          <span className="block truncate text-[13px] text-muted">
            {q.outcome === null ? "not reached" : q.outcome === "timeout" ? "time ran out" : yours ? `you: ${yours.id} · ${yours.text}` : "no answer"}
            {q.lifelineUsed && <span className="ml-2 text-signal">50/50</span>}
          </span>
        </span>
        <span className="font-hud text-[22px] tabular-nums" style={{ color: q.points > 0 ? "var(--reward)" : "var(--faint)" }}>
          {q.points > 0 ? `+${q.points}` : "0"}
        </span>
        <span aria-hidden="true" className="text-muted" style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform .2s" }}>
          ▸
        </span>
      </button>
      {open && (
        <div className="border-t border-white/10 px-3 pt-3 pb-4 sm:px-4" style={{ animation: "rise-in .35s var(--ease-out) both" }}>
          <ul className="flex flex-col gap-1.5">
            {q.options.map((o) => {
              const right = o.id === q.correctOptionId;
              const mine = o.id === q.yourOptionId;
              const gone = q.hiddenOptionIds.includes(o.id);
              return (
                <li
                  key={o.id}
                  className="flex items-start gap-2 rounded-[8px] px-2.5 py-1.5 text-[14px]"
                  style={{
                    background: right ? "rgba(61,220,151,.16)" : mine ? "rgba(255,92,92,.14)" : "rgba(255,255,255,.04)",
                    boxShadow: right ? "inset 0 0 0 2px var(--success)" : mine ? "inset 0 0 0 2px var(--danger)" : undefined,
                    opacity: gone ? 0.45 : 1,
                  }}
                >
                  <b className="font-display">{o.id}</b>
                  <span className={`flex-1 ${gone ? "line-through" : ""}`}>{o.text}</span>
                  {right && <span className="shrink-0 text-success">✓ right</span>}
                  {mine && !right && <span className="shrink-0 text-danger">✗ yours</span>}
                  {gone && <span className="shrink-0 text-faint">50/50</span>}
                </li>
              );
            })}
          </ul>
          {q.explanation && <p className="mt-2.5 text-[14px] leading-relaxed text-muted">{q.explanation}</p>}
          <EvidenceLine evidence={q.evidence} href={q.evidence && evidenceHref(q.evidence)} className="mt-2" />
        </div>
      )}
    </li>
  );
}
