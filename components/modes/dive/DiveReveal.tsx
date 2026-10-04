"use client";
import { useEffect, useRef, useState } from "react";
import type { RevealPrompt } from "@/lib/runs/types";
import { Logo } from "@/components/ui/Logo";
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
  distribution: { values: number[]; caption: string };
  personalBest?: boolean;
  onAgain: () => void;
  onBack: () => void;
  backLabel?: string;
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
export function DiveReveal({ title, score, prompts, distribution, personalBest, onAgain, onBack, backLabel = "BACK", camera: cameraProp }: Props) {
  const [ownCamera] = useState(() => new DiveCamera());
  const camera = cameraProp ?? ownCamera;
  const scrollRef = useRef<HTMLDivElement>(null);
  const finalDepth = depthForScore(score);

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

  const log = prompts.map((p) => ({ points: p.points, tier: promptTier(p) }));
  const bands = BEARING.map((b) => ({ range: b.range, label: b.label, verdict: b.verdict, icon: TIER_UI[b.tier].icon, color: TIER_UI[b.tier].hex }));

  const column = (
    <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overscroll-contain">
      <div className="mx-auto flex w-full max-w-[620px] flex-col gap-10 px-4 pt-8 pb-24 pr-16 sm:px-6 sm:pr-6">
        <ResultHeader
          title={title}
          score={score}
          secondary={formatDepth(score)}
          personalBest={personalBest}
          logo={<Logo size="sm" />}
        />
        <DistributionChart values={distribution.values} you={score} caption={distribution.caption} />
        <DiveLogChart prompts={log} />
        <BandTable bands={bands} activeIndex={bearingIndex(score)} />
        <ResultList prompts={prompts} />
        <div className="flex flex-col items-center gap-4 pt-2">
          <button
            type="button"
            onClick={onAgain}
            className="px-8 py-3 font-hud text-[24px] tracking-[0.25em] text-text transition hover:-translate-y-0.5 active:translate-y-[2px]"
            style={{
              background: "color-mix(in srgb, var(--accent) 35%, #12081a)",
              boxShadow: "inset 0 0 0 3px var(--accent), 0 0 22px color-mix(in srgb, var(--accent) 40%, transparent), 0 5px 0 #3b0f22",
              animation: "btn-bob 2.4s ease-in-out infinite",
            }}
          >
            ▼ DIVE AGAIN ▼
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
      <div className="absolute top-4 right-16 z-10 sm:right-24">
        <SoundToggle />
      </div>
    </div>
  );
}
