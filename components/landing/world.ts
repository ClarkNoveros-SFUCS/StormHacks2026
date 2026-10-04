// The landing page's scroll world, as pure maths: the camera follows page scroll from the sky,
// through the waterline, down to the seabed. Spec: overnight-decisions §9, §14 (the page
// descends from sky to deep ocean as you scroll). Unit-tested in world.test.ts.

/** The camera moves this fraction of the page scroll, so the world reads as a deep backdrop. */
export const CAMERA_SPEED = 0.6;
/** Waterline at this fraction of the viewport height when the page is at the top. */
export const WATERLINE = 0.8;
/** Seabed at this fraction of the viewport height when the page is scrolled to the bottom. */
export const SEABED = 0.88;
/** Depth shown on the gauge at the seabed. */
export const MAX_METRES = 6000;

export type WorldFrame = { viewH: number; maxScroll: number };

/** World y (CSS px) of the waterline. */
export function waterlineY(f: WorldFrame): number {
  return f.viewH * WATERLINE;
}

/** World y (CSS px) of the seabed: on screen at SEABED when fully scrolled. */
export function seabedY(f: WorldFrame): number {
  return Math.max(waterlineY(f) + f.viewH, f.maxScroll * CAMERA_SPEED + f.viewH * SEABED);
}

/** 0 at the waterline, 1 at the seabed (clamped). Negative world y above the water is 0. */
export function depthFraction(worldY: number, f: WorldFrame): number {
  const y0 = waterlineY(f);
  return Math.min(1, Math.max(0, (worldY - y0) / (seabedY(f) - y0)));
}

/** Gauge metres for a depth fraction: eased so the twilight and midnight zones get room. */
export function metresAt(frac: number): number {
  return Math.round(MAX_METRES * Math.pow(Math.min(1, Math.max(0, frac)), 1.6));
}

/** Altitude (m) above the water for a world y in the sky: 0 at the waterline, ~300 m at the top. */
export function altitudeAt(worldY: number, f: WorldFrame): number {
  const y0 = waterlineY(f);
  return worldY >= y0 ? 0 : Math.round(((y0 - worldY) / y0) * 300);
}

export type Zone = { name: string; from: number };

/** Ocean zones by depth (m). */
export const ZONES: Zone[] = [
  { name: "Sunlit zone", from: 0 },
  { name: "Twilight zone", from: 200 },
  { name: "Midnight zone", from: 1000 },
  { name: "The abyss", from: 4000 },
  { name: "The trench", from: 5600 },
];

export function zoneAt(metres: number): string {
  let z = ZONES[0].name;
  for (const zone of ZONES) if (metres >= zone.from) z = zone.name;
  return z;
}

/** "−1,240 m" below the water, "+120 m" above it, "0 m" at the surface. */
export function formatGauge(metres: number, altitude: number): string {
  if (altitude > 0) return `+${altitude.toLocaleString("en-US")} m`;
  if (metres <= 0) return "0 m";
  return `−${metres.toLocaleString("en-US")} m`;
}

type Rgb = [number, number, number];

function hex(h: string): Rgb {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Water colour by depth fraction, surface teal-blue → trench near-black. */
const WATER: [number, Rgb][] = [
  [0, hex("#2f73a6")],
  [0.08, hex("#1f5a8f")],
  [0.25, hex("#143e6c")],
  [0.45, hex("#0c2547")],
  [0.7, hex("#07142b")],
  [1, hex("#03060f")],
];

export function rampRgb(stops: [number, Rgb][], v: number): Rgb {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i];
    if (v <= p1) {
      const [p0, c0] = stops[i - 1];
      const t = (v - p0) / (p1 - p0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return stops[stops.length - 1][1];
}

export function waterAt(frac: number): Rgb {
  return rampRgb(WATER, frac);
}

export type SkyKind = "day" | "dusk" | "night";

/** Sky colour stops from the top of the world (0) to the horizon (1). */
export const SKY_STOPS: Record<SkyKind, [number, Rgb][]> = {
  night: [
    [0, hex("#04060e")],
    [0.45, hex("#0b1030")],
    [0.8, hex("#1a2356")],
    [1, hex("#2e3d78")],
  ],
  dusk: [
    [0, hex("#080b1c")],
    [0.4, hex("#1f1748")],
    [0.75, hex("#5a2d66")],
    [1, hex("#d0677a")],
  ],
  day: [
    [0, hex("#0d2552")],
    [0.45, hex("#1d4c8a")],
    [0.8, hex("#3c7fbe")],
    [1, hex("#8cc4e6")],
  ],
};

export function skyKindFor(hour: number): SkyKind {
  if (hour >= 7 && hour < 17) return "day";
  if ((hour >= 17 && hour < 20) || (hour >= 5 && hour < 7)) return "dusk";
  return "night";
}

export function css([r, g, b]: Rgb, a = 1): string {
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}
