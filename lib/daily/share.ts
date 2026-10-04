// The Daily Dive share text (Wordle-style). Pure and client-safe.
//
//   SYLLABYSS Daily #12 · −1,400 m
//   🟦🟨⬛⬜🟪🟦⬜
//   https://syllabyss.example/daily

import type { Tier } from "../scoring/tiers.ts";

/** One square per Prompt, by the Tier it scored at; a miss is ⬛. */
export const TIER_SQUARES: Record<Tier, string> = { rare: "🟨", deep: "🟪", solid: "🟦", common: "⬜" };
export const MISS_SQUARE = "⬛";

/** Metres per point, as in every Dive screen. */
export const METRES_PER_POINT = 10;

export const DEFAULT_SITE_URL = "http://localhost:3000";

/** The site's public URL: NEXT_PUBLIC_SITE_URL without a trailing slash, else localhost:3000. */
export function siteUrl(env: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string {
  const url = env?.trim();
  return url ? url.replace(/\/+$/, "") : DEFAULT_SITE_URL;
}

/** "−1,400 m" (a true minus sign), or "0 m". */
export function formatDepth(score: number): string {
  const metres = Math.max(0, Math.round(score)) * METRES_PER_POINT;
  return metres === 0 ? "0 m" : `−${metres.toLocaleString("en-US")} m`;
}

export function tierSquares(tiers: (Tier | null)[]): string {
  return tiers.map((t) => (t ? TIER_SQUARES[t] : MISS_SQUARE)).join("");
}

/**
 * The share text for one Run of Daily #number. A practice Run (not the counted one) says so,
 * so a replay is never passed off as the day's result.
 */
export function shareText(
  run: { number: number; score: number; tiers: (Tier | null)[]; counted: boolean },
  baseUrl: string = siteUrl(),
): string {
  const head = `SYLLABYSS Daily #${run.number} · ${formatDepth(run.score)}${run.counted ? "" : " (practice)"}`;
  return `${head}\n${tierSquares(run.tiers)}\n${baseUrl}/daily`;
}
