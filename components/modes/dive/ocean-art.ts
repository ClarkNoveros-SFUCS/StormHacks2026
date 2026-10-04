// Pixel art and colour ramps for the Dive ocean canvas. Pure data/helpers, no React.

/** Draw a char-grid sprite at low-res pixel coords. Keys map to colours; "." / " " are empty. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  rows: readonly string[],
  pal: Record<string, string>,
  x: number,
  y: number,
  opts: { flip?: boolean; scale?: number; alpha?: number } = {},
) {
  const { flip = false, scale = 1, alpha = 1 } = opts;
  const w = rows[0].length;
  ctx.globalAlpha = alpha;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    let c = 0;
    while (c < row.length) {
      const ch = row[c];
      const col = pal[ch];
      if (!col) {
        c++;
        continue;
      }
      let run = 1;
      while (c + run < row.length && row[c + run] === ch) run++;
      ctx.fillStyle = col;
      const cx = flip ? w - c - run : c;
      ctx.fillRect(Math.round(x + cx * scale), Math.round(y + r * scale), run * scale, scale);
      c += run;
    }
  }
  ctx.globalAlpha = 1;
}

export const BOAT = [
  ".............k............",
  "........ppppfk............",
  ".......pppppfk............",
  ".........pppfk............",
  ".............k............",
  ".........kkkkkkkkk........",
  ".........kwwkkkwwkk.......",
  ".........kwwkkkwwkk.......",
  ".kkkkkkkkkkkkkkkkkkkkkkkkk",
  "..kkkkkkkkkkkkkkkkkkkkkkk.",
  "...kkkkkkkkkkkkkkkkkkkkk..",
  "....kkkkkkkkkkkkkkkkkkk...",
];
/** The boat with its flag mid-flap. */
export const BOAT_ALT = [
  ".............k............",
  ".......ppppp.k............",
  "........ppppfk............",
  ".......ppppffk............",
  ".............k............",
  ...BOAT.slice(5),
];

export const FISH = ["..xxxx..x", ".xxxxxxxx", "xxxxxxxxx", ".xxxxxxxx", "..xxxx..x"];
export const SMALL_FISH = [".xxx.x", "xxxxxx", ".xxx.x"];
export const JELLY_A = [".xxx.", "xxxxx", "xxxxx", "x.x.x", "x.x.x", ".x.x."];
export const JELLY_B = [".xxx.", "xxxxx", "xxxxx", "x.x.x", ".x.x.", "x.x.x"];
export const ANGLER_SIL = ["......x...", ".......x..", "..xxxxx.x.", ".xxxxxxx..", "xxxxxxxxx.", ".xxxxxxx..", "..xxxxx..."];
export const SQUID = [
  "...xxx...",
  "..xxxxx..",
  ".xxxxxxx.",
  ".xxxxxxx.",
  ".xxxxxxx.",
  "..xxxxx..",
  "..xxxxx..",
  ".x.xxx.x.",
  "x..x.x..x",
  "x.x.x.x.x",
  ".x.x.x.x.",
  ".x..x..x.",
  "x..x.x..x",
  "x...x...x",
];
export const EEL = ["xxxx......xxx...", "..xxxxxxxx..xxxx", "............xx.."];

// The house mascot: a pixel anglerfish, facing right. s stalk · y lure · b body · d belly · w white · k pupil
export const MASCOT = [
  "......ssss....",
  ".....s....s...",
  "..........s...",
  "...bbbbbb..yy.",
  "b.bbbbbbbb.yy.",
  "bbbbbbbwkbb...",
  "bbbbbbbbbbbb..",
  "b.bbbbbbwbwbw.",
  "...bddddddbb..",
  ".....bbbbbb...",
];
export const MASCOT_PAL = { s: "#8d98b5", y: "#ffd166", b: "#6a55d6", d: "#9d8bff", w: "#ffffff", k: "#0b0e1d" };

type Stop = [number, [number, number, number]];

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const WATER: Stop[] = [
  [0, hex("#2b5c8a")],
  [150, hex("#214d7a")],
  [400, hex("#163a62")],
  [1000, hex("#0d2443")],
  [2500, hex("#09162c")],
  [4500, hex("#060d1c")],
  [7000, hex("#05080f")],
];

function ramp(stops: Stop[], v: number): [number, number, number] {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [m1, c1] = stops[i];
    if (v <= m1) {
      const [m0, c0] = stops[i - 1];
      const t = (v - m0) / (m1 - m0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return stops[stops.length - 1][1];
}

export function waterRgb(m: number): [number, number, number] {
  return ramp(WATER, m);
}

export function rgb(c: [number, number, number], a = 1): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}

export const SKY = {
  day: { top: "#cfdbe6", bottom: "#eef2f5", cloud: "rgba(255,255,255,0.75)", boat: "#141c2b", flag: "#ff5d8f", window: "#3b4a63" },
  dusk: { top: "#121731", bottom: "#4b3a5e", cloud: "rgba(112,86,132,0.55)", boat: "#0b0f1c", flag: "#b03c63", window: "#2a2f45" },
};

export type CreatureKind = "fish" | "school" | "jelly" | "angler" | "squid" | "eel";
export type Creature = { m: number; x: number; speed: number; kind: CreatureKind; z: number; phase: number };

/** A deterministic sea: creatures placed through the water column, by zone. */
export function makeCreatures(seed = 7): Creature[] {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const out: Creature[] = [];
  let m = 35;
  while (m < 7600) {
    const r = rand();
    let kind: CreatureKind;
    if (m < 200) kind = r < 0.6 ? "school" : "fish";
    else if (m < 1000) kind = r < 0.45 ? "fish" : r < 0.85 ? "jelly" : "school";
    else if (m < 3000) kind = r < 0.5 ? "jelly" : r < 0.9 ? "angler" : "eel";
    else if (m < 5500) kind = r < 0.45 ? "angler" : r < 0.7 ? "eel" : r < 0.85 ? "jelly" : "squid";
    else kind = r < 0.4 ? "squid" : r < 0.75 ? "angler" : "eel";
    out.push({
      m,
      x: rand(),
      speed: (0.01 + rand() * 0.025) * (rand() < 0.5 ? -1 : 1),
      kind,
      z: 0.55 + rand() * 0.6,
      phase: rand() * Math.PI * 2,
    });
    m += m < 400 ? 22 + rand() * 40 : 40 + rand() * 90;
  }
  return out;
}
