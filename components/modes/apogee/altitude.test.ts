import { describe, expect, it } from "vitest";
import { formatKm, kmForScore, LANDMARKS, landmarkAt, missionBandIndex, missionVerdict, pointsAtRulerPct, rulerPct, zoneText } from "./altitude";

describe("altitude", () => {
  it("shows 1 km per point", () => {
    expect(kmForScore(0)).toBe(0);
    expect(kmForScore(185)).toBe(185);
    expect(formatKm(1234)).toBe("1,234 km");
    expect(kmForScore(-5)).toBe(0);
  });

  it("keeps the real landmarks at their real altitudes and the path in order", () => {
    expect(LANDMARKS.find((l) => l.name === "Kármán line")?.pts).toBe(100);
    expect(LANDMARKS.find((l) => l.name === "ISS")?.pts).toBe(408);
    for (let i = 1; i < LANDMARKS.length; i++) expect(LANDMARKS[i].pts).toBeGreaterThan(LANDMARKS[i - 1].pts);
    expect(LANDMARKS.at(-1)?.pts).toBe(700);
    expect(LANDMARKS.filter((l) => l.stylised).every((l) => l.pts > 408)).toBe(true);
  });

  it("names the zone you're in", () => {
    expect(zoneText(0)).toBe("On the pad");
    expect(zoneText(5)).toBe("Climbing through the troposphere");
    expect(zoneText(120)).toBe("Past the Kármán line");
    expect(zoneText(700)).toBe("Past Jupiter");
    expect(landmarkAt(408)).toBe(LANDMARKS.findIndex((l) => l.name === "ISS"));
  });

  it("maps the ruler both ways", () => {
    expect(rulerPct(0)).toBe(0);
    expect(rulerPct(700)).toBe(100);
    expect(rulerPct(9999)).toBe(100);
    for (const p of [10, 150, 408, 650]) expect(pointsAtRulerPct(rulerPct(p))).toBeCloseTo(p, 6);
  });

  it("puts a score in its mission band and says how far the next stop is", () => {
    expect(missionBandIndex(0)).toBe(0);
    expect(missionBandIndex(150)).toBe(0);
    expect(missionBandIndex(151)).toBe(1);
    expect(missionBandIndex(700)).toBe(3);
    expect(missionVerdict(0)).toMatch(/never left the pad/);
    expect(missionVerdict(120)).toBe("You climbed past the Kármán line. 40 more km reaches low Earth orbit.");
  });
});
