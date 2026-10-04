import { describe, expect, it } from "vitest";
import { dailyNumber, formatCountdown, msUntilNextDaily } from "./daily-teaser";
import {
  altitudeAt, CAMERA_SPEED, depthFraction, formatGauge, metresAt, MAX_METRES, seabedY, skyKindFor, waterlineY, zoneAt,
} from "./world";

const frame = { viewH: 800, maxScroll: 6000 };

describe("landing world", () => {
  it("puts the waterline 80% down and the seabed on screen at the bottom of the page", () => {
    expect(waterlineY(frame)).toBe(640);
    const cameraAtBottom = frame.maxScroll * CAMERA_SPEED;
    const seabedOnScreen = seabedY(frame) - cameraAtBottom;
    expect(seabedOnScreen / frame.viewH).toBeCloseTo(0.88);
  });

  it("keeps at least a screen of water on a short page", () => {
    const short = { viewH: 800, maxScroll: 100 };
    expect(seabedY(short) - waterlineY(short)).toBeGreaterThanOrEqual(800);
  });

  it("maps depth fractions to metres, 0 at the surface and the max at the seabed", () => {
    expect(depthFraction(0, frame)).toBe(0);
    expect(depthFraction(waterlineY(frame), frame)).toBe(0);
    expect(depthFraction(seabedY(frame), frame)).toBe(1);
    expect(depthFraction(1e9, frame)).toBe(1);
    expect(metresAt(0)).toBe(0);
    expect(metresAt(1)).toBe(MAX_METRES);
    expect(metresAt(0.5)).toBeLessThan(MAX_METRES / 2);
  });

  it("reads altitude above the water", () => {
    expect(altitudeAt(0, frame)).toBe(300);
    expect(altitudeAt(waterlineY(frame), frame)).toBe(0);
    expect(altitudeAt(2000, frame)).toBe(0);
  });

  it("formats the gauge and names zones", () => {
    expect(formatGauge(0, 120)).toBe("+120 m");
    expect(formatGauge(0, 0)).toBe("0 m");
    expect(formatGauge(1240, 0)).toBe("−1,240 m");
    expect(zoneAt(0)).toBe("Sunlit zone");
    expect(zoneAt(450)).toBe("Twilight zone");
    expect(zoneAt(4100)).toBe("The abyss");
    expect(zoneAt(6000)).toBe("The trench");
  });

  it("tints the sky by local hour", () => {
    expect(skyKindFor(12)).toBe("day");
    expect(skyKindFor(18)).toBe("dusk");
    expect(skyKindFor(23)).toBe("night");
  });
});

describe("daily teaser", () => {
  it("numbers Dailies from launch day", () => {
    expect(dailyNumber("2026-10-04")).toBe(1);
    expect(dailyNumber("2026-10-05")).toBe(2);
    expect(dailyNumber("2026-11-03")).toBe(31);
  });

  it("counts down to Vancouver midnight", () => {
    // 2026-10-04 23:00 in Vancouver (PDT, UTC−7) = 2026-10-05 06:00 UTC
    expect(msUntilNextDaily(new Date("2026-10-05T06:00:00Z"))).toBe(3_600_000);
    expect(formatCountdown(3_600_000 + 61_000)).toBe("01:01:01");
  });
});
