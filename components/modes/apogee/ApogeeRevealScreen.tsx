"use client";
// The Apogee Reveal: the MISSION REPORT (/runs/[runId]/reveal for an Apogee Run). The scene pulls
// back to show the whole climb with the dashed trajectory; the report slides in on the right (a
// bottom sheet on phones). "Explore the flight" hides it and lets you drag the altitude ruler to
// fly back through the trip. Spec: docs/design/modes/apogee.md § Mission Report.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RunApiError, runApi } from "@/lib/runs/client";
import type { DiveReveal } from "@/lib/runs/types";
import { sfx } from "@/lib/ui/sfx";
import { Meter } from "@/components/ui/Meter";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { BandTable } from "@/components/results/BandTable";
import { DistributionChart } from "@/components/results/DistributionChart";
import { ResultList } from "@/components/results/ResultList";
import { revealTopic, TopicPassBanner } from "@/components/results/TopicPassBanner";
import { AltitudeRuler } from "./AltitudeRuler";
import { APOGEE_TIERS, formatKm, MAX_POINTS, MISSION_BANDS, missionBandIndex, missionVerdict, promptTier } from "./altitude";
import { ApogeeStage, type ApogeeStageHandle } from "./ApogeeStage";
import { apogeeFontVars } from "./fonts";
import { LiveValue } from "./live";
import { MissionLogChart } from "./MissionLogChart";
import "./apogee.css";
import { revealLinks } from "../shared/reveal-links";

type Props = {
  reveal: DiveReveal;
  context: { runId: string; gameId: string; moduleId: string; gameTitle: string };
  history: { number: number; scores: number[] };
};

function caption(score: number, scores: number[]): string {
  const others = scores.length - 1;
  if (others <= 0) return "YOUR FIRST FLIGHT ON THIS GAME · FLY AGAIN TO DRAW YOUR CURVE";
  const beaten = scores.filter((s) => s < score).length;
  return `HIGHER THAN ${beaten} OF YOUR ${others} OTHER FLIGHT${others === 1 ? "" : "S"}`;
}

export function ApogeeRevealScreen({ reveal, context, history }: Props) {
  const router = useRouter();
  const stage = useRef<ApogeeStageHandle>(null);
  const [live] = useState(() => new LiveValue(reveal.score));
  const [flyby, setFlyby] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progress = reveal.progress;
  const [masteryShown, setMasteryShown] = useState(progress?.masteryBefore ?? 0);
  const numRef = useRef<HTMLSpanElement>(null);
  const score = reveal.score;
  const scored = reveal.prompts.filter((p) => p.outcome === "correct").length;
  const topic = revealTopic(reveal);

  useEffect(() => {
    stage.current?.run((s) => s.setReveal(true, score));
  }, [score]);

  useEffect(() => {
    if (!progress) return;
    const id = setTimeout(() => setMasteryShown(progress.masteryAfter), 1400);
    return () => clearTimeout(id);
  }, [progress]);

  // Count the altitude up.
  useEffect(() => {
    const el = numRef.current;
    if (!el) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || score === 0) return;
    const t0 = performance.now();
    const dur = Math.min(1600, 500 + score * 3);
    let raf = 0;
    let lastSound = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const v = Math.round(score * (1 - Math.pow(1 - k, 3)));
      el.textContent = v.toLocaleString("en-US");
      if (now - lastSound > 50) {
        lastSound = now;
        sfx.count();
      }
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const onFrame = useCallback((f: { points: number }) => live.set(f.points), [live]);
  const onScrub = useCallback((p: number) => stage.current?.run((s) => s.scrubTo(p)), []);

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
      setError(e instanceof RunApiError ? e.message : "Couldn't start a new flight");
    }
  };

  const log = reveal.prompts.map((p) => ({ points: p.points, tier: promptTier(p) }));
  const bands = MISSION_BANDS.map((b) => ({ range: b.range, label: b.label, verdict: b.verdict, icon: APOGEE_TIERS[b.tier].icon, color: APOGEE_TIERS[b.tier].hex }));
  const gained = progress ? progress.masteryAfter - progress.masteryBefore : 0;

  return (
    <div data-theme="apogee" className={`ap-root ${apogeeFontVars} relative isolate h-[100dvh] w-full overflow-hidden font-sans`}>
      <ApogeeStage ref={stage} initialPoints={score} lifted onFrame={onFrame} />

      <div className="absolute top-3 left-3 z-20 sm:top-4 sm:left-5">
        <SoundToggle />
      </div>

      <AltitudeRuler
        live={live}
        best={progress?.personalBest ?? null}
        onScrub={onScrub}
        scrubStart={Math.min(MAX_POINTS, score)}
        className={`absolute z-10 w-[18px] transition-[right] duration-500 md:w-[150px] ${flyby ? "top-[96px] right-3 bottom-[96px] md:right-[18px]" : "top-[64px] right-3 bottom-[71%] md:top-[96px] md:bottom-[96px] md:right-[calc(min(470px,100%)+26px)]"}`}
      />

      {/* the report */}
      <aside
        aria-label="Mission report"
        className="ap-glass absolute inset-x-0 bottom-0 z-20 flex h-[68%] flex-col overflow-y-auto overscroll-contain !rounded-b-none px-4 pt-5 pb-[max(28px,env(safe-area-inset-bottom))] transition-transform duration-500 md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-[min(470px,100%)] md:!rounded-none md:!border-y-0 md:!border-r-0 md:px-6 md:pt-6"
        style={{
          transform: flyby ? "var(--ap-hide)" : "none",
          animation: "var(--ap-in) .7s cubic-bezier(.2,.8,.2,1) .2s both",
          transitionTimingFunction: "cubic-bezier(.2,.8,.2,1)",
        }}
      >
        <div className="flex flex-col gap-7">
          <header className="flex flex-col gap-1.5">
            {progress?.isNewPersonalBest && (
              <span className="self-start rounded-md bg-reward px-2.5 py-1 font-hud text-[12px] tracking-[0.1em] text-[#1a1200] uppercase" style={{ animation: "banner-in .6s var(--ease-snap) .8s both" }}>
                ★ New personal best
              </span>
            )}
            <span className="ap-eyebrow">
              Mission report · flight #{history.number} · {context.gameTitle}
            </span>
            <div className="font-display text-[60px] leading-[0.9] font-black tracking-[0.01em] md:text-[72px]" aria-label={`Apogee ${formatKm(score)}`}>
              <span ref={numRef}>{score.toLocaleString("en-US")}</span>
              <small className="ml-1.5 text-[26px] text-muted">km</small>
            </div>
            <p className="text-[16px] text-[#d7dbee]">{missionVerdict(score)}</p>
          </header>

          <TopicPassBanner passed={reveal.passed} topic={topic} />

          <div className="grid grid-cols-3 gap-2">
            {[
              [String(score), "points this Run"],
              [`${scored}/${reveal.prompts.length}`, "prompts scored"],
              [progress ? `${progress.masteryBefore}→${progress.masteryAfter}%` : "—", "Mastery"],
            ].map(([b, s]) => (
              <div key={s} className="min-w-0 rounded-[10px] border border-border bg-white/[.04] px-3 py-2.5">
                <b className="block truncate font-hud text-[17px] font-semibold">{b}</b>
                <span className="text-[11px] text-muted">{s}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={again} disabled={pending} className="ap-btn ap-btn-primary ap-btn-big flex-1">
              {pending ? "FUELLING…" : "LAUNCH AGAIN"}
            </button>
            <button
              type="button"
              onClick={() => {
                sfx.click();
                setFlyby(true);
              }}
              className="ap-btn"
            >
              Explore the flight
            </button>
            <button type="button" onClick={() => router.push(links.backHref)} className="ap-btn">
              {links.backLabel}
            </button>
          </div>
          {error && <p className="text-[14px] text-danger">{error}</p>}

          <DistributionChart values={history.scores} you={score} max={MAX_POINTS} best={progress?.personalBest ?? null} caption={caption(score, history.scores)} />
          <MissionLogChart prompts={log} />
          {progress && (
            <section className="w-full">
              <h3 className="label-line">MASTERY</h3>
              <div className="mt-3 flex items-baseline gap-3 font-display text-[30px] font-extrabold">
                <span className="text-muted tabular-nums">{progress.masteryBefore}%</span>
                <span className="text-faint">→</span>
                <span className="text-reward tabular-nums">{progress.masteryAfter}%</span>
                {gained > 0 && <span className="font-hud text-[15px] text-success">+{gained}</span>}
              </div>
              <div className="mt-2">
                <Meter value={masteryShown} segments={20} label={`Mastery ${progress.masteryAfter}%`} />
              </div>
            </section>
          )}
          <BandTable bands={bands} activeIndex={missionBandIndex(score)} title="MISSION BANDS" />
          <ResultList prompts={reveal.prompts} tiers={APOGEE_TIERS} title="FLIGHT LOG · tap a prompt for every answer" evidenceHref={evidenceHref} />
        </div>
      </aside>

      {flyby && (
        <div className="ap-glass absolute right-4 bottom-[max(16px,env(safe-area-inset-bottom))] left-4 z-20 flex items-center gap-3 px-4 py-2.5 text-[13px] text-muted md:right-auto" style={{ animation: "ap-fade-in .3s both" }}>
          <span>Drag the altitude ruler (or use ↑↓ on it) to fly back through your trip. Drag the sky to look around.</span>
          <button
            type="button"
            onClick={() => {
              sfx.click();
              setFlyby(false);
              stage.current?.run((s) => s.scrubTo(score));
            }}
            className="ap-btn shrink-0 !px-3 !py-1.5 text-[12px]"
          >
            Report
          </button>
        </div>
      )}
      <style>{`
        .ap-root { --ap-hide: translateY(105%); --ap-in: ap-sheet-in }
        @media (min-width: 768px) { .ap-root { --ap-hide: translateX(105%); --ap-in: ap-panel-in } }
      `}</style>
    </div>
  );
}
