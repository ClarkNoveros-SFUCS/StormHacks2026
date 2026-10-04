"use client";
import { useEffect, useRef } from "react";
import type { Tier } from "@/lib/scoring/tiers";
import { sfx, type Band } from "@/lib/ui/sfx";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { TIER_UI } from "./tiers";

type Props = {
  tier: Tier;
  answer: string;
  points: number;
  /** How far this catch sinks you (points × 10). */
  sinkMetres: number;
  verdict?: string;
  onContinue: () => void;
  /** Auto-continue after this many ms (0 = never). */
  autoMs?: number;
  /** The button's label. */
  cta?: string;
  className?: string;
};

/**
 * Krillion's catch screen after a correct answer: the tier's creature glowing, the tier name big,
 * the answer in quotes, `+60 PTS · sink 600m`, a verdict, and `DESCEND ▼` (Enter, or auto after ~6 s).
 */
export function CatchScreen({ tier, answer, points, sinkMetres, verdict, onContinue, autoMs = 6000, cta = "DESCEND", className = "" }: Props) {
  const ui = TIER_UI[tier];
  const doneRef = useRef(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef(onContinue);

  useEffect(() => {
    continueRef.current = onContinue;
  }, [onContinue]);

  useEffect(() => {
    const go = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      continueRef.current();
    };
    sfx.catch(ui.band as Band);
    btnRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.repeat) {
        e.preventDefault();
        go();
      }
    };
    // Ignore the Enter that submitted the answer.
    const arm = setTimeout(() => window.addEventListener("keydown", onKey), 250);
    const auto = autoMs > 0 ? setTimeout(go, autoMs) : undefined;
    return () => {
      clearTimeout(arm);
      if (auto) clearTimeout(auto);
      window.removeEventListener("keydown", onKey);
    };
  }, [autoMs, ui.band]);

  const hex = ui.hex;
  return (
    <div className={`flex h-full w-full flex-col items-center justify-between px-4 pt-[18vh] pb-8 text-center ${className}`} role="dialog" aria-label={`${ui.label} catch`}>
      <div className="flex flex-col items-center" style={{ animation: "catch-in .6s var(--ease-snap) both" }}>
        <div className="relative mb-4" style={{ filter: `drop-shadow(0 0 14px ${hex}) drop-shadow(0 0 28px ${hex}88)`, animation: "bob 3s ease-in-out infinite" }}>
          <PixelIcon name={ui.icon} size={88} palette={{ c: hex, b: hex, v: hex, y: hex, Y: hex, B: hex }} title={ui.label} />
        </div>
        <h2 className="font-hud text-[64px] leading-none tracking-[0.12em] uppercase sm:text-[84px]" style={{ color: hex, textShadow: `0 0 18px ${hex}aa` }}>
          {ui.label}
        </h2>
        <p className="mt-4 font-hud text-[26px] text-text sm:text-[30px]">“{answer}”</p>
        <p className="mt-4 font-hud text-[24px] tracking-[0.08em] sm:text-[28px]">
          <span style={{ color: "var(--accent)" }}>+{points} PTS</span>
          <span className="mx-3 text-muted">·</span>
          <span className="text-text">sink {sinkMetres.toLocaleString("en-US")}m</span>
        </p>
        <p className="mt-3 font-hud text-[17px] tracking-[0.2em] text-muted sm:text-[19px]">{verdict ?? ui.verdict}</p>
      </div>
      <div className="flex flex-col items-center gap-2">
        <button
          ref={btnRef}
          type="button"
          onMouseEnter={() => sfx.hover()}
          onClick={() => {
            if (doneRef.current) return;
            doneRef.current = true;
            sfx.click();
            continueRef.current();
          }}
          className="px-8 py-3 font-hud text-[24px] tracking-[0.3em] text-text transition hover:-translate-y-0.5 active:translate-y-[2px] sm:text-[28px]"
          style={{
            background: "rgba(10,18,36,.92)",
            boxShadow: "inset 0 0 0 3px var(--accent), 0 0 22px color-mix(in srgb, var(--accent) 40%, transparent), 0 5px 0 #3b0f22",
          }}
        >
          {cta} ▼
        </button>
        {autoMs > 0 && (
          <div className="h-[2px] w-40 bg-[#0d1830]" aria-hidden="true">
            <div className="h-full bg-accent" style={{ animation: `catch-timer ${autoMs}ms linear forwards` }} />
          </div>
        )}
        <span className="font-hud text-[13px] tracking-[0.25em] text-faint">PRESS ENTER</span>
      </div>
      <style>{`
        @keyframes catch-in { from { opacity: 0; transform: translateY(24px) scale(.9) } }
        @keyframes catch-timer { from { width: 100% } to { width: 0% } }
      `}</style>
    </div>
  );
}
