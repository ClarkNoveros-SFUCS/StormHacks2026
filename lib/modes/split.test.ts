import { afterEach, describe, expect, it, vi } from "vitest";
import { diveRequest, diveSplitRequest } from "./dive/generate";
import { generateSplit, generationPlan, joinResponses, splitEnabled, type GenerationRequest } from "./generation";
import { generatorFor } from "./generators";

// F30: a document's call split into parallel ones, joined before the checks.

const dive = generatorFor("dive")!;
const req = (name: string): GenerationRequest => ({ ...diveRequest, systemInstruction: name });

describe("splitEnabled", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is on unless GEMINI_SPLIT says off", () => {
    vi.stubEnv("GEMINI_SPLIT", "");
    expect(splitEnabled()).toBe(true);
    for (const off of ["off", "0", "false", "NO"]) {
      vi.stubEnv("GEMINI_SPLIT", off);
      expect(splitEnabled()).toBe(false);
    }
  });
});

describe("generationPlan", () => {
  it("one call when not splitting, the Mode's split calls when splitting", () => {
    expect(generationPlan(dive).requests).toEqual([dive.request]);
    expect(generationPlan(dive, { split: true }).requests).toEqual(dive.split);
    expect(generationPlan(dive, { split: true }).select).toBeNull();
  });

  it("overgenerating uses the overgenerate request, split or not, and its selection", () => {
    expect(generationPlan(dive, { overgenerate: true }).requests).toEqual([dive.overgenerate!.request]);
    const plan = generationPlan(dive, { overgenerate: true, split: true });
    expect(plan.requests).toEqual(dive.overgenerate!.split);
    expect(plan.select).toBe(dive.overgenerate!.select);
  });

  it("a Mode without split hooks keeps its one call", () => {
    const leap = generatorFor("leap")!;
    expect(generationPlan(leap, { split: true, overgenerate: true }).requests).toEqual([leap.request]);
  });
});

describe("Dive's split calls", () => {
  const kinds = (r: GenerationRequest) =>
    (r.responseSchema as { properties: { prompts: { items: { properties: { kind: { enum: string[] } } } } } }).properties.prompts.items.properties.kind.enum;

  it("one writes only Open Prompts, the other every other kind", () => {
    const [open, other] = diveSplitRequest;
    expect(kinds(open)).toEqual(["open"]);
    expect(kinds(other)).toEqual(["cloze", "definition_to_term", "ordered_recall", "odd_one_out"]);
    expect(open.systemInstruction).toMatch(/write 8-10 Prompts, all of them "open"/);
    expect(other.systemInstruction).toMatch(/write no "open" Prompts here/);
    expect(open.contents("deck", [{ pageNumber: 1, contentMd: "x" }])).toMatch(/Write 8-10 "open" Prompts/);
  });

  it("both keep the rest of the instructions and see every page", () => {
    const pages = [{ pageNumber: 1, contentMd: "one" }, { pageNumber: 2, contentMd: "two" }];
    for (const r of diveSplitRequest) {
      expect(r.systemInstruction).toMatch(/GROUNDING/);
      expect(r.systemInstruction).toMatch(/BAD → GOOD/);
      expect(r.contents("deck", pages)).toMatch(/=== Page 1 ===\none\n\n=== Page 2 ===\ntwo/);
    }
  });

  it("the single call's instructions are unchanged", () => {
    expect(diveRequest.systemInstruction).toMatch(/PROMPT KINDS \(write 15-20 Prompts in total, at least half of them "open", and include some of every kind the material supports\)/);
  });
});

describe("joinResponses", () => {
  it("concatenates every response's prompts in order and skips malformed responses", () => {
    expect(joinResponses([{ prompts: [1, 2] }, null, { prompts: "no" }, { other: 1 }, { prompts: [3] }])).toEqual({ prompts: [1, 2, 3] });
  });
});

describe("generateSplit", () => {
  it("passes a single request's response through untouched", async () => {
    const response = { anything: true };
    expect(await generateSplit([req("a")], async () => ({ response }))).toEqual({ response, parts: [{ response }], failed: [] });
  });

  it("sends the calls in parallel and joins their Prompts", async () => {
    let inFlight = 0;
    let most = 0;
    const out = await generateSplit([req("a"), req("b")], async (r) => {
      most = Math.max(most, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return { response: { prompts: [r.systemInstruction] } };
    });
    expect(most).toBe(2);
    expect(out.response).toEqual({ prompts: ["a", "b"] });
    expect(out.failed).toEqual([]);
  });

  it("keeps the other calls' Prompts when one fails", async () => {
    const boom = new Error("503");
    const out = await generateSplit([req("a"), req("b")], async (r) => {
      if (r.systemInstruction === "a") throw boom;
      return { response: { prompts: ["b"] } };
    });
    expect(out.response).toEqual({ prompts: ["b"] });
    expect(out.failed).toEqual([boom]);
  });

  it("throws the first error when every call fails", async () => {
    await expect(generateSplit([req("a"), req("b")], async (r) => Promise.reject(new Error(r.systemInstruction)))).rejects.toThrow("a");
  });
});
