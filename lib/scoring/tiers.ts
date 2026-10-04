// Tier table, shared by scoring (F06) and Game generation (F04). See CONTEXT.md § Scoring.
export const TIERS = ["common", "solid", "deep", "rare"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_POINTS: Record<Tier, number> = { common: 10, solid: 25, deep: 60, rare: 100 };

// One Tier down, for a used Hint. A hinted common Prompt has no Tier below; it scores HINTED_COMMON_POINTS.
export const TIER_BELOW: Record<Tier, Tier | null> = { rare: "deep", deep: "solid", solid: "common", common: null };
export const HINTED_COMMON_POINTS = 5;

/**
 * Tiers for an Open Prompt's Answers, ordered from most obvious to most obscure.
 * Index i is the Answer with rarity_rank i + 1. The last Answer is always the only rare one,
 * and there's always at least one common. Spec: game-generation-pipeline.md § Tier assignment.
 */
export function assignOpenTiers(n: number): Tier[] {
  if (!Number.isInteger(n) || n < 4 || n > 15) throw new Error(`An Open Prompt needs 4-15 Answers, got ${n}`);
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
