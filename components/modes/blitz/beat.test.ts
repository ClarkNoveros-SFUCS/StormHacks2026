import { describe, expect, it } from "vitest";
import { accuracy, comboSegments, pulseAt, voicesAt } from "./beat";

const names = (step: number, combo = false, hot = false) => voicesAt(step, { combo, hot }).map((v) => v.voice);

describe("voicesAt", () => {
  it("plays four on the floor with offbeat hats by default", () => {
    expect(names(0)).toEqual(["kick"]);
    expect(names(2)).toEqual(["hat"]);
    expect(names(4)).toEqual(["kick"]);
    expect(names(1)).toEqual([]);
    expect(names(16)).toEqual(names(0)); // the pattern loops every bar
  });
  it("adds a snare backbeat, 16th hats and a bass line in a combo", () => {
    expect(names(4, true)).toEqual(["kick", "snare", "bass"]);
    expect(names(1, true)).toEqual(["hat"]);
    expect(voicesAt(6, { combo: true, hot: false }).find((v) => v.voice === "bass")?.freq).toBeGreaterThan(0);
  });
  it("ticks on every beat in the last seconds", () => {
    expect(names(8, false, true)).toEqual(["kick", "blip"]);
    expect(names(3, false, true)).toEqual([]);
  });
});

describe("pulseAt", () => {
  it("is 1 on the beat and falls toward 0 before the next", () => {
    expect(pulseAt(0, 500)).toBe(1);
    expect(pulseAt(1000, 500)).toBe(1);
    expect(pulseAt(250, 500)).toBeCloseTo(0.125);
    expect(pulseAt(499, 500)).toBeLessThan(0.001);
    expect(pulseAt(-250, 500)).toBeCloseTo(0.125);
  });
});

describe("comboSegments and accuracy", () => {
  it("caps the meter at 5", () => {
    expect(comboSegments(0)).toBe(0);
    expect(comboSegments(3)).toBe(3);
    expect(comboSegments(9)).toBe(5);
  });
  it("rounds accuracy and survives zero answers", () => {
    expect(accuracy(0, 0)).toBe(0);
    expect(accuracy(2, 3)).toBe(67);
    expect(accuracy(10, 10)).toBe(100);
  });
});
