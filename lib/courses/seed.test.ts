import { describe, expect, it } from "vitest";
import pythonBasics from "@/db/seed/courses/python-basics.json";
import { buildCourseRows, checkCourse, seedUuid, type CourseFile } from "./seed";

describe("Python Basics seed file", () => {
  const checked = checkCourse(pythonBasics as CourseFile);

  it("passes every Mode's generation checks with nothing dropped", () => {
    expect(checked.errors).toEqual([]);
    expect(checked.topics).toHaveLength(6);
    for (const t of checked.topics) {
      expect(t.games.map((g) => g.mode)).toEqual(["dive", "apogee", "leap", "pairs", "blitz"]);
    }
  });

  it("derives the same ids every time, and new ones when content changes", () => {
    const a = buildCourseRows(checked);
    const b = buildCourseRows(checkCourse(pythonBasics as CourseFile));
    expect(b.course.id).toBe(a.course.id);
    expect(b.topics.map((t) => t.games.map((g) => g.game.id))).toEqual(a.topics.map((t) => t.games.map((g) => g.game.id)));

    const edited = structuredClone(pythonBasics) as CourseFile;
    edited.topics[0].games.find((g) => g.mode === "leap")!.title = "Changed";
    const c = buildCourseRows(checkCourse(edited));
    expect(c.topics[0].games.find((g) => g.game.mode === "leap")!.game.id).not.toBe(a.topics[0].games.find((g) => g.game.mode === "leap")!.game.id);
    expect(c.topics[0].games.find((g) => g.game.mode === "dive")!.game.id).toBe(a.topics[0].games.find((g) => g.game.mode === "dive")!.game.id);
    expect(c.topics[1].document.id).toBe(a.topics[1].document.id);
  });

  it("makes public, ready, system-owned Games whose Evidence points at the reading's pages", () => {
    const rows = buildCourseRows(checked);
    for (const t of rows.topics) {
      const pageIds = new Set(t.pages.map((p) => p.id));
      for (const g of t.games) {
        expect(g.game).toMatchObject({ player_id: "system", visibility: "public", status: "ready" });
        for (const a of g.answers) expect(pageIds.has(a.evidence_page_id as string)).toBe(true);
      }
    }
    expect(seedUuid("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
