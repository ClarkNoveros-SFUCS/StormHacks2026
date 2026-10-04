import { describe, expect, it } from "vitest";
import { cleanNotes, MAX_NOTES } from "./notes";

describe("cleanNotes", () => {
  it("unwraps a code fence around the whole answer", () => {
    expect(cleanNotes("```markdown\n## Title\n\n- a\n```")).toBe("## Title\n\n- a");
  });

  it("keeps inner code spans and comparison signs", () => {
    expect(cleanNotes("Use `P(A|B)` when a<b and c>d")).toBe("Use `P(A|B)` when a<b and c>d");
  });

  it("caps the length", () => {
    expect(cleanNotes("x".repeat(MAX_NOTES + 50))).toHaveLength(MAX_NOTES);
  });
});
