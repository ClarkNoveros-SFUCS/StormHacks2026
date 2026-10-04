import { describe, expect, it } from "vitest";
import { anchorY, DiveCamera, depthAtScreenY, screenYOf } from "./depth";
import { bearingIndex, depthForScore, depthZone, formatDepth, formatMetres } from "./tiers";

describe("formatDepth", () => {
  it("shows 10 m per point with a real minus sign and commas", () => {
    expect(formatDepth(0)).toBe("0 m");
    expect(formatDepth(25)).toBe("−250 m");
    expect(formatDepth(124)).toBe("−1,240 m");
    expect(formatDepth(700)).toBe("−7,000 m");
    expect(formatMetres(1240.4)).toBe("−1,240 m");
    expect(depthForScore(-5)).toBe(0);
  });
});

describe("depthZone", () => {
  it("names zones for a 0–7,000 m game", () => {
    expect(depthZone(0)).toBe("surface");
    expect(depthZone(100)).toBe("sunlit");
    expect(depthZone(600)).toBe("twilight");
    expect(depthZone(1000)).toBe("midnight");
    expect(depthZone(4000)).toBe("abyss");
    expect(depthZone(7000)).toBe("trench");
  });
});

describe("bearingIndex", () => {
  it("lights the right band", () => {
    expect(bearingIndex(0)).toBe(0);
    expect(bearingIndex(151)).toBe(1);
    expect(bearingIndex(500)).toBe(2);
    expect(bearingIndex(900)).toBe(3);
  });
});

describe("depth mapping", () => {
  const H = 900;
  it("puts the waterline 25% down at the surface", () => {
    expect(screenYOf(0, 0, H)).toBe(225);
    expect(anchorY(0, H)).toBe(225);
  });
  it("scrolls the waterline out of view after a 100 m catch", () => {
    expect(screenYOf(0, 100, H)).toBeLessThan(0);
  });
  it("round-trips screen y and depth", () => {
    expect(depthAtScreenY(screenYOf(640, 500, H), 500, H)).toBeCloseTo(640);
  });
});

describe("DiveCamera", () => {
  it("springs to its target and notifies", () => {
    const cam = new DiveCamera();
    const seen: number[] = [];
    cam.subscribe((d) => seen.push(d));
    cam.set(250);
    for (let i = 0; i < 400 && cam.step(1 / 60); i++);
    expect(cam.depth).toBe(250);
    expect(seen.length).toBeGreaterThan(10);
  });
  it("jumps under reduced motion", () => {
    const cam = new DiveCamera();
    cam.set(600);
    cam.step(1 / 60, true);
    expect(cam.depth).toBe(600);
  });
});
