// Tier table, shared by scoring (F06) and Game generation (F04). See CONTEXT.md § Scoring.
export const TIERS = ["common", "solid", "deep", "rare"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_POINTS: Record<Tier, number> = { common: 10, solid: 25, deep: 60, rare: 100 };

// One Tier down, for a used Hint. A hinted common Prompt has no Tier below; it scores HINTED_COMMON_POINTS.
export const TIER_BELOW: Record<Tier, Tier | null> = { rare: "deep", deep: "solid", solid: "common", common: null };
export const HINTED_COMMON_POINTS = 5;
