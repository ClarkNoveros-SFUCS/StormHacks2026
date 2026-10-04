import { describe, expect, it } from "vitest";
import { BANNERS, bannerFor, isBannerId } from "./banners";
import { formatCountdown, heatTip, joinedText, msUntilWeeklyReset, plural, timeAgo } from "./format";

describe("heatTip", () => {
  it("reads like '3 runs · 120 XP on Oct 4'", () => {
    expect(heatTip({ day: "2026-10-04", runs: 3, xp: 120 })).toBe("3 runs · 120 XP on Oct 4");
    expect(heatTip({ day: "2026-01-01", runs: 1, xp: 1500 })).toBe("1 run · 1,500 XP on Jan 1");
  });
  it("says so on an empty day", () => {
    expect(heatTip({ day: "2026-03-09", runs: 0, xp: 0 })).toBe("No activity on Mar 9");
  });
});

describe("plural", () => {
  it("picks the form by count", () => {
    expect(plural(1, "day")).toBe("1 day");
    expect(plural(0, "day")).toBe("0 days");
    expect(plural(2, "topic passed", "topics passed")).toBe("2 topics passed");
  });
});

describe("joinedText", () => {
  it("uses the Vancouver month", () => {
    // 03:00 UTC on Oct 1 is still Sep 30 in Vancouver
    expect(joinedText("2026-10-01T03:00:00Z")).toBe("Joined September 2026");
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-10-04T12:00:00Z");
  it("rounds to the biggest unit", () => {
    expect(timeAgo("2026-10-04T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-04T11:55:00Z", now)).toBe("5m ago");
    expect(timeAgo("2026-10-04T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-10-02T12:00:00Z", now)).toBe("2d ago");
    expect(timeAgo("2026-09-01T19:00:00Z", now)).toBe("Sep 1");
  });
});

describe("msUntilWeeklyReset", () => {
  const H = 3_600_000;
  it("counts to the next Monday 00:00 in Vancouver", () => {
    // Sunday 2026-10-04 12:00 PDT (19:00 UTC) → 12 h
    expect(msUntilWeeklyReset(new Date("2026-10-04T19:00:00Z"))).toBe(12 * H);
    // Monday 2026-10-05 00:00 PDT (07:00 UTC) → a full week
    expect(msUntilWeeklyReset(new Date("2026-10-05T07:00:00Z"))).toBe(7 * 24 * H);
    // Wednesday 2026-10-07 18:00 PDT (Thu 01:00 UTC) → 4 days 6 h
    expect(msUntilWeeklyReset(new Date("2026-10-08T01:00:00Z"))).toBe((4 * 24 + 6) * H);
  });
});

describe("formatCountdown", () => {
  it("shows days only when needed", () => {
    expect(formatCountdown(3_723_000)).toBe("01:02:03");
    expect(formatCountdown(2 * 86_400_000 + 5_000)).toBe("2d 00:00:05");
    expect(formatCountdown(-5)).toBe("00:00:00");
  });
});

describe("bannerFor", () => {
  it("keeps a valid choice", () => {
    expect(bannerFor("space", "anyone")).toBe("space");
  });
  it("derives a stable default from the username", () => {
    const a = bannerFor(null, "postyfan");
    expect(isBannerId(a)).toBe(true);
    expect(bannerFor(null, "postyfan")).toBe(a);
    expect(bannerFor("not-a-theme", "postyfan")).toBe(a);
  });
  it("spreads usernames over every theme", () => {
    const seen = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((u) => bannerFor(null, `diver_${u}`)));
    expect(seen.size).toBe(BANNERS.length);
  });
});
