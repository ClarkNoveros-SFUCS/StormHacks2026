// Profile banner themes (F26). Client-safe. The id is stored in players.banner (F21 accepts any
// `^[a-z0-9-]{1,32}$`); null means "pick one from the username", so every Player gets a banner.

export const BANNERS = [
  { id: "ocean", name: "Ocean", blurb: "Kelp, bubbles and a passing school of fish" },
  { id: "space", name: "Deep space", blurb: "Twinkling stars, a ringed planet, a lost rocket" },
  { id: "sky", name: "Open sky", blurb: "Drifting clouds, birds and rolling hills" },
] as const;

export type BannerId = (typeof BANNERS)[number]["id"];

const IDS = BANNERS.map((b) => b.id) as readonly string[];

export function isBannerId(v: string | null | undefined): v is BannerId {
  return typeof v === "string" && IDS.includes(v);
}

/** The Player's banner, or a stable default derived from their username. */
export function bannerFor(banner: string | null | undefined, seed: string): BannerId {
  if (isBannerId(banner)) return banner;
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BANNERS[h % BANNERS.length].id;
}
