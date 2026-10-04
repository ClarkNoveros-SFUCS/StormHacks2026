// How Dive shows Tiers, depth and the Bearing. Pure data + helpers, safe anywhere.
// Spec: docs/design/modes/dive.md §2–3, §6.
import type { PixelIconName } from "@/components/ui/PixelIcon";
import type { RevealPrompt } from "@/lib/runs/types";
import { TIER_POINTS, type Tier } from "@/lib/scoring/tiers";

export type TierKey = Tier | "miss";
export type Band = 0 | 1 | 2 | 3 | 4;

export type TierUi = {
  label: "Shallows" | "Reef" | "Abyss" | "Trench" | "Miss";
  band: Band;
  /** CSS colour (a band token). */
  color: string;
  /** Hex of the same colour, for canvas and SVG fills. */
  hex: string;
  icon: PixelIconName;
  /** How far an Answer of this Tier sinks you (points × 10 m). */
  depth: number;
  points: number;
  /** Krillion-style one-liner on the catch screen. */
  verdict: string;
};

export const TIER_UI: Record<TierKey, TierUi> = {
  common: {
    label: "Shallows",
    band: 1,
    color: "var(--band-1)",
    hex: "#8fa3c4",
    icon: "bubble",
    depth: 100,
    points: TIER_POINTS.common,
    verdict: "The obvious one. Still counts.",
  },
  solid: {
    label: "Reef",
    band: 2,
    color: "var(--band-2)",
    hex: "#4de3ff",
    icon: "fish",
    depth: 250,
    points: TIER_POINTS.solid,
    verdict: "Solid pull. You know this stuff.",
  },
  deep: {
    label: "Abyss",
    band: 3,
    color: "var(--band-3)",
    hex: "#9d7bff",
    icon: "jelly",
    depth: 600,
    points: TIER_POINTS.deep,
    verdict: "Genuinely uncommon. Nice pull.",
  },
  rare: {
    label: "Trench",
    band: 4,
    color: "var(--band-4)",
    hex: "#ffd166",
    icon: "lantern",
    depth: 1000,
    points: TIER_POINTS.rare,
    verdict: "Straight from the footnotes. Legendary.",
  },
  miss: {
    label: "Miss",
    band: 0,
    color: "var(--band-miss)",
    hex: "#3d4f6e",
    icon: "bubble",
    depth: 0,
    points: 0,
    verdict: "Nothing on the line this time.",
  },
};

/** Tiers from the surface down, for lines, legends and filters. */
export const TIER_ORDER: Tier[] = ["common", "solid", "deep", "rare"];

/** Metres per point: every point sinks you 10 m. */
export const METRES_PER_POINT = 10;

export function depthForScore(score: number): number {
  return Math.max(0, score) * METRES_PER_POINT;
}

/** `formatDepth(124)` → "−1,240 m" (a real minus sign). 0 points → "0 m". */
export function formatDepth(points: number): string {
  return formatMetres(depthForScore(points));
}

/** `formatMetres(1240)` → "−1,240 m". */
export function formatMetres(metres: number): string {
  const m = Math.round(Math.max(0, metres));
  return m === 0 ? "0 m" : `−${m.toLocaleString("en-US")} m`;
}

export type DepthZone = "surface" | "sunlit" | "twilight" | "midnight" | "abyss" | "trench";

/**
 * The ocean zone at a depth, tuned to a 0–7,000 m game (700 points max):
 * surface (0) · sunlit (< 200) · twilight (< 1,000) · midnight (< 3,000) · abyss (< 5,500) · trench.
 */
export function depthZone(metres: number): DepthZone {
  if (metres <= 0) return "surface";
  if (metres < 200) return "sunlit";
  if (metres < 1000) return "twilight";
  if (metres < 3000) return "midnight";
  if (metres < 5500) return "abyss";
  return "trench";
}

export type BearingBand = { min: number; max: number; range: string; tier: Tier; label: string; verdict: string };

/** THE BEARING: what a Run total means. */
export const BEARING: BearingBand[] = [
  { min: 0, max: 150, range: "0–150", tier: "common", label: "Shallows", verdict: "Plenty of ocean left below." },
  { min: 151, max: 300, range: "151–300", tier: "solid", label: "Reef", verdict: "You know the main ideas." },
  { min: 301, max: 500, range: "301–500", tier: "deep", label: "Abyss", verdict: "Below the slides' surface." },
  { min: 501, max: Infinity, range: "501–700", tier: "rare", label: "Trench", verdict: "You read the footnotes." },
];

export function bearingIndex(score: number): number {
  const i = BEARING.findIndex((b) => score >= b.min && score <= b.max);
  return i === -1 ? 0 : i;
}

/** The Tier a Reveal row shows: the found Answer's Tier, the Prompt's Tier, or a miss. */
export function promptTier(p: Pick<RevealPrompt, "outcome" | "kind" | "answers" | "tier">): TierKey {
  if (p.outcome !== "correct") return "miss";
  if (p.kind === "open") return p.answers?.find((a) => a.found)?.tier ?? "common";
  return p.tier ?? "common";
}
