import { describe, expect, it } from "vitest";
import {
  baseUsername, displayNameFrom, firstFreeUsername, normalizeUsername, slugify, usernameCandidate, usernameProblem,
} from "./username";

describe("usernameProblem", () => {
  it("accepts 3–20 lowercase letters, digits and underscores", () => {
    for (const ok of ["ant", "anton_f", "a1_b2_c3", "x".repeat(20)]) expect(usernameProblem(ok)).toBeNull();
  });
  it("rejects bad formats", () => {
    for (const bad of ["ab", "x".repeat(21), "Anton", "an-ton", "an ton", "ánton", ""]) expect(usernameProblem(bad)).toBe("format");
  });
  it("rejects reserved names", () => {
    expect(usernameProblem("admin")).toBe("reserved");
    expect(usernameProblem("system")).toBe("reserved");
    expect(usernameProblem("requests")).toBe("reserved");
  });
  it("normalizes input", () => {
    expect(normalizeUsername("  @Anton_F ")).toBe("anton_f");
  });
});

describe("slugify", () => {
  it("lowercases, strips accents and joins words with underscores", () => {
    expect(slugify("Anton Florendo")).toBe("anton_florendo");
    expect(slugify("José  Ñúñez!")).toBe("jose_nunez");
    expect(slugify("--hello--")).toBe("hello");
    expect(slugify("a.b+c")).toBe("a_b_c");
  });
  it("cuts to 20 characters without a trailing underscore", () => {
    expect(slugify("abcdefghijklmnopqrs tuv")).toBe("abcdefghijklmnopqrs");
    expect(slugify("x".repeat(30))).toHaveLength(20);
  });
  it("can come out empty", () => {
    expect(slugify("李小龍")).toBe("");
  });
});

describe("baseUsername", () => {
  it("prefers the Clerk username", () => {
    expect(baseUsername({ username: "Anton7", fullName: "Anton Florendo" })).toBe("anton7");
  });
  it("then the full name", () => {
    expect(baseUsername({ firstName: "Anton", lastName: "Florendo" })).toBe("anton_florendo");
  });
  it("then the email local part", () => {
    expect(baseUsername({ primaryEmailAddress: { emailAddress: "a.florendo+x@sfu.ca" } })).toBe("a_florendo_x");
    expect(baseUsername({ emailAddresses: [{ emailAddress: "zed@x.io" }] })).toBe("zed");
  });
  it("pads short names and falls back to diver", () => {
    expect(baseUsername({ firstName: "Al" })).toBe("al_diver");
    expect(baseUsername({ fullName: "李小龍" })).toBe("diver");
    expect(baseUsername(null)).toBe("diver");
  });
  it("skips reserved names", () => {
    expect(baseUsername({ username: "admin", fullName: "Ada Lovelace" })).toBe("ada_lovelace");
  });
});

describe("de-duplication", () => {
  it("numbers candidates and keeps them within 20 characters", () => {
    expect(usernameCandidate("anton", 1)).toBe("anton");
    expect(usernameCandidate("anton", 2)).toBe("anton2");
    expect(usernameCandidate("x".repeat(20), 12)).toBe(`${"x".repeat(18)}12`);
    expect(usernameCandidate("abcdefghijklmnopqrs_", 2)).toBe("abcdefghijklmnopqrs2");
  });
  it("picks the first free candidate", () => {
    expect(firstFreeUsername("anton", [])).toBe("anton");
    expect(firstFreeUsername("anton", ["anton", "anton2", "anton_f"])).toBe("anton3");
  });
});

describe("displayNameFrom", () => {
  it("uses the full name, else the username", () => {
    expect(displayNameFrom({ fullName: "Anton Florendo" }, "anton")).toBe("Anton Florendo");
    expect(displayNameFrom({ firstName: "Anton" }, "anton")).toBe("Anton");
    expect(displayNameFrom(null, "anton")).toBe("anton");
    expect(displayNameFrom({ fullName: "x".repeat(50) }, "a")).toHaveLength(40);
  });
});
