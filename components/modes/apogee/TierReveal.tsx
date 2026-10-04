"use client";
// The catch-style moment after a correct answer (Dive's catch screen, in space): the Tier's icon
// glowing, the Tier name huge in stencil type, the answer, `+60 KM`, a verdict and CONTINUE ▲
// (Enter, or automatically after ~6 s). The Prompt clock is paused while it shows.
import { useEffect, useRef } from "react";
import type { Tier } from "@/lib/scoring/tiers";
import { sfx, type Band } from "@/lib/ui/sfx";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { APOGEE_TIERS } from "./altitude";

type Props = {
  tier: Tier;
  answer: string;
  points: number;
  /** Altitude after this answer (points = km). */
  altitude: number;
  tags?: { hint?: boolean; stale?: boolean };
  onContinue: () => void;
  autoMs?: number;
  cta?: string;
};

export function TierReveal({ tier, answer, points, altitude, tags, onContinue, autoMs = 6000, cta = "CONTINUE" }: Props) {
  const ui = APOGEE_TIERS[tier];
  const done = useRef(false);
  const btn = useRef<HTMLButtonElement>(null);
  const cont = useRef(onContinue);

  useEffect(() => {
    cont.current = onContinue;
  }, [onContinue]);

  useEffect(() => {
    const go = () => {
      if (done.current) return;
      done.current = true;
      cont.current();
    };
    sfx.catch(ui.band as Band);
    btn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.repeat) {
        e.preventDefault();
        go();
      }
    };
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
    <div className="flex h-full w-full flex-col items-center justify-between px-4 pt-[16vh] pb-8 text-center" role="dialog" aria-label={`${ui.label}: ${answer}, plus ${points} kilometres`}>
      <div className="flex flex-col items-center">
        <div className="relative mb-3" style={{ filter: `drop-shadow(0 0 14px ${hex}) drop-shadow(0 0 30px ${hex}88)`, animation: "ap-reveal-in .5s var(--ease-snap) both, bob 3s ease-in-out .5s infinite" }}>
          <PixelIcon name={ui.icon} size={72} palette={{ c: hex, b: hex, v: hex, y: hex, Y: hex, B: hex, r: hex, w: "#fff" }} title={ui.label} />
        </div>
        <p className="ap-eyebrow" style={{ animation: "ap-fade-in .4s .15s both" }}>
          tier reached
        </p>
        <h2 className="font-display text-[68px] leading-[0.85] font-black tracking-[0.06em] uppercase sm:text-[104px]" style={{ color: hex, textShadow: `0 0 28px ${hex}99`, animation: "ap-reveal-in .7s var(--ease-out) .1s both" }}>
          {ui.label}
        </h2>
        <p className="mt-4 text-[22px] font-semibold text-text sm:text-[26px]" style={{ animation: "ap-fade-in .4s .35s both" }}>
          “{answer}”
        </p>
        <p className="mt-3 font-display text-[34px] font-extrabold tracking-[0.04em] sm:text-[40px]" style={{ animation: "ap-fade-in .4s .45s both" }}>
          <span style={{ color: hex }}>+{points} KM</span>
          <span className="mx-3 text-muted">·</span>
          <span className="text-text">{altitude.toLocaleString("en-US")} km up</span>
        </p>
        <p className="mt-2 text-[15px] text-[#cfd3e6]" style={{ animation: "ap-fade-in .4s .55s both" }}>
          {ui.verdict}
        </p>
        {(tags?.hint || tags?.stale) && (
          <div className="mt-3 flex gap-2">
            {tags.hint && <span className="ap-chip text-caution">hint · one tier down</span>}
            {tags.stale && (
              <span className="ap-chip text-faint" title="You found this answer in an earlier Run, so it scores half">
                repeat ÷2
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-2">
        <button
          ref={btn}
          type="button"
          onMouseEnter={() => sfx.hover()}
          onClick={() => {
            if (done.current) return;
            done.current = true;
            sfx.click();
            cont.current();
          }}
          className="ap-btn ap-btn-primary ap-btn-big"
          style={{ boxShadow: "0 0 30px color-mix(in srgb, var(--accent) 45%, transparent)" }}
        >
          {cta} ▲
        </button>
        {autoMs > 0 && (
          <div className="h-[2px] w-40 overflow-hidden rounded bg-white/10" aria-hidden="true">
            <div className="h-full bg-accent" style={{ animation: `ap-auto ${autoMs}ms linear forwards` }} />
          </div>
        )}
        <span className="ap-eyebrow">press enter</span>
      </div>
      <style>{`@keyframes ap-auto { from { width: 100% } to { width: 0% } }`}</style>
    </div>
  );
}
