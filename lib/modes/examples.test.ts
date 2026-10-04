// The example Prompts embedded in each Mode's generator instructions (F15) must pass that
// Mode's own checks on the seed pages, or they'd teach Gemini something the checks drop.
import { describe, expect, it } from "vitest";
import fixture from "@/db/seed/graph-algorithms.json";
import type { DocumentPage } from "@/lib/games/validate";
import { generatorFor } from "./generators";

const seedPages: DocumentPage[] = fixture.document.pages.map((p) => ({ pageNumber: p.page_number, contentMd: p.content_md }));

/** The one-line JSON examples in an instruction (lines starting with {"kind":). */
const examplesIn = (instruction: string) =>
  instruction
    .split("\n")
    .filter((line) => line.startsWith('{"kind":'))
    .map((line) => JSON.parse(line) as unknown);

describe.each(["dive", "leap", "pairs", "blitz"])("%s generator examples", (mode) => {
  const generator = generatorFor(mode)!;
  const examples = examplesIn(generator.request.systemInstruction);

  it("has at least one example and labels it as format only", () => {
    expect(examples.length).toBeGreaterThan(0);
    expect(generator.request.systemInstruction).toMatch(/not content to reuse/);
  });

  it("passes the Mode's own checks on the seed pages", () => {
    const result = generator.validate({ prompts: examples }, seedPages);
    expect(result.dropped).toEqual([]);
    expect(result.quotesCleared).toBe(0);
    expect(result.prompts).toHaveLength(examples.length);
  });
});
