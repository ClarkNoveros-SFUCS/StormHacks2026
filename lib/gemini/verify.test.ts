import { afterEach, describe, expect, it, vi } from "vitest";
import { verificationEnabled, verifyContents, verifyModels } from "./verify";

afterEach(() => vi.unstubAllEnvs());

describe("verificationEnabled", () => {
  it("is on by default and off with GEMINI_VERIFY=off", () => {
    vi.stubEnv("GEMINI_VERIFY", "");
    expect(verificationEnabled()).toBe(true);
    for (const off of ["off", "OFF", "0", "false", " no "]) {
      vi.stubEnv("GEMINI_VERIFY", off);
      expect(verificationEnabled()).toBe(false);
    }
    vi.stubEnv("GEMINI_VERIFY", "on");
    expect(verificationEnabled()).toBe(true);
  });
});

describe("verifyModels", () => {
  it("tries GEMINI_VERIFY_MODEL, else the cheaper fallback model, first", () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.stubEnv("GEMINI_MODEL", "main");
    vi.stubEnv("GEMINI_FALLBACK_MODEL", "lite");
    vi.stubEnv("GEMINI_VERIFY_MODEL", "");
    expect(verifyModels()).toEqual(["lite", "main"]);
    vi.stubEnv("GEMINI_VERIFY_MODEL", "main");
    expect(verifyModels()).toEqual(["main", "lite"]);
    vi.stubEnv("GEMINI_VERIFY_MODEL", "other");
    expect(verifyModels()).toEqual(["other", "main", "lite"]);
    vi.stubEnv("GEMINI_VERIFY_MODEL", "");
    vi.stubEnv("GEMINI_FALLBACK_MODEL", "");
    expect(verifyModels()).toEqual(["main"]);
  });
});

describe("verifyContents", () => {
  it("shows the cited pages, then the questions as JSON", () => {
    const text = verifyContents("deck.pdf", {
      pages: [{ pageNumber: 3, contentMd: "Prim builds an MST." }],
      questions: [{ id: "P1", kind: "open", text: "Name an MST algorithm", answers: [{ id: "P1.A1", answer: "Prim", page: 3, quote: "Prim builds an MST." }] }],
    });
    expect(text).toMatch(/^Document: deck\.pdf\n\n=== Page 3 ===\nPrim builds an MST\.\n\nQUESTIONS\n/);
    expect(text).toContain('"id": "P1.A1"');
  });
});
