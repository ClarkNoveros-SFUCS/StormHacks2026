"use client";
// The Arena Reveal: the AFTER-ACTION REPORT (/runs/[runId]/reveal for an Arena Run). The training
// room stays behind (the camera pans slowly; the holo-board shows the score), and the report
// scrolls over it: score, accuracy, best streak, then every question with the targets you hit
// (in order), the right one, its explanation and Evidence. Spec: docs/design/modes/arena.md § Report.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { accuracy, ARENA_QUESTION_MS } from "@/lib/modes/arena/rules";
import { RunApiError, runApi } from "@/lib/runs/client";
import type { ArenaReveal, ArenaRevealQuestion, Evidence, LeapOptionId } from "@/lib/runs/types";
import { sfx } from "@/lib/ui/sfx";
import { Meter } from "@/components/ui/Meter";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { DistributionChart } from "@/components/results/DistributionChart";
import { EvidenceLine } from "@/components/results/EvidenceLine";
import { ResultHeader } from "@/components/results/ResultHeader";
import { revealTopic, TopicPassBanner } from "@/components/results/TopicPassBanner";
import { ArenaStage, type ArenaStageHandle } from "./ArenaStage";
import "./arena.css";

type Props = {
  reveal: ArenaReveal;
  context: { runId: string; gameId: string; moduleId: string; gameTitle: string };
  history: { number: number; scores: number[] };
};

const MAX_SCORE = 2550; // 10 instant hits in a row: 150, 150, 225, 225, 300 × 6
const TARGET_COLOR: Record<LeapOptionId, string> = { A: "#4de3ff", B: "#9d7bff", C: "#ffd84d", D: "#ff5d8f" };

function caption(score: number, scores: number[]): string {
  const others = scores.length - 1;
  if (others <= 0) return "YOUR FIRST RUN IN THIS ARENA · PLAY AGAIN TO DRAW YOUR CURVE";
  const beaten = scores.filter((s) => s < score).length;
  return `BETTER THAN ${beaten} OF YOUR ${others} OTHER RUN${others === 1 ? "" : "S"}`;
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export function ArenaRevealScreen({ reveal, context, history }: Props) {
  const router = useRouter();
  const stage = useRef<ArenaStageHandle>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const progress = reveal.progress;
  const [masteryShown, setMasteryShown] = useState(progress?.masteryBefore ?? 0);
  const summary = reveal.summary.mode === "arena" ? reveal.summary : null;
  const qs = reveal.questions;
  const count = qs.length || 10;
  const correct = summary?.stats.correct ?? qs.filter((q) => q.outcome === "correct").length;
  const wrongHits = summary?.stats.wrongHits ?? qs.reduce((n, q) => n + q.hits.filter((h) => !h.correct).length, 0);
  const acc = Math.round(accuracy(correct, wrongHits) * 100);
  const topic = revealTopic(reveal);
  const quickest = qs
    .flatMap((q) => q.hits.filter((h) => h.correct).map((h) => h.msIntoQuestion))
    .reduce<number | null>((m, ms) => (m === null || ms < m ? ms : m), null);

  useEffect(() => {
    stage.current?.run((s) =>
      s.setBoard({ kicker: "AFTER-ACTION REPORT", title: reveal.score.toLocaleString("en-US"), body: `${correct} of ${count} right · ${acc}% accuracy`, tone: "gold" }),
    );
  }, [reveal.score, correct, count, acc]);

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
      setError(e instanceof RunApiError ? e.message : "Couldn't start a new run");
    }
  };

  const gained = progress ? progress.masteryAfter - progress.masteryBefore : 0;

  return (
    <div data-theme="arena" className="ar-root relative isolate h-[100dvh] w-full overflow-hidden font-sans">
      <ArenaStage ref={stage} mode="showcase" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 w-[min(760px,100%)] -translate-x-1/2 bg-[#070914]/70" />
      <div className="absolute top-3 right-3 z-20 sm:top-4 sm:right-5">
        <SoundToggle />
      </div>

      <div className="absolute inset-0 overflow-y-auto overscroll-contain" style={{ animation: "page-in .6s var(--ease-out) both" }}>
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-7 px-4 pt-6 pb-24 sm:px-6">
          <ResultHeader
            title={`AFTER-ACTION REPORT · RUN #${history.number}`}
            score={reveal.score}
            secondary={<span style={{ color: "var(--signal)" }}>✛ {acc}% ACCURACY</span>}
            personalBest={progress?.isNewPersonalBest}
            logo={<span className="font-display text-[22px] tracking-[0.12em] text-accent">ARENA</span>}
          />

          <TopicPassBanner passed={reveal.passed} topic={topic} />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="right" value={`${correct}/${count}`} tone={reveal.passed ? "var(--success)" : undefined} />
            <Stat label={`accuracy · ${wrongHits} wrong hit${wrongHits === 1 ? "" : "s"}`} value={`${acc}%`} />
            <Stat label="best streak" value={`${summary?.stats.bestStreak ?? 0}`} icon={<PixelIcon name="flame" size={16} />} />
            <Stat label="fastest hit" value={quickest !== null ? secs(quickest) : "—"} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={again} disabled={pending} className="ar-btn ar-btn-primary px-7 py-3 text-[22px]" style={{ animation: pending ? undefined : "btn-bob 2.4s ease-in-out infinite" }}>
              {pending ? "…" : "✛ PLAY AGAIN"}
            </button>
            <button type="button" onClick={() => router.push(`/games/${context.gameId}`)} className="ar-btn text-[16px]">
              Back to Game
            </button>
            {error && <p className="w-full text-[14px] text-danger">{error}</p>}
          </div>

          <section className="ar-card p-4">
            <DistributionChart values={history.scores} you={reveal.score} max={MAX_SCORE} best={progress?.personalBest ?? null} caption={caption(reveal.score, history.scores)} />
          </section>

          <section className="ar-card p-4" aria-label="Round log">
            <h3 className="label-line">ROUND LOG · taller = more points · red = wrong hits</h3>
            <div className="mt-3 flex items-end gap-1.5" style={{ height: 132 }}>
              {qs.map((q, i) => {
                const misses = q.hits.filter((h) => !h.correct).length;
                const h = q.outcome === "correct" ? 24 + (q.points / 300) * 90 : 12;
                const color = q.outcome === "correct" ? "var(--success)" : q.outcome === null ? "rgba(255,255,255,.12)" : "var(--danger)";
                return (
                  <div key={q.position} className="flex flex-1 flex-col items-center gap-1" title={`Q${q.position}: ${q.outcome ?? "not reached"}${q.points ? ` · +${q.points}` : ""}${misses ? ` · ${misses} wrong hit${misses === 1 ? "" : "s"}` : ""}`}>
                    {q.points > 0 && <span className="font-hud text-[13px] text-reward">+{q.points}</span>}
                    <div className="flex w-full flex-col-reverse" style={{ animation: `ar-card-in .5s var(--ease-out) ${i * 60}ms both` }}>
                      <div className="w-full" style={{ height: h, background: color }} />
                      {Array.from({ length: misses }, (_, k) => (
                        <div key={k} className="mb-[2px] h-[5px] w-full" style={{ background: "#ff5c5c" }} />
                      ))}
                    </div>
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

function Stat({ label, value, icon, tone }: { label: string; value: React.ReactNode; icon?: React.ReactNode; tone?: string }) {
  return (
    <div className="ar-plate px-3 py-2.5">
      <b className="flex items-center gap-1.5 font-hud text-[26px] leading-none" style={{ color: tone }}>
        {icon}
        {value}
      </b>
      <span className="text-[12px] text-muted">{label}</span>
    </div>
  );
}

function HitTrail({ q }: { q: ArenaRevealQuestion }) {
  if (q.outcome === null) return <>not reached</>;
  if (!q.hits.length) return <>time ran out · no shots landed</>;
  const right = q.hits.find((h) => h.correct);
  return (
    <>
      {q.hits.map((h, i) => (
        <span key={i} className={h.correct ? "text-success" : "text-danger"}>
          {i > 0 && <span className="text-faint"> · </span>}
          {h.optionId} {h.correct ? "✓" : "✗"}
        </span>
      ))}
      {right ? <span className="text-faint"> in {secs(right.msIntoQuestion)}</span> : <span className="text-faint"> · time ran out</span>}
    </>
  );
}

function QuestionRow({ q, open, onToggle, evidenceHref }: { q: ArenaRevealQuestion; open: boolean; onToggle: () => void; evidenceHref: (e: NonNullable<Evidence>) => string }) {
  const status = q.outcome === "correct" ? "right" : q.outcome === null ? "unplayed" : "miss";
  const shot = new Set(q.hits.map((h) => h.optionId));
  return (
    <li className="ar-plate overflow-hidden !rounded-[12px]">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-center gap-3 px-3 py-3 text-left sm:px-4">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[6px] font-display text-[15px]"
          style={{ background: status === "right" ? "var(--success)" : status === "miss" ? "var(--danger)" : "rgba(255,255,255,.1)", color: status === "unplayed" ? "var(--muted)" : "#06121f" }}
          aria-label={status === "right" ? "Correct" : status === "miss" ? "Missed" : "Not reached"}
        >
          {q.position}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold sm:text-[16px]">{q.text}</span>
          <span className="block truncate font-hud text-[16px] text-muted">
            <HitTrail q={q} />
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
              const hitWrong = shot.has(o.id) && !right;
              return (
                <li
                  key={o.id}
                  className="flex items-start gap-2 rounded-[8px] px-2.5 py-1.5 text-[14px]"
                  style={{
                    background: right ? "rgba(61,220,151,.16)" : hitWrong ? "rgba(255,92,92,.14)" : "rgba(255,255,255,.04)",
                    boxShadow: right ? "inset 0 0 0 2px var(--success)" : hitWrong ? "inset 0 0 0 2px var(--danger)" : undefined,
                  }}
                >
                  <b className="font-display" style={{ color: TARGET_COLOR[o.id] }}>
                    {o.id}
                  </b>
                  <span className="flex-1">{o.text}</span>
                  {right && <span className="shrink-0 text-success">{shot.has(o.id) ? "✓ you hit it" : "✓ right"}</span>}
                  {hitWrong && <span className="shrink-0 text-danger">✗ shattered (−3 s)</span>}
                </li>
              );
            })}
          </ul>
          {q.outcome === "timeout" && (
            <p className="mt-2 text-[13px] text-faint">
              Time ran out{q.hits.length ? " after your wrong hits" : ""} ({secs(ARENA_QUESTION_MS)} on the clock, −3 s per wrong hit).
            </p>
          )}
          {q.explanation && <p className="mt-2.5 text-[14px] leading-relaxed text-muted">{q.explanation}</p>}
          <EvidenceLine evidence={q.evidence} href={q.evidence && evidenceHref(q.evidence)} className="mt-2" />
        </div>
      )}
    </li>
  );
}
