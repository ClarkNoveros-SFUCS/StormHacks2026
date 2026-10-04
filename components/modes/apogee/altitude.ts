// How Apogee shows Tiers, altitude and the mission bands. Pure data + helpers, safe anywhere.
// Spec: docs/design/modes/apogee.md. Apogee plays exactly like Dive (lib/modes/dive/rules.ts);
// only the words and the world differ.
import type { PixelIconName } from "@/components/ui/PixelIcon";
import type { RevealPrompt } from "@/lib/runs/types";
import { TIER_POINTS, type Tier } from "@/lib/scoring/tiers";
import { promptTier as divePromptTier, type TierKey } from "@/components/modes/dive/tiers";

export type { TierKey };

export type ApogeeTierUi = {
  label: "Troposphere" | "Orbit" | "Lunar" | "Deep Space" | "Miss";
  band: 0 | 1 | 2 | 3 | 4;
  /** CSS colour (a band token inside [data-theme="apogee"]). */
  color: string;
  /** Hex of the same colour, for WebGL, canvas and SVG. */
  hex: string;
  icon: PixelIconName;
  points: number;
  /** One line on the tier reveal after a correct answer. */
  verdict: string;
  /** How hard the engine burns for this Tier (shockwave size, sparks, shake). */
  burn: number;
};

export const APOGEE_TIERS: Record<TierKey, ApogeeTierUi> = {
  common: { label: "Troposphere", band: 1, color: "var(--band-1)", hex: "#a9b8d6", icon: "bubble", points: TIER_POINTS.common, verdict: "Off the pad. Every answer is fuel.", burn: 0.5 },
  solid: { label: "Orbit", band: 2, color: "var(--band-2)", hex: "#4fd6e8", icon: "target", points: TIER_POINTS.solid, verdict: "Stable orbit. You know this stuff.", burn: 0.8 },
  deep: { label: "Lunar", band: 3, color: "var(--band-3)", hex: "#a98bff", icon: "star", points: TIER_POINTS.deep, verdict: "Lunar burn. Genuinely uncommon.", burn: 1.2 },
  rare: { label: "Deep Space", band: 4, color: "var(--band-4)", hex: "#ffcf4a", icon: "sparkle", points: TIER_POINTS.rare, verdict: "Escape velocity. Straight from the footnotes.", burn: 2 },
  miss: { label: "Miss", band: 0, color: "var(--band-miss)", hex: "#ff5468", icon: "cross", points: 0, verdict: "Lost signal.", burn: 0 },
};

export const APOGEE_TIER_ORDER: Tier[] = ["common", "solid", "deep", "rare"];

/** Kilometres per point: 1 (F20's default), so the number shown is the score. */
export const KM_PER_POINT = 1;
/** The best possible Run (7 × 100). */
export const MAX_POINTS = 700;

export function kmForScore(score: number): number {
  return Math.max(0, score) * KM_PER_POINT;
}

/** `formatKm(124)` → "124 km". */
export function formatKm(score: number): string {
  return `${Math.round(kmForScore(score)).toLocaleString("en-US")} km`;
}

export type Landmark = {
  /** Game altitude (points = km) where you pass it. */
  pts: number;
  name: string;
  /** "Past the Kármán line" */
  the: string;
  /** Its real altitude or distance, for the toast and the 3D label. */
  real: string;
  note: string;
  /** Above the ISS the map is not to scale (the real distances don't fit in 700 km). */
  stylised?: boolean;
  /** Shown on the ruler with a label (small atmosphere layers only get a tick). */
  major: boolean;
};

/**
 * The flight path. Up to the ISS every landmark sits at its real altitude (1 point = 1 km).
 * Beyond it the deep-space stops are placed on a stylised scale so a great Run still reaches the
 * Moon, Mars and Jupiter; their real distances are said in the toast and the 3D labels.
 */
export const LANDMARKS: Landmark[] = [
  { pts: 0, name: "Launch pad", the: "the pad", real: "0 km", note: "Engines lit", major: false },
  { pts: 12, name: "Tropopause", the: "the tropopause", real: "12 km", note: "Weather ends here", major: false },
  { pts: 50, name: "Stratopause", the: "the stratopause", real: "50 km", note: "Top of the ozone layer", major: false },
  { pts: 85, name: "Mesopause", the: "the mesopause", real: "85 km", note: "Meteors burn up below", major: false },
  { pts: 100, name: "Kármán line", the: "the Kármán line", real: "100 km", note: "Space begins", major: true },
  { pts: 160, name: "Low orbit", the: "low Earth orbit", real: "160 km", note: "The lowest orbit that holds", major: false },
  { pts: 408, name: "ISS", the: "the ISS", real: "408 km", note: "Low Earth orbit", major: true },
  { pts: 460, name: "Geostationary", the: "geostationary orbit", real: "35,786 km", note: "Weather satellites park here", stylised: true, major: true },
  { pts: 530, name: "The Moon", the: "the Moon", real: "384,400 km", note: "Apollo 11 got this far", stylised: true, major: true },
  { pts: 590, name: "Sun–Earth L2", the: "Sun–Earth L2", real: "1.5 million km", note: "Home of the Webb telescope", stylised: true, major: true },
  { pts: 650, name: "Mars", the: "Mars", real: "54.6 million km", note: "At closest approach", stylised: true, major: true },
  { pts: 700, name: "Jupiter", the: "Jupiter", real: "588 million km", note: "At closest approach", stylised: true, major: true },
];

/** Index of the last landmark at or below `points`. */
export function landmarkAt(points: number): number {
  let idx = 0;
  LANDMARKS.forEach((l, i) => {
    if (points >= l.pts) idx = i;
  });
  return idx;
}

/** "On the pad", "Climbing through the troposphere", "Past the Kármán line" … */
export function zoneText(points: number): string {
  if (points <= 0.5) return "On the pad";
  const i = landmarkAt(points);
  if (i === 0) return "Climbing through the troposphere";
  if (i === LANDMARKS.length - 1) return "Past Jupiter";
  return `Past ${LANDMARKS[i].the}`;
}

/** Where `points` sits on the ruler, 0–100 (%), eased so the lower atmosphere gets room. */
export function rulerPct(points: number): number {
  return Math.pow(Math.min(1, Math.max(0, points / MAX_POINTS)), 0.6) * 100;
}

/** Inverse of rulerPct. */
export function pointsAtRulerPct(pct: number): number {
  return Math.pow(Math.min(1, Math.max(0, pct / 100)), 1 / 0.6) * MAX_POINTS;
}

export type MissionBand = { min: number; max: number; range: string; tier: Tier; label: string; verdict: string };

/** The mission bands: what a Run total means (pass bar 150). */
export const MISSION_BANDS: MissionBand[] = [
  { min: 0, max: 150, range: "0–150", tier: "common", label: "Suborbital", verdict: "Up and back down. Hunt for rarer answers." },
  { min: 151, max: 300, range: "151–300", tier: "solid", label: "Orbit", verdict: "You know the main ideas." },
  { min: 301, max: 500, range: "301–500", tier: "deep", label: "Lunar", verdict: "Below the slides' surface." },
  { min: 501, max: Infinity, range: "501–700", tier: "rare", label: "Deep space", verdict: "You read the footnotes." },
];

export function missionBandIndex(score: number): number {
  const i = MISSION_BANDS.findIndex((b) => score >= b.min && score <= b.max);
  return i === -1 ? 0 : i;
}

/** One line on where the Run got to, for the Mission Report. */
export function missionVerdict(score: number): string {
  if (score <= 0) return "The rocket never left the pad. Every answer is fuel next time.";
  const i = landmarkAt(score);
  const next = LANDMARKS[i + 1];
  if (i === 0) return `Still inside the weather.${next ? ` ${next.pts - score} more km reaches ${next.the}.` : ""}`;
  return `You climbed past ${LANDMARKS[i].the}.${next ? ` ${next.pts - score} more km reaches ${next.the}.` : ""}`;
}

/** The Tier a Reveal row shows (same rule as Dive). */
export function promptTier(p: Pick<RevealPrompt, "outcome" | "kind" | "answers" | "tier">): TierKey {
  return divePromptTier(p);
}
