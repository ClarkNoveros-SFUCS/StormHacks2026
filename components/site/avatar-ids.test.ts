import { describe, expect, it } from "vitest";
import { AVATARS as SOCIAL_AVATARS } from "@/lib/social/types";
import { AVATARS as DRAWN } from "@/components/ui/avatars";

// The API (lib/social) must accept every avatar the picker (components/ui) can draw.
describe("avatar ids", () => {
  it("lib/social AVATARS matches the drawn sprites, default first", () => {
    expect([...SOCIAL_AVATARS].sort()).toEqual(DRAWN.map((a) => a.id).sort());
    expect(SOCIAL_AVATARS[0]).toBe(DRAWN[0].id);
  });
});
