// Tier table and Open Prompt tier assignment. Pure, shared by game generation, the seed
// and scoring. Spec: docs/architecture/game-generation-pipeline.md § Tier assignment.

export const TIERS = ["common", "solid", "deep", "rare"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_POINTS: Record<Tier, number> = { common: 10, solid: 25, deep: 60, rare: 100 };

/**
 * Tiers for an Open Prompt's Answers, ordered from most obvious to most obscure.
 * Index i is the Answer with rarity_rank i + 1. The last Answer is always the only rare one,
 * and there's always at least one common.
 */
export function assignOpenTiers(n: number): Tier[] {
  if (!Number.isInteger(n) || n < 4) throw new Error(`An Open Prompt needs at least 4 Answers, got ${n}`);
  const m = n - 1;
  const deep = Math.ceil(0.3 * m);
  let solid = Math.round(0.4 * m);
  let common = m - deep - solid;
  if (common < 1) {
    solid -= 1;
    common += 1;
  }
  return [
    ...Array<Tier>(common).fill("common"),
    ...Array<Tier>(solid).fill("solid"),
    ...Array<Tier>(deep).fill("deep"),
    "rare",
  ];
}
