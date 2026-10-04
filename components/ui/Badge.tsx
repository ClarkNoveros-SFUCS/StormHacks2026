"use client";
import { useState } from "react";
import { sfx } from "@/lib/ui/sfx";
import { PixelIcon, type PixelIconName } from "./PixelIcon";

export type BadgeTone = "bronze" | "silver" | "gold" | "gem" | "accent";

const TONE: Record<BadgeTone, [string, string]> = {
  bronze: ["#e09a5b", "#7a4420"],
  silver: ["#d6deef", "#5e6a8a"],
  gold: ["#ffd84d", "#9a7414"],
  gem: ["#4de3ff", "#2d5fd6"],
  accent: ["#ff5d8f", "#8f2447"],
};

type Props = {
  name: string;
  icon: PixelIconName;
  tone?: BadgeTone;
  earned?: boolean;
  description?: string;
  size?: number;
};

/** A pixel medallion. Earned badges gleam and flip on hover/click; locked ones are greyed with a lock. */
export function Badge({ name, icon, tone = "gold", earned = true, description, size = 64 }: Props) {
  const [flip, setFlip] = useState(0);
  const [light, dark] = TONE[tone];
  return (
    <button
      type="button"
      className="group flex w-[88px] flex-col items-center gap-1.5 text-center"
      title={description ? `${name}: ${description}` : name}
      aria-label={`${name}${earned ? "" : " (locked)"}${description ? `. ${description}` : ""}`}
      onMouseEnter={() => earned && setFlip((f) => f + 1)}
      onClick={() => {
        if (!earned) return;
        setFlip((f) => f + 1);
        sfx.pop();
      }}
    >
      <span
        key={flip}
        className={`relative grid place-items-center ${earned ? "shine" : ""}`}
        style={{
          width: size,
          height: size,
          clipPath:
            "polygon(25% 0, 75% 0, 75% 6%, 88% 6%, 88% 12%, 94% 12%, 94% 25%, 100% 25%, 100% 75%, 94% 75%, 94% 88%, 88% 88%, 88% 94%, 75% 94%, 75% 100%, 25% 100%, 25% 94%, 12% 94%, 12% 88%, 6% 88%, 6% 75%, 0 75%, 0 25%, 6% 25%, 6% 12%, 12% 12%, 12% 6%, 25% 6%)",
          background: earned
            ? `radial-gradient(circle at 35% 30%, color-mix(in srgb, white 35%, ${light}), ${light} 45%, ${dark})`
            : "linear-gradient(#2a3358, #1b2242)",
          animation: flip > 0 && earned ? "badge-flip .7s var(--ease-out)" : undefined,
          filter: earned ? undefined : "grayscale(1)",
        }}
      >
        <span
          className="grid place-items-center"
          style={{
            width: size * 0.7,
            height: size * 0.7,
            clipPath: "inherit",
            background: earned ? `color-mix(in srgb, ${dark} 70%, #0a0d1c)` : "#141a33",
          }}
        >
          <PixelIcon name={earned ? icon : "lock"} size={size * 0.42} />
        </span>
      </span>
      <span className={`font-display text-[12px] leading-tight ${earned ? "text-text" : "text-faint"}`}>{name}</span>
    </button>
  );
}
