import { PixelSprite, type SpritePalette, type SpriteRows } from "./PixelSprite";

// Self-drawn 10×10 pixel icons. Palette keys are shared across icons:
// k outline · w white · y gold · Y gold dark · o orange · O orange dark · r red · b blue · B blue dark
// c cyan · p pink · v violet · g green · s silver · S silver dark · n bronze · N bronze dark · m muted
const P: SpritePalette = {
  k: "#0b0e1d",
  w: "#ffffff",
  y: "#ffd84d",
  Y: "#c99a1e",
  o: "#ff9f43",
  O: "#e0561f",
  r: "#ff5c5c",
  b: "#5aa8ff",
  B: "#2d5fd6",
  c: "#4de3ff",
  p: "#ff5d8f",
  v: "#9d7bff",
  g: "#3ddc97",
  s: "#d6deef",
  S: "#8d98b5",
  n: "#e09a5b",
  N: "#9a5a2a",
  m: "#9aa6c8",
};

const ICONS = {
  star: ["....y.....", "....y.....", "...yyy....", "yyyywyyyy.", ".yyywyyy..", "..yyyyy...", "..yyYyy...", ".yyY.Yyy..", ".yY...Yy..", ".........."],
  sparkle: ["....y.....", "....y.....", "....y.....", "...yyy....", "yyyywyyyy.", "...yyy....", "....y.....", "....y.....", "....y.....", ".........."],
  gem: ["..........", "..cccccc..", ".cwccbccb.", "cccbbbbbbB", ".cbbbbbBB.", "..cbbbBB..", "...cbBB...", "....bB....", "..........", ".........."],
  flame: ["....o.....", "...oo.....", "...ooo..o.", "..oooo.oo.", "..ooyoooo.", ".ooyyyooo.", ".oyyyyyoO.", ".oyywyyoO.", "..oyyyoO..", "...OOOO..."],
  rank: ["..nnnnnn..", ".nNNNNNNn.", "nNnnwnnnNn", "nNnwwwnnNn", "nNnnwnnnNn", ".nNnnnnNn.", "..nNnnNn..", "...nNNn...", "....nn....", ".........."],
  trophy: ["yyyyyyyyy.", "ywyyyyyYy.", "yyyyyyyYy.", ".yyyyyYy..", "..yyyyY...", "...yyY....", "....y.....", "...yyy....", "..YYYYY...", ".........."],
  heart: ["..........", ".pp...pp..", "pwpp.pppp.", "pppppppppp", "pppppppppp", ".pppppppp.", "..pppppp..", "...pppp...", "....pp....", ".........."],
  lock: ["...SSSS...", "..S....S..", "..S....S..", ".ssssssss.", ".sSSSSSSs.", ".sSSkkSSs.", ".sSSkkSSs.", ".sSSSSSSs.", ".ssssssss.", ".........."],
  check: ["..........", "........g.", ".......gg.", "......gg..", "g....gg...", "gg..gg....", ".gggg.....", "..gg......", "..........", ".........."],
  cross: ["..........", ".r.....r..", "..r...r...", "...r.r....", "....r.....", "...r.r....", "..r...r...", ".r.....r..", "..........", ".........."],
  bolt: ["....yyy...", "...yyy....", "..yyy.....", ".yyyyyy...", "....yyy...", "...yyy....", "..yy......", ".y........", "..........", ".........."],
  book: ["..........", ".vvvv.vvvv", ".vwwv.vwwv", ".vwwv.vwwv", ".vwwv.vwwv", ".vwwv.vwwv", ".vvvvvvvvv", "..........", "..........", ".........."],
  doc: [".sssss....", ".sSSSss...", ".sssssss..", ".sSSSSSs..", ".sssssss..", ".sSSSSSs..", ".sssssss..", ".sSSSSs...", ".sssssss..", ".........."],
  clock: ["...cccc...", "..c....c..", ".c...w..c.", ".c...w..c.", ".c...www.c", ".c.......c", "..c....c..", "...cccc...", "..........", ".........."],
  users: ["..cc...pp.", ".cccc.pppp", ".cccc.pppp", "..cc...pp.", ".cccc.pppp", "cccccppppp", "cccccppppp", "..........", "..........", ".........."],
  shell: ["....nn....", "...nNNn...", "..nNnnNn..", ".nNnNNnNn.", ".nNnNNnNn.", "nNnNnnNnNn", "nnnnnnnnnn", "..NNNNNN..", "..........", ".........."],
  bubble: ["..........", "...cccc...", "..c....c..", ".c.ww...c.", ".c.w....c.", ".c......c.", "..c....c..", "...cccc...", "..........", ".........."],
  fish: ["..........", "..........", "...bbbb..b", ".bbbbbbbbb", "bbwkbbbbb.", ".bbbbbbbbb", "...bbbb..b", "..........", "..........", ".........."],
  jelly: ["...vvvv...", "..vvvvvv..", ".vvwvvvvv.", ".vvvvvvvv.", ".v.v.v.v..", ".v.v.v.v..", "..v...v...", "..v...v...", "..........", ".........."],
  lantern: ["....yy....", "...y..y...", "...yyyy...", "..yywwyy..", "..ywwwwy..", "..yywwyy..", "...yyyy...", "....YY....", "..........", ".........."],
  sound: ["....c.....", "...cc..c..", "cccccc..c.", "cccccc.c.c", "cccccc.c.c", "cccccc..c.", "...cc..c..", "....c.....", "..........", ".........."],
  mute: ["....m.....", "...mm.....", "mmmmmm....", "mmmmmm.r.r", "mmmmmm..r.", "mmmmmm.r.r", "...mm.....", "....m.....", "..........", ".........."],
  menu: ["..........", "mmmmmmmmm.", "mmmmmmmmm.", "..........", "mmmmmmmmm.", "mmmmmmmmm.", "..........", "mmmmmmmmm.", "mmmmmmmmm.", ".........."],
  gear: ["...m..m...", "..mmmmmm..", ".mmmmmmmm.", "mmmm..mmmm", ".mm....mm.", ".mm....mm.", "mmmm..mmmm", ".mmmmmmmm.", "..mmmmmm..", "...m..m..."],
  rocket: ["....ss....", "...ssss...", "...sbbs...", "...ssss...", "..sssssss.", ".rssssssr.", ".r.ssss.r.", "...oyyo...", "....oo....", "....o....."],
  sprout: ["..........", ".gg..gg...", "gggg.ggg..", ".gggggg...", "....g.....", "....g.....", "..nnnnn...", "..nNNNn...", "...nnn....", ".........."],
  cards: [".ooooo....", ".owwwo....", ".owwwovvvv", ".owwwovwwv", ".oooooywwv", "....vwwwv.", "....vwwwv.", "....vvvvv.", "..........", ".........."],
  target: ["...rrrr...", "..r....r..", ".r..ww..r.", ".r.wrrw.r.", ".r.wrrw.r.", ".r..ww..r.", "..r....r..", "...rrrr...", "..........", ".........."],
  arrowDown: ["...cccc...", "...cccc...", "...cccc...", "...cccc...", "cccccccccc", ".cccccccc.", "..cccccc..", "...cccc...", "....cc....", ".........."],
  crown: ["..........", "y...y...y.", "yy.yyy.yy.", "yyyyyyyyy.", "yyyywyyyy.", "yyyyyyyyy.", "YYYYYYYYY.", "..........", "..........", ".........."],
  eye: ["..........", "..........", "..wwwwww..", ".wwbbbbww.", "wwbbkkbbww", ".wwbbbbww.", "..wwwwww..", "..........", "..........", ".........."],
} satisfies Record<string, SpriteRows>;

export type PixelIconName = keyof typeof ICONS;
export const PIXEL_ICON_NAMES = Object.keys(ICONS) as PixelIconName[];

type Props = { name: PixelIconName; size?: number; className?: string; title?: string; palette?: Partial<SpritePalette> };

/** A 10×10 self-drawn pixel icon. Pass `palette` to recolour (e.g. `{ c: "var(--band-3)" }`). */
export function PixelIcon({ name, size = 20, className, title, palette }: Props) {
  return <PixelSprite rows={ICONS[name]} palette={palette ? ({ ...P, ...palette } as SpritePalette) : P} size={size} className={className} title={title} />;
}
