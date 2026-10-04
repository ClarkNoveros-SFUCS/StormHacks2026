import { describe, expect, it } from "vitest";
import {
  badgeCatalogue, badgeInfo, BADGES, courseBadgeId, progressBadges, runBadges, topicBadgeId, type SocialRunSummary,
} from "./badges";

const run = (over: Partial<SocialRunSummary>): SocialRunSummary => ({
  runId: "r1", mode: "dive", score: 100, finishedAt: "2026-10-04T10:00:00Z", outcome: "finished", stats: {}, ...over,
});

describe("badge catalogue", () => {
  it("has the fixed badges with matching ids", () => {
    for (const [id, b] of Object.entries(BADGES)) expect(b.id).toBe(id);
    expect(Object.keys(BADGES)).toEqual(expect.arrayContaining([
      "first-dive", "streak-7", "streak-30", "trench-diver", "perfect-leap", "pairs-speedrun", "daily-top-10", "level-5", "level-10",
    ]));
  });

  it("generates Topic and Course badges for any course", () => {
    expect(topicBadgeId("python-basics", 3)).toBe("topic-python-basics-3");
    expect(courseBadgeId("python-basics")).toBe("course-python-basics");
    expect(badgeInfo("topic-python-basics-3")).toMatchObject({ name: "Python Basics: Topic 3", icon: "scroll" });
    expect(badgeInfo("course-sql-basics")).toMatchObject({ name: "Sql Basics Graduate" });
    expect(badgeInfo("nope")).toBeNull();
    expect(() => topicBadgeId("Python Basics", 1)).toThrow();
    expect(() => topicBadgeId("python-basics", 0)).toThrow();
  });

  it("lists Python Basics in the catalogue view", () => {
    const ids = badgeCatalogue().map((b) => b.id);
    expect(ids).toContain("topic-python-basics-6");
    expect(ids).toContain("course-python-basics");
  });
});

describe("progressBadges", () => {
  it("awards level and streak milestones", () => {
    expect(progressBadges(4, 6)).toEqual([]);
    expect(progressBadges(5, 7)).toEqual(["level-5", "streak-7"]);
    expect(progressBadges(10, 30)).toEqual(["level-5", "level-10", "streak-7", "streak-30"]);
  });
});

describe("runBadges", () => {
  it("always includes First Dive", () => {
    expect(runBadges(run({}), 0)).toEqual(["first-dive"]);
  });

  it("Trench Diver needs a rare-tier Answer", () => {
    expect(runBadges(run({}), 1)).toContain("trench-diver");
  });

  it("Perfect Leap: every question right and not fallen", () => {
    const leap = (correct: number, outcome = "cleared") =>
      runBadges(run({ mode: "leap", outcome, stats: { questions: 10, correct } }), 0);
    expect(leap(10)).toContain("perfect-leap");
    expect(leap(9)).not.toContain("perfect-leap");
    expect(leap(10, "fell")).not.toContain("perfect-leap");
    expect(runBadges(run({ mode: "dive", stats: { questions: 7, correct: 7 } }), 0)).not.toContain("perfect-leap");
  });

  it("Pairs Speedrun: both boards cleared with ≥ 60 s left (time bonus ≥ 300)", () => {
    const pairs = (timeBonus: number, outcome = "cleared") =>
      runBadges(run({ mode: "pairs", outcome, stats: { boardsCleared: 2, timeBonus } }), 0);
    expect(pairs(300)).toContain("pairs-speedrun");
    expect(pairs(295)).not.toContain("pairs-speedrun");
    expect(pairs(400, "time_up")).not.toContain("pairs-speedrun");
  });

  it("tolerates missing stats", () => {
    expect(runBadges(run({ mode: "leap", stats: null }), 0)).toEqual(["first-dive"]);
  });
});
