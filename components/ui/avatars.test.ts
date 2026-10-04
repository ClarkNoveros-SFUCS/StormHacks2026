import { describe, expect, it } from "vitest";
import { AVATARS, avatarById, defaultAvatarFor } from "./avatars";

describe("pixel avatars", () => {
  it("has 16 avatars with unique ids", () => {
    expect(AVATARS).toHaveLength(16);
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(16);
  });

  it.each(AVATARS.map((a) => [a.id, a] as const))("%s is a 16×16 grid using only its palette", (_id, a) => {
    expect(a.rows).toHaveLength(16);
    for (const row of a.rows) {
      expect(row).toHaveLength(16);
      for (const ch of row) if (ch !== ".") expect(Object.keys(a.palette)).toContain(ch);
    }
  });

  it("falls back to the anglerfish and derives a stable default", () => {
    expect(avatarById("nope").id).toBe("anglerfish");
    expect(defaultAvatarFor("user_123")).toBe(defaultAvatarFor("user_123"));
  });
});
