// Points for a correct Answer. Spec: docs/architecture/run-and-scoring.md § Points.
import { HINTED_COMMON_POINTS, TIER_BELOW, TIER_POINTS, type Tier } from "./tiers";

// Open Prompt Answer: halved per earlier Run that scored it on this Prompt (Staleness), minimum 1.
export function openPoints(tier: Tier, earlierRuns: number): number {
  return Math.max(1, Math.floor(TIER_POINTS[tier] / 2 ** earlierRuns));
}

// Single-answer Prompt: the Prompt's Tier, or one Tier lower if the Hint was used.
export function singlePoints(tier: Tier, hintUsed: boolean): number {
  if (!hintUsed) return TIER_POINTS[tier];
  const below = TIER_BELOW[tier];
  return below ? TIER_POINTS[below] : HINTED_COMMON_POINTS;
}
