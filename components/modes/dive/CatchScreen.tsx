"use client";
import { useEffect, useRef, useState } from "react";
import type { Tier } from "@/lib/scoring/tiers";
import { sfx, type Band } from "@/lib/ui/sfx";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { TIER_UI } from "./tiers";

type Props = {
  /** The landed Tier, or "miss" for Krillion's NOTHING LANDED screen. */
  tier: Tier | "miss";
  /** The answer in quotes: the catch, or a miss's last guess (omit when there was none). */
  answer?: string | null;
  points: number;
  /** How far this catch sinks you (points × 10). */
  sinkMetres: number;
  verdict?: string;
  /** Caution `HINT` and muted `REPEAT ÷2` tags. */
  tags?: { hint?: boolean; stale?: boolean };
  onContinue: () => void;
  /** Auto-continue after this many ms (0 = never). */
  autoMs?: number;
  /** The button's label. */
  cta?: string;
  className?: string;
};

const MISS_VERDICT = "Nothing took the bait this time.";
/** Ring bubbles rising off the creature: [x offset px, size px, delay s, duration s]. */
const BUBBLES: [number, number, number, number][] = [
  [-10, 6, 0, 1.6],
  [4, 4, 0.3, 1.4],
  [12, 7, 0.6, 1.9],
  [-4, 5, 0.9, 1.5],
  [8, 4, 1.2, 1.3],
  [-14, 4, 0.45, 1.7],
  [16, 5, 1.05, 1.6],
  [0, 8, 1.4, 2],
];

/**
 * Krillion's catch screen after a correct answer, centred in the water where the chip landed: the
 * tier's creature glowing under a column of bubbles, the tier name, the answer in quotes,
 * `+60 PTS · sink 600m`, a faint verdict, and `DESCEND ▼` at the bottom (Enter, or auto after ~6 s).
 * `tier="miss"` is the NOTHING LANDED screen after a timeout or a one-try miss.
 */
export function CatchScreen({ tier, answer, points, sinkMetres, verdict, tags, onContinue, autoMs = 6000, cta = "DESCEND", className = "" }: Props) {
  const miss = tier === "miss";
  const ui = TIER_UI[tier];
  const doneRef = useRef(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef(onContinue);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    continueRef.current = onContinue;
  }, [onContinue]);

  useEffect(() => {
    let exit: ReturnType<typeof setTimeout> | undefined;
    const go = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      setLeaving(true);
      exit = setTimeout(() => continueRef.current(), 260);
    };
    if (!miss) sfx.catch(ui.band as Band);
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
    const btn = btnRef.current;
    const onClick = () => {
      sfx.click();
      go();
    };
    btn?.addEventListener("click", onClick);
    return () => {
      clearTimeout(arm);
      if (auto) clearTimeout(auto);
      if (exit) clearTimeout(exit);
      window.removeEventListener("keydown", onKey);
      btn?.removeEventListener("click", onClick);
    };
  }, [autoMs, ui.band, miss]);

  const hex = miss ? "#5d7398" : ui.hex;
  return (
    <div
      className={`flex h-full w-full flex-col items-center px-4 pb-[max(16px,env(safe-area-inset-bottom))] text-center sm:pb-6 ${className}`}
      role="dialog"
      aria-label={miss ? "Nothing landed" : `${ui.label} catch`}
      style={{ animation: leaving ? "dv-catch-out .26s ease-in forwards" : undefined }}
    >
      <div className="flex flex-1 flex-col items-center justify-center pb-[6vh]" style={{ animation: "dv-catch-in .5s ease-out both" }}>
        {!miss && (
          <div className="relative mb-3">
            <div className="absolute bottom-[60%] left-1/2 h-[120px] w-0" aria-hidden="true">
              {BUBBLES.map(([x, s, d, t], i) => (
                <span
                  key={i}
                  className="absolute bottom-0 rounded-full"
                  style={{
                    left: x,
                    width: s,
                    height: s,
                    boxShadow: "inset 0 0 0 1px rgba(210,235,255,.75)",
                    animation: `dv-bubble ${t}s ease-in ${d}s infinite`,
                  }}
                />
              ))}
            </div>
            <div style={{ filter: `drop-shadow(0 0 10px ${hex}) drop-shadow(0 0 22px ${hex}88)`, animation: "bob 3s ease-in-out infinite" }}>
              <PixelIcon name={ui.icon} size={52} palette={{ c: hex, b: hex, v: hex, y: hex, Y: hex, B: hex }} title={ui.label} />
            </div>
          </div>
        )}
        <h2
          className="font-hud text-[clamp(30px,4.2vw,48px)] leading-none tracking-[0.14em] uppercase"
          style={{ color: hex, textShadow: miss ? undefined : `0 0 14px ${hex}aa` }}
        >
          {miss ? "NOTHING LANDED" : ui.label}
        </h2>
        {answer && <p className="mt-3 font-hud text-[clamp(18px,2vw,24px)] text-text">“{answer}”</p>}
        <p className="mt-2 font-hud text-[clamp(17px,1.9vw,22px)] tracking-[0.06em]">
          <span style={{ color: miss ? "var(--muted)" : hex }}>+{points} PTS</span>
          {!miss && (
            <>
              <span className="mx-2 text-muted">·</span>
              <span className="text-text">sink {sinkMetres.toLocaleString("en-US")}m</span>
            </>
          )}
        </p>
        <p className="mt-2 font-hud text-[clamp(13px,1.3vw,16px)] tracking-[0.18em] text-faint">{verdict ?? (miss ? MISS_VERDICT : ui.verdict)}</p>
        {(tags?.hint || tags?.stale) && (
          <div className="mt-3 flex gap-2 font-hud text-[14px] tracking-[0.2em]">
            {tags.hint && <span className="px-2 py-0.5 text-caution" style={{ boxShadow: "inset 0 0 0 1px var(--caution)" }}>HINT</span>}
            {tags.stale && (
              <span className="px-2 py-0.5 text-faint" style={{ boxShadow: "inset 0 0 0 1px var(--faint)" }} title="You found this answer in an earlier dive, so it scores half">
                REPEAT ÷2
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-1.5" style={{ animation: "rise-in .4s var(--ease-out) .25s both" }}>
        <button
          ref={btnRef}
          type="button"
          onMouseEnter={() => sfx.hover()}
          className="min-w-[200px] px-7 py-2.5 font-hud text-[20px] tracking-[0.3em] text-text transition hover:-translate-y-0.5 active:translate-y-[2px] sm:text-[22px]"
          style={{ background: "rgba(8,16,30,.9)", boxShadow: "inset 0 0 0 2px var(--signal), 0 0 16px color-mix(in srgb, var(--signal) 30%, transparent)" }}
        >
          {cta} ▼
        </button>
        {autoMs > 0 && (
          <div className="h-[2px] w-[200px] bg-[#0d1830]" aria-hidden="true">
            <div className="h-full bg-signal" style={{ animation: `catch-timer ${autoMs}ms linear forwards` }} />
          </div>
        )}
      </div>
      <style>{`
        @keyframes dv-catch-in { from { opacity: 0; transform: scale(.96) } }
        @keyframes dv-catch-out { to { opacity: 0 } }
        @keyframes catch-timer { from { width: 100% } to { width: 0% } }
        @keyframes dv-bubble {
          0% { transform: translateY(0); opacity: 0 }
          15% { opacity: .9 }
          100% { transform: translateY(-110px); opacity: 0 }
        }
      `}</style>
    </div>
  );
}
