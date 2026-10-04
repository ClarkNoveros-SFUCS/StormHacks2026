import type { ReactNode } from "react";

export type ChipTone =
  | "neutral"
  | "accent"
  | "signal"
  | "reward"
  | "violet"
  | "success"
  | "danger"
  | "caution"
  | "band-1"
  | "band-2"
  | "band-3"
  | "band-4"
  | "band-miss";

const COLOR: Record<ChipTone, string> = {
  neutral: "var(--muted)",
  accent: "var(--accent)",
  signal: "var(--signal)",
  reward: "var(--reward)",
  violet: "var(--violet)",
  success: "var(--success)",
  danger: "var(--danger)",
  caution: "var(--caution)",
  "band-1": "var(--band-1)",
  "band-2": "var(--band-2)",
  "band-3": "var(--band-3)",
  "band-4": "var(--band-4)",
  "band-miss": "var(--band-miss)",
};

type Props = { tone?: ChipTone; icon?: ReactNode; size?: "sm" | "md"; className?: string; children: ReactNode };

/** A small tag tinted in its tone colour. Bands are never colour alone: pass an icon or a label. */
export function Chip({ tone = "neutral", icon, size = "sm", className = "", children }: Props) {
  const c = COLOR[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border font-display leading-none whitespace-nowrap ${
        size === "sm" ? "px-2 py-1 text-[12px]" : "px-3 py-1.5 text-sm"
      } ${className}`}
      style={{
        color: c,
        borderColor: `color-mix(in srgb, ${c} 45%, transparent)`,
        background: `color-mix(in srgb, ${c} 12%, transparent)`,
      }}
    >
      {icon && <span aria-hidden="true" className="inline-flex">{icon}</span>}
      {children}
    </span>
  );
}
