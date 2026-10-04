import { describe, expect, it } from "vitest";
import fixture from "@/db/seed/graph-algorithms.json";
import { KINDS, validateDocument, type DocumentPage } from "@/lib/games/validate";
import { normalize } from "@/lib/matching/normalize";
import { GAME_PROMPT_EXAMPLES, GAME_SYSTEM_INSTRUCTION } from "./game-prompt";

const seedPages: DocumentPage[] = fixture.document.pages.map((p) => ({ pageNumber: p.page_number, contentMd: p.content_md }));

describe("GAME_PROMPT_EXAMPLES", () => {
  const result = validateDocument({ prompts: GAME_PROMPT_EXAMPLES }, seedPages);

  it("pass every check on the seed pages: nothing dropped, every quote found, every Hint kept", () => {
    expect(result.dropped).toEqual([]);
    expect(result.quotesCleared).toBe(0);
    expect(result.prompts).toHaveLength(GAME_PROMPT_EXAMPLES.length);
    for (const p of result.prompts) {
      if (p.kind !== "open") expect(p.hint, p.text).not.toBeNull();
      for (const a of p.answers) if (p.kind === "open" || p.kind === "cloze") expect(a.evidenceQuote, a.canonical).not.toBeNull();
    }
  });

  it("cover open, cloze, ordered_recall and odd_one_out", () => {
    expect(new Set(GAME_PROMPT_EXAMPLES.map((e) => e.kind))).toEqual(new Set(["open", "cloze", "ordered_recall", "odd_one_out"]));
    for (const e of GAME_PROMPT_EXAMPLES) expect(KINDS).toContain(e.kind);
  });

  it("keep Answers short names, never symbols", () => {
    for (const e of GAME_PROMPT_EXAMPLES) {
      for (const a of e.answers) {
        expect(a.canonical.split(/\s+/).length, a.canonical).toBeLessThanOrEqual(4);
        expect(normalize(a.canonical), a.canonical).not.toBe("");
      }
    }
  });

  it("are embedded in the instructions, labelled as format examples", () => {
    for (const e of GAME_PROMPT_EXAMPLES) expect(GAME_SYSTEM_INSTRUCTION).toContain(JSON.stringify(e));
    expect(GAME_SYSTEM_INSTRUCTION).toMatch(/not content to reuse/);
    expect(GAME_SYSTEM_INSTRUCTION).toMatch(/BAD → GOOD/);
  });
});
