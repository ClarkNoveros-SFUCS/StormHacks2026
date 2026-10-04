import type { ReactNode } from "react";
import { steppedClip } from "./HudPlate";

export type RoundCardState = "in" | "rise" | "gone" | "shake" | "still";

type Props = {
  /** e.g. "PROMPT 1 OF 7" */
  label: string;
  text: ReactNode;
  /** e.g. "▼ rarer answers sink deeper ▼" */
  footer?: ReactNode;
  /** Right side of the label row (a tier badge for single-answer Prompts). */
  badge?: ReactNode;
  /** Shown in caution once a Hint is used. */
  hint?: string | null;
  /** Big stamp over the card, e.g. "TIME!". */
  stamp?: string | null;
  state?: RoundCardState;
  className?: string;
};

const ANIM: Record<RoundCardState, string | undefined> = {
  in: "card-in .7s var(--ease-bounce) both",
  /** Dive: the next card drifts up out of the water to its place (Krillion). */
  rise: "card-rise 1.5s cubic-bezier(.2,.75,.25,1) both",
  gone: "card-gone .6s ease-in forwards",
  shake: "shake .5s ease-out",
  still: undefined,
};

/** The Krillion prompt card: scanlined dark panel, pink tracked label, big VT323 text. Re-key it per Prompt to replay `card-in`. */
export function RoundCard({ label, text, footer, badge, hint, stamp, state = "in", className = "" }: Props) {
  return (
    <div className={`relative w-full ${className}`} style={{ animation: ANIM[state] }}>
      <div className="p-[2px]" style={{ clipPath: steppedClip(8), background: "var(--dive-rim, #1b3050)" }}>
        <div
          className="relative px-5 pt-4 pb-4 sm:px-8 sm:pt-6 sm:pb-5"
          style={{
            clipPath: steppedClip(7),
            background: "repeating-linear-gradient(0deg, #00000033 0 1px, transparent 1px 3px), rgba(12,22,40,.94)",
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-3 sm:mb-3">
            <span className="font-hud text-[13px] tracking-[0.4em] text-accent uppercase sm:text-[16px]">{label}</span>
            {badge}
          </div>
          <p
            className="font-hud text-[clamp(24px,5.4vw,40px)] leading-[1.05] text-text"
            style={{ textShadow: "1px 0 rgba(255,93,143,.25), -1px 0 rgba(77,227,255,.25)" }}
          >
            {text}
          </p>
          {hint && (
            <p className="mt-3 font-hud text-[17px] text-caution sm:text-[19px]" style={{ animation: "rise-in .4s var(--ease-out) both" }}>
              ? {hint}
            </p>
          )}
          {footer && <div className="mt-3 font-hud text-[13px] tracking-[0.2em] text-muted sm:text-[15px]">{footer}</div>}
        </div>
      </div>
      {stamp && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span
            className="border-4 border-accent px-4 font-hud text-[56px] leading-none text-accent sm:text-[72px]"
            style={{ transform: "rotate(-8deg)", animation: "banner-in .45s var(--ease-snap) both", background: "rgba(5,10,20,.75)" }}
          >
            {stamp}
          </span>
        </div>
      )}
    </div>
  );
}
