"use client";
import { useState } from "react";
import { badgeCatalogue } from "@/lib/social/badges";
import type { Badge, EarnedBadge } from "@/lib/social/types";
import { sfx } from "@/lib/ui/sfx";
import { BadgeGlyph, TIER_TONE } from "./BadgeGlyph";

const CLIP =
  "polygon(25% 0, 75% 0, 75% 6%, 88% 6%, 88% 12%, 94% 12%, 94% 25%, 100% 25%, 100% 75%, 94% 75%, 94% 88%, 88% 88%, 88% 94%, 75% 94%, 75% 100%, 25% 100%, 25% 94%, 12% 94%, 12% 88%, 6% 88%, 6% 75%, 0 75%, 0 25%, 6% 25%, 6% 12%, 12% 12%, 12% 6%, 25% 6%)";

/** A pixel medallion: tier-coloured and gleaming when earned, grey with a lock when not. */
export function Medallion({ badge, earned, size = 52 }: { badge: Badge; earned: boolean; size?: number }) {
  const [light, dark] = TIER_TONE[badge.tier];
  return (
    <span
      className={`relative grid shrink-0 place-items-center ${earned ? "shine" : ""}`}
      style={{
        width: size,
        height: size,
        clipPath: CLIP,
        background: earned ? `radial-gradient(circle at 35% 30%, color-mix(in srgb, white 35%, ${light}), ${light} 45%, ${dark})` : "linear-gradient(#2a3358, #1b2242)",
        filter: earned ? `drop-shadow(0 0 6px color-mix(in srgb, ${light} 55%, transparent))` : "grayscale(1)",
      }}
    >
      <span
        className="grid place-items-center"
        style={{ width: size * 0.7, height: size * 0.7, clipPath: CLIP, background: earned ? `color-mix(in srgb, ${dark} 70%, #0a0d1c)` : "#141a33" }}
      >
        <BadgeGlyph icon={badge.icon} locked={!earned} size={size * 0.42} />
      </span>
    </span>
  );
}

function BadgeTile({ badge, earnedAt }: { badge: Badge; earnedAt: string | null }) {
  const [flipped, setFlipped] = useState(false);
  const earned = earnedAt !== null;
  const when = earnedAt ? new Date(earnedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
  return (
    <li className="[perspective:600px]">
      <button
        type="button"
        aria-pressed={flipped}
        aria-label={`${badge.name}${earned ? `, earned ${when}` : ", locked"}. ${earned ? badge.description : `How to earn: ${badge.description}`}`}
        onClick={() => {
          setFlipped((f) => !f);
          sfx.pop();
        }}
        onMouseEnter={() => earned && sfx.hover()}
        className={`group relative block h-[118px] w-full rounded-md text-center transition-transform duration-500 [transform-style:preserve-3d] hover:[transform:rotateY(180deg)] focus-visible:[transform:rotateY(180deg)] ${
          flipped ? "[transform:rotateY(180deg)]" : ""
        }`}
        style={{ transitionTimingFunction: "var(--ease-snap)" }}
      >
        <span
          className={`absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-md border px-1 [backface-visibility:hidden] ${
            earned ? "border-border-strong bg-surface-2" : "border-dashed border-border bg-bg-2"
          }`}
        >
          <Medallion badge={badge} earned={earned} />
          <span className={`line-clamp-2 font-display text-[11px] leading-tight ${earned ? "text-text" : "text-faint"}`}>{badge.name}</span>
        </span>
        <span
          aria-hidden="true"
          className={`absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-md border p-2 [backface-visibility:hidden] [transform:rotateY(180deg)] ${
            earned ? "border-reward/60 bg-[#1d1a2e]" : "border-border bg-bg-2"
          }`}
        >
          <span className={`font-display text-[10px] tracking-widest uppercase ${earned ? "text-reward" : "text-faint"}`}>{earned ? badge.tier : "How to earn"}</span>
          <span className="text-[11px] leading-snug text-text">{badge.description}</span>
          {when && <span className="text-[10px] text-muted">{when}</span>}
        </span>
      </button>
    </li>
  );
}

/** Every Badge: earned ones first (newest first) and glowing, then the locked catalogue. Tiles flip to explain. */
export function BadgeGrid({ earned, initial = 9 }: { earned: EarnedBadge[]; initial?: number }) {
  const [all, setAll] = useState(false);
  const have = new Set(earned.map((b) => b.id));
  const locked = badgeCatalogue().filter((b) => !have.has(b.id));
  const items: { badge: Badge; earnedAt: string | null }[] = [
    ...earned.map((b) => ({ badge: b, earnedAt: b.earnedAt })),
    ...locked.map((b) => ({ badge: b, earnedAt: null })),
  ];
  const shown = all ? items : items.slice(0, initial);
  return (
    <div>
      <p className="mb-3 text-xs text-muted">
        <span className="font-display text-text">{earned.length}</span> of {items.length} earned · tap a badge to flip it
      </p>
      <ul className="grid grid-cols-3 gap-2">
        {shown.map((it) => (
          <BadgeTile key={it.badge.id} badge={it.badge} earnedAt={it.earnedAt} />
        ))}
      </ul>
      {items.length > initial && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-3 font-display text-sm text-signal hover:underline">
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}
