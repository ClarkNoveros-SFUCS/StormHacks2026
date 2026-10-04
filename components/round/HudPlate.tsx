import type { ReactNode } from "react";

/** Stepped (pixel) corners as a clip-path, `s` px per step. */
export function steppedClip(s = 6): string {
  const a = `${s}px`;
  const b = `calc(100% - ${s}px)`;
  return `polygon(0 ${a}, ${a} ${a}, ${a} 0, ${b} 0, ${b} ${a}, 100% ${a}, 100% ${b}, ${b} ${b}, ${b} 100%, ${a} 100%, ${a} ${b}, 0 ${b})`;
}

type Props = {
  label: string;
  value: ReactNode;
  tone: "signal" | "accent";
  align?: "left" | "right";
  className?: string;
};

/** A Krillion HUD plate: a pixel-cornered dark plate, tracked label, big VT323 value in the tone colour. */
export function HudPlate({ label, value, tone, align = tone === "signal" ? "left" : "right", className = "" }: Props) {
  const color = tone === "signal" ? "var(--signal)" : "var(--accent)";
  return (
    <div className={`relative p-[2px] ${className}`} style={{ clipPath: steppedClip(6), background: "var(--dive-rim, #1b3050)" }}>
      <div
        className={`flex min-w-[88px] flex-col px-3 pt-1.5 pb-1 sm:min-w-[132px] sm:px-4 ${align === "right" ? "items-end" : "items-start"}`}
        style={{
          clipPath: steppedClip(5),
          background: "repeating-linear-gradient(0deg, #00000030 0 1px, transparent 1px 3px), rgba(8,16,32,.92)",
        }}
      >
        <span className="font-hud text-[11px] tracking-[0.3em] text-muted uppercase sm:text-[13px]">{label}</span>
        <span
          className="font-hud text-[24px] leading-none tabular-nums sm:text-[32px]"
          style={{ color, textShadow: `0 0 12px color-mix(in srgb, ${color} 55%, transparent)` }}
        >
          {value}
        </span>
      </div>
    </div>
  );
}
