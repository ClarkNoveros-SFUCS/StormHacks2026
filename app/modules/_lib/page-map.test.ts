import { describe, expect, it } from "vitest";
import { buildModuleMap, pageTitle, statusOf } from "./page-map";

const now = new Date("2026-10-04T12:00:00Z");
const pages = [1, 2, 3].map((n) => ({ documentId: "d", filename: "f.pdf", pageNumber: n, contentMd: `# Page ${n}\ntext` }));
const ob = (pageNumber: number, correct: boolean, timeout = false, at = now) => ({ documentId: "d", pageNumber, correct, timeout, at });

describe("buildModuleMap", () => {
  it("scores each page, ranks the weakest and leaves untested pages blank", () => {
    const m = buildModuleMap(pages, [ob(1, true), ob(1, true), ob(1, true), ob(1, true), ob(2, false), ob(2, false, true), ob(2, true)], now);
    const [p1, p2, p3] = m.files[0].pages;
    expect(p1.status).toBe("solid");
    expect(p2).toMatchObject({ right: 1, wrong: 1, timeouts: 1, status: "missing", title: "Page 2" });
    expect(p3).toMatchObject({ score: null, status: "untested" });
    expect(m.weakest.map((p) => p.pageNumber)).toEqual([2]);
    expect(m.answers).toBe(7);
    expect(m.overall).toBeCloseTo(5 / 7);
  });
  it("weighs recent answers more", () => {
    const old = new Date(now.getTime() - 4 * 7 * 24 * 3.6e6);
    const m = buildModuleMap(pages, [ob(1, false, false, old), ob(1, false, false, old), ob(1, true), ob(1, true)], now);
    expect(m.files[0].pages[0].score!).toBeGreaterThan(0.75);
  });
  it("smooths a single answer", () => {
    expect(buildModuleMap(pages, [ob(1, false)], now).files[0].pages[0].status).toBe("missing");
    expect(buildModuleMap(pages, [ob(1, true)], now).files[0].pages[0].status).toBe("solid");
    expect(statusOf(0.6)).toBe("shaky");
  });
  it("titles a page by its first heading", () => {
    expect(pageTitle("intro\n## **Event** loop")).toBe("Event loop");
    expect(pageTitle("just text")).toBe("just text");
  });
});
