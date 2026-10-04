import { ApiError } from "@google/genai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { failureKind, GeminiError, withFallback } from "./gemini";

// F31: the retry and fallback policy, with fake attempts and a recorded sleep.

const overloaded = () => new ApiError({ message: "This model is currently experiencing high demand", status: 503 });
const timedOut = () => Object.assign(new Error("This operation was aborted"), { name: "AbortError" });

/** Runs withFallback with `outcomes` per model in order (an Error throws, anything else returns). */
async function run(models: string[], outcomes: Record<string, unknown[]>) {
  const tried: string[] = [];
  const slept: number[] = [];
  const out = withFallback(
    models,
    async (model) => {
      tried.push(model);
      const next = outcomes[model].shift();
      if (next instanceof Error) throw next;
      return next;
    },
    { sleep: async (ms) => void slept.push(ms) },
  );
  return { out, tried, slept };
}

describe("failureKind", () => {
  it("retries rate limits, overloads and network errors; moves on after a timeout; throws the rest", () => {
    expect(failureKind(overloaded())).toBe("overloaded");
    expect(failureKind(new ApiError({ message: "", status: 429 }))).toBe("overloaded");
    expect(failureKind(new ApiError({ message: "", status: 500 }))).toBe("overloaded");
    expect(failureKind(new TypeError("fetch failed"))).toBe("overloaded");
    expect(failureKind(timedOut())).toBe("timeout");
    expect(failureKind(Object.assign(new Error("t"), { name: "TimeoutError" }))).toBe("timeout");
    expect(failureKind(new ApiError({ message: "bad schema", status: 400 }))).toBe("fatal");
    expect(failureKind(new Error("something else"))).toBe("fatal");
  });
});

describe("withFallback", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the first model's answer without waiting", async () => {
    const { out, tried, slept } = await run(["flash", "lite"], { flash: ["ok"], lite: [] });
    expect(await out).toEqual({ result: "ok", model: "flash" });
    expect(tried).toEqual(["flash"]);
    expect(slept).toEqual([]);
  });

  it("an overloaded first model gets one quick retry, then the fallback answers", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { out, tried, slept } = await run(["flash", "lite"], { flash: [overloaded(), overloaded()], lite: ["ok"] });
    expect(await out).toEqual({ result: "ok", model: "lite" });
    expect(tried).toEqual(["flash", "flash", "lite"]);
    expect(slept).toEqual([2_000]);
  });

  it("a retry on the first model can still succeed", async () => {
    const { out, tried } = await run(["flash", "lite"], { flash: [overloaded(), "ok"], lite: [] });
    expect(await out).toEqual({ result: "ok", model: "flash" });
    expect(tried).toEqual(["flash", "flash"]);
  });

  it("a timed-out attempt falls back at once, without retrying the same model", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { out, tried, slept } = await run(["flash", "lite"], { flash: [timedOut()], lite: ["ok"] });
    expect(await out).toEqual({ result: "ok", model: "lite" });
    expect(tried).toEqual(["flash", "lite"]);
    expect(slept).toEqual([]);
  });

  it("the last model keeps the full retries (2, 5, 12 s), then throws a GeminiError", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { out, tried, slept } = await run(["flash", "lite"], { flash: [overloaded(), overloaded()], lite: [overloaded(), overloaded(), overloaded(), overloaded()] });
    await expect(out).rejects.toThrow(GeminiError);
    await expect(out).rejects.toThrow(/503/);
    expect(tried).toEqual(["flash", "flash", "lite", "lite", "lite", "lite"]);
    expect(slept).toEqual([2_000, 2_000, 5_000, 12_000]);
  });

  it("a single model gets the full retries", async () => {
    const { out, slept } = await run(["flash"], { flash: [overloaded(), overloaded(), "ok"] });
    expect(await out).toEqual({ result: "ok", model: "flash" });
    expect(slept).toEqual([2_000, 5_000]);
  });

  it("a timeout on the last model throws", async () => {
    const { out, tried } = await run(["flash"], { flash: [timedOut()] });
    await expect(out).rejects.toThrow(GeminiError);
    expect(tried).toEqual(["flash"]);
  });

  it("a fatal error throws at once, without falling back", async () => {
    const { out, tried } = await run(["flash", "lite"], { flash: [new ApiError({ message: "bad schema", status: 400 })], lite: ["ok"] });
    await expect(out).rejects.toThrow(/400/);
    expect(tried).toEqual(["flash"]);
  });
});
