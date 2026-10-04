import { PIXEL_ICON_NAMES, PixelIcon, PixelSprite, type PixelIconName } from "@/components/ui";

// F21's Badge `icon` ids (lib/social/badges.ts) name things F10's PixelIcon set doesn't draw
// (anchor, moon, trench, …). These 10×10 sprites fill the gaps; anything else falls back to a
// PixelIcon of the same name, then a star.

const PAL = {
  k: "#0b0e1d", w: "#ffffff", y: "#ffd84d", Y: "#c99a1e", r: "#ff5c5c", b: "#5aa8ff", B: "#2d5fd6",
  c: "#4de3ff", p: "#ff5d8f", P: "#b23a64", v: "#9d7bff", g: "#3ddc97", G: "#1f8f5f", s: "#d6deef", S: "#8d98b5",
  n: "#e09a5b", N: "#9a5a2a",
};

const SPRITES: Record<string, readonly string[]> = {
  anchor: ["....ss....", "...s..s...", "....ss....", "..ssssss..", "....ss....", "....ss....", "s...ss...s", "ss..ss..ss", ".ssssssss.", "...ssss..."],
  moon: ["...yyyy...", "..yyY.....", ".yyY......", ".yyY......", "yyyY......", "yyyY......", ".yyY....y.", ".yyyY..yy.", "..yyyyyyy.", "...yyyyy.."],
  trench: ["cc......cc", "bcc....ccb", "bbc....cbb", "bbbc..cbbb", "bbBc..cBbb", "bBBbccbBBb", "vBBb..bBBv", "vvBb.wbBvv", "vvvB..Bvvv", "vvvvvvvvvv"],
  frog: ["..ww..ww..", ".wkw..wkw.", ".gwwggwwg.", "gggggggggg", "gggggggggg", "gkggggggkg", ".gkkkkkkg.", "..gggggg..", ".GG.GG.GG.", "GG..GG..GG"],
  stopwatch: ["...rrrr...", "....ss....", "..ssssss..", ".sk....ks.", "s....c...s", "s....c...s", "s...cc...s", ".s......s.", "..ssssss..", ".........."],
  coral: ["p...p...p.", "p.p.p.p.p.", "ppp.ppp.p.", ".p...p.pp.", ".pp..ppp..", "..ppp.p...", "....ppP...", "....pP....", "...nnnn...", "..nNNNNn.."],
  trident: ["y...y...y.", "y...y...y.", "y...y...y.", "yy..y..yy.", ".yyyyyyy..", "....Y.....", "....Y.....", "....Y.....", "....Y.....", "....Y....."],
  scroll: [".nnnnnnn..", "nwwwwwwwn.", ".wkkkkkw..", ".wwwwwww..", ".wkkkkw...", ".wwwwwww..", ".wkkkkkw..", ".wwwwwww..", "nwwwwwwwn.", ".nnnnnnn.."],
  diploma: ["..........", "wwwwwwwww.", "wkkkkkkkw.", "wwwwwwwww.", "wkkkkkwww.", "wwwwwwrrw.", "wwwwwrrrr.", ".....rrrr.", "......r.r.", "......r.r."],
};

export function BadgeGlyph({ icon, size = 24, locked = false }: { icon: string; size?: number; locked?: boolean }) {
  if (locked) return <PixelIcon name="lock" size={size} />;
  const sprite = SPRITES[icon];
  if (sprite) return <PixelSprite rows={sprite} palette={PAL} size={size} />;
  const name = (PIXEL_ICON_NAMES as string[]).includes(icon) ? (icon as PixelIconName) : "star";
  return <PixelIcon name={name} size={size} />;
}

/** Medallion colours per Badge tier: [light, dark]. */
export const TIER_TONE = {
  bronze: ["#e09a5b", "#7a4420"],
  silver: ["#d6deef", "#5e6a8a"],
  gold: ["#ffd84d", "#9a7414"],
} as const;
