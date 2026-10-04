"use client";
import { sfx } from "@/lib/ui/sfx";

type Props = {
  options: string[];
  onPick: (option: string) => void;
  locked?: boolean;
  /** Once locked: the right option (lit in success). */
  correct?: string | null;
  /** Once locked: what the Player picked (lit in danger if wrong). */
  picked?: string | null;
  className?: string;
};

/** Odd-one-out: a 2×2 grid of pixel tiles. One try. */
export function OptionGrid({ options, onPick, locked = false, correct, picked, className = "" }: Props) {
  return (
    <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${className}`} role="group" aria-label="Options">
      {options.map((o, i) => {
        const isRight = locked && o === correct;
        const isWrong = locked && o === picked && o !== correct;
        const ring = isRight ? "var(--success)" : isWrong ? "var(--danger)" : "var(--dive-rim, #1b3050)";
        return (
          <button
            key={o}
            type="button"
            disabled={locked}
            onMouseEnter={() => sfx.hover()}
            onClick={() => onPick(o)}
            className="group relative min-h-12 px-3 py-2 text-left font-hud text-[20px] leading-tight text-text transition hover:-translate-y-0.5 active:translate-y-[2px] disabled:cursor-default disabled:hover:translate-y-0 sm:min-h-14 sm:text-[24px]"
            style={{
              background: isRight ? "color-mix(in srgb, var(--success) 18%, #0d1830)" : isWrong ? "color-mix(in srgb, var(--danger) 18%, #0d1830)" : "#0d1830",
              boxShadow: `0 0 0 2px var(--bg), 0 0 0 4px ${ring}, 0 4px 0 4px var(--dive-drop, #0b1424)${isRight ? ", 0 0 22px color-mix(in srgb, var(--success) 45%, transparent)" : ""}`,
              opacity: locked && !isRight && !isWrong ? 0.55 : 1,
            }}
          >
            <span className="mr-2 text-muted">{String.fromCharCode(65 + i)}</span>
            {o}
            {isRight && <span className="ml-2 text-success">✓</span>}
            {isWrong && <span className="ml-2 text-danger">✗</span>}
          </button>
        );
      })}
    </div>
  );
}
