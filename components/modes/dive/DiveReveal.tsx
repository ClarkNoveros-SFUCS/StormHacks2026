"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Evidence, RevealPrompt } from "@/lib/runs/types";
import { Logo } from "@/components/ui/Logo";
import { Mascot } from "@/components/ui/Mascot";
import { Meter } from "@/components/ui/Meter";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { BandTable } from "@/components/results/BandTable";
import { DistributionChart } from "@/components/results/DistributionChart";
import { ResultHeader } from "@/components/results/ResultHeader";
import { ResultList } from "@/components/results/ResultList";
import { DiveCamera } from "./depth";
import { DiveLogChart } from "./DiveLogChart";
import { OceanStage } from "./OceanStage";
import { BEARING, bearingIndex, depthForScore, formatDepth, promptTier, TIER_UI } from "./tiers";

type Props = {
  /** e.g. "DIVE #12 COMPLETE" */
  title: string;
  score: number;
  prompts: RevealPrompt[];
  /** The curve: your own past Runs (private Games) or today's players (public Games). */
  distribution: { values: number[]; caption: string; best?: number | null };
  personalBest?: boolean;
  /** Mastery before → after this Run (percentages). The new Meter segments play `gild`. */
  mastery?: { before: number; after: number } | null;
  /** Link each Evidence line into the Module's file viewer. */
  evidenceHref?: (evidence: NonNullable<Evidence>) => string | null;
  onAgain: () => void;
  /** True while DIVE AGAIN is creating the next Run. */
  againPending?: boolean;
  onBack: () => void;
  backLabel?: string;
  /** Shown above the buttons, e.g. an error from DIVE AGAIN. */
  notice?: ReactNode;
  /**
   * Drive a shared camera (the Run's OceanStage stays mounted underneath). If omitted,
   * DiveReveal draws its own dusk OceanStage.
   */
  camera?: DiveCamera;
};

/**
 * The Krillion results column over the sea. It opens at your final depth, then surfaces:
 * scrolled to the top you see the dusk sky and the boat; scrolling down sinks the camera
 * back toward your final depth.
 */
export function DiveReveal({
  title,
  score,
  prompts,
  distribution,
  personalBest,
  mastery,
  evidenceHref,
  onAgain,
  againPending = false,
  onBack,
  backLabel = "BACK",
  notice,
  camera: cameraProp,
}: Props) {
  const [ownCamera] = useState(() => new DiveCamera());
  const camera = cameraProp ?? ownCamera;
  const scrollRef = useRef<HTMLDivElement>(null);
  const finalDepth = depthForScore(score);
  const [masteryShown, setMasteryShown] = useState(mastery?.before ?? 0);

  useEffect(() => {
    camera.set(finalDepth, true);
    const el = scrollRef.current;
    const fromScroll = () => {
      if (!el) return 0;
      const max = Math.max(1, el.scrollHeight - el.clientHeight);
      return (el.scrollTop / max) * finalDepth;
    };
    const surface = setTimeout(() => camera.set(fromScroll()), 700);
    const onScroll = () => camera.set(fromScroll());
    el?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(surface);
      el?.removeEventListener("scroll", onScroll);
    };
  }, [camera, finalDepth]);

  // Mastery fills from before → after once the column has settled.
  useEffect(() => {
    if (!mastery) return;
    const id = setTimeout(() => setMasteryShown(mastery.after), 1400);
    return () => clearTimeout(id);
  }, [mastery]);

  const log = prompts.map((p) => ({ points: p.points, tier: promptTier(p) }));
  const bands = BEARING.map((b) => ({ range: b.range, label: b.label, verdict: b.verdict, icon: TIER_UI[b.tier].icon, color: TIER_UI[b.tier].hex }));
  const gained = mastery ? mastery.after - mastery.before : 0;

  const column = (
    <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overscroll-contain">
      <div className="mx-auto flex w-full max-w-[620px] flex-col gap-10 px-4 pt-8 pr-16 pb-24 sm:px-6 sm:pr-6">
        <ResultHeader title={title} score={score} secondary={formatDepth(score)} personalBest={personalBest} logo={<Logo size="sm" />} />
        <DistributionChart values={distribution.values} you={score} best={distribution.best} caption={distribution.caption} />
        <DiveLogChart prompts={log} />
        {mastery && (
          <section className="w-full">
            <h3 className="label-line">MASTERY</h3>
            <div className="mt-3 flex items-baseline gap-3 font-hud text-[28px] sm:text-[32px]">
              <span className="text-muted tabular-nums">{mastery.before}%</span>
              <span className="text-faint">→</span>
              <span className="text-reward tabular-nums" style={{ textShadow: "0 0 12px color-mix(in srgb, var(--reward) 60%, transparent)" }}>
                {mastery.after}%
              </span>
              {gained > 0 && <span className="text-[18px] tracking-[0.15em] text-success">+{gained}</span>}
            </div>
            <div className="mt-2">
              <Meter value={masteryShown} segments={20} label={`Mastery ${mastery.after}%`} />
            </div>
            <p className="mt-2 font-hud text-[14px] tracking-[0.2em] text-faint">
              {gained > 0 ? "NEW ANSWERS LOGGED IN YOUR NOTES" : "OF THIS GAME'S ANSWERS FOUND"}
            </p>
          </section>
        )}
        <BandTable bands={bands} activeIndex={bearingIndex(score)} />
        <ResultList prompts={prompts} evidenceHref={evidenceHref} />
        <div className="flex flex-col items-center gap-4 pt-2">
          {notice}
          <button
            type="button"
            onClick={onAgain}
            disabled={againPending}
            className="px-8 py-3 font-hud text-[24px] tracking-[0.25em] text-text transition hover:-translate-y-0.5 active:translate-y-[2px] disabled:opacity-60"
            style={{
              background: "color-mix(in srgb, var(--accent) 35%, #12081a)",
              boxShadow: "inset 0 0 0 3px var(--accent), 0 0 22px color-mix(in srgb, var(--accent) 40%, transparent), 0 5px 0 #3b0f22",
              animation: againPending ? undefined : "btn-bob 2.4s ease-in-out infinite",
            }}
          >
            {againPending ? "▼ DIVING… ▼" : "▼ DIVE AGAIN ▼"}
          </button>
          <button type="button" onClick={onBack} className="font-hud text-[18px] tracking-[0.25em] text-muted underline-offset-4 hover:text-signal hover:underline">
            {backLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0" style={{ animation: "page-in .6s var(--ease-out) both" }}>
      {!cameraProp && <OceanStage camera={camera} sky="dusk" showMascot={false} />}
      {/* a soft scrim so the column reads over the sea */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 w-[min(720px,100%)] -translate-x-1/2 bg-[#050a14]/35" />
      {column}
      <div className="absolute top-3 right-3 z-10 sm:top-4 sm:right-24">
        <SoundToggle />
      </div>
      <div className="pointer-events-none absolute top-16 right-4 z-10 hidden lg:block xl:right-[12%]">
        <Mascot size={84} mood={personalBest ? "happy" : undefined} followCursor={false} />
      </div>
    </div>
  );
}
