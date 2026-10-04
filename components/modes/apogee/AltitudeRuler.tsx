"use client";
// The altitude ruler on the right edge (inspo: .ruler): landmarks from the pad to Jupiter, a
// flame-coloured fill and a diamond marker at the rocket's live altitude, an optional PB line,
// and on the Mission Report a scrub handle that flies the camera through the trip.
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { LANDMARKS, pointsAtRulerPct, rulerPct } from "./altitude";
import type { LiveValue } from "./live";

type Props = {
  live: LiveValue;
  /** Personal Best, as a dashed line. */
  best?: number | null;
  /** Reveal: drag or wheel over the ruler to fly the camera; called with points. */
  onScrub?: (points: number) => void;
  /** Where the scrub handle starts (points). */
  scrubStart?: number;
  className?: string;
};

export function AltitudeRuler({ live, best, onScrub, scrubStart = 0, className = "" }: Props) {
  const fillRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const tickRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrubRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const scrubPts = useRef(scrubStart);

  useEffect(
    () =>
      live.subscribe((p) => {
        const pct = `${rulerPct(p)}%`;
        if (fillRef.current) fillRef.current.style.height = pct;
        if (markerRef.current) markerRef.current.style.bottom = pct;
        LANDMARKS.forEach((l, i) => tickRefs.current[i]?.toggleAttribute("data-passed", p >= l.pts && l.pts > 0));
      }),
    [live],
  );

  useEffect(() => {
    scrubPts.current = scrubStart;
    if (scrubRef.current) scrubRef.current.style.bottom = `${rulerPct(scrubStart)}%`;
  }, [scrubStart]);

  const setFromY = (clientY: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || !onScrub) return;
    const pct = (1 - (clientY - r.top) / r.height) * 100;
    const p = pointsAtRulerPct(pct);
    scrubPts.current = p;
    if (scrubRef.current) scrubRef.current.style.bottom = `${rulerPct(p)}%`;
    onScrub(p);
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!onScrub) return;
    scrubbing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromY(e.clientY);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scrubbing.current) setFromY(e.clientY);
  };
  const up = () => {
    scrubbing.current = false;
  };

  // Wheel scrubbing needs a non-passive listener.
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !onScrub) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = Math.max(0, Math.min(700, scrubPts.current - e.deltaY * 0.15));
      scrubPts.current = p;
      if (scrubRef.current) scrubRef.current.style.bottom = `${rulerPct(p)}%`;
      onScrub(p);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [onScrub]);

  const keyScrub = (e: React.KeyboardEvent) => {
    if (!onScrub) return;
    const step = e.key === "ArrowUp" ? 20 : e.key === "ArrowDown" ? -20 : 0;
    if (!step) return;
    e.preventDefault();
    const p = Math.max(0, Math.min(700, scrubPts.current + step));
    scrubPts.current = p;
    if (scrubRef.current) scrubRef.current.style.bottom = `${rulerPct(p)}%`;
    onScrub(p);
  };

  return (
    <div
      ref={trackRef}
      className={`select-none ${onScrub ? "cursor-ns-resize" : "pointer-events-none"} ${className}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      role={onScrub ? "slider" : "img"}
      tabIndex={onScrub ? 0 : undefined}
      onKeyDown={keyScrub}
      aria-label={onScrub ? "Fly back through your trip: altitude" : "Altitude ruler"}
      aria-valuemin={onScrub ? 0 : undefined}
      aria-valuemax={onScrub ? 700 : undefined}
      aria-valuenow={onScrub ? Math.round(scrubStart) : undefined}
    >
      <div className="absolute top-0 right-0 bottom-0 rounded-sm bg-white/10" style={{ width: onScrub ? 6 : 3, right: onScrub ? -1.5 : 0 }} />
      <div ref={fillRef} className="absolute right-0 bottom-0 w-[3px] rounded-sm" style={{ background: "linear-gradient(to top, var(--accent), #ffd08a)", boxShadow: "0 0 8px var(--accent)" }} />
      {LANDMARKS.map((l, i) =>
        i === 0 ? null : (
          <div
            key={l.name}
            ref={(el) => {
              tickRefs.current[i] = el;
            }}
            className="ap-tick pointer-events-none absolute right-0 flex w-full translate-y-1/2 items-center justify-end gap-2"
            style={{ bottom: `${rulerPct(l.pts)}%` }}
          >
            {l.major && (
              <span className="hidden text-right font-hud text-[10px] leading-none whitespace-nowrap text-muted md:block" style={{ textShadow: "0 1px 6px rgba(4,5,12,.7)" }}>
                <em className="ap-tick-name font-sans text-[11px] font-semibold not-italic">{l.name}</em> {l.pts.toLocaleString("en-US")}
              </span>
            )}
            <i className="ap-tick-line block h-px w-[9px] flex-none" />
          </div>
        ),
      )}
      {best != null && best > 0 && (
        <div className="pointer-events-none absolute -right-2.5 h-0 w-[23px] border-t border-dashed border-reward" style={{ bottom: `${rulerPct(best)}%` }}>
          <span className="absolute top-[-7px] right-[26px] font-hud text-[9px] text-reward">PB</span>
        </div>
      )}
      <div ref={markerRef} className="pointer-events-none absolute -right-1.5 h-[15px] w-[15px] translate-y-1/2" style={{ bottom: 0 }}>
        <div className="absolute inset-[3px] rotate-45 rounded-[2px] bg-accent" style={{ boxShadow: "0 0 14px var(--accent)" }} />
      </div>
      {onScrub && <div ref={scrubRef} className="pointer-events-none absolute -right-[9px] h-[21px] w-[21px] translate-y-1/2 rounded-full border-2 border-text" />}
      <style>{`
        .ap-tick .ap-tick-name { color: rgba(236,230,216,.8) }
        .ap-tick .ap-tick-line { background: rgba(255,255,255,.35) }
        .ap-tick[data-passed] .ap-tick-name { color: var(--text) }
        .ap-tick[data-passed] .ap-tick-line { background: var(--accent) }
      `}</style>
    </div>
  );
}
