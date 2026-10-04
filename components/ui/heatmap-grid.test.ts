import { describe, expect, it } from "vitest";
import { buildHeatGrid, levelFor, monthLabels } from "./heatmap-grid";

describe("heatmap grid", () => {
  it("levels are 0 for no activity and 1–4 relative to the max", () => {
    expect(levelFor(0, 10)).toBe(0);
    expect(levelFor(1, 10)).toBe(1);
    expect(levelFor(5, 10)).toBe(2);
    expect(levelFor(10, 10)).toBe(4);
  });

  it("ends with the week containing endDate, Sunday first, future days marked", () => {
    // 2026-10-04 is a Sunday
    const cols = buildHeatGrid([{ date: "2026-10-04", count: 3 }, { date: "2026-10-01", count: 1 }], 2, "2026-10-04");
    expect(cols).toHaveLength(2);
    expect(cols[1][0]).toMatchObject({ date: "2026-10-04", count: 3, level: 4, future: false });
    expect(cols[1][1].future).toBe(true);
    expect(cols[0][4]).toMatchObject({ date: "2026-10-01", count: 1 });
  });

  it("labels months where they start", () => {
    const cols = buildHeatGrid([], 10, "2026-10-04");
    const labels = monthLabels(cols).map(([, m]) => m);
    expect(labels).toContain("Sep");
    expect(labels).toContain("Oct");
  });
});
