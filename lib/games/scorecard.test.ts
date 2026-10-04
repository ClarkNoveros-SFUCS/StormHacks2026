import { describe, expect, it } from "vitest";
import fixture from "@/db/seed/graph-algorithms.json";
import { estimateCostUsd } from "@/lib/gemini/pricing";
import { dropCode, formatScorecardTable, scoreDocument, unwrapSaved } from "./scorecard";
import type { DocumentPage } from "./validate";

const seedPages: DocumentPage[] = fixture.document.pages.map((p) => ({ pageNumber: p.page_number, contentMd: p.content_md }));

const PAGES: DocumentPage[] = [
  { pageNumber: 1, contentMd: "BFS uses a queue. DFS uses a stack." },
  { pageNumber: 2, contentMd: "Dijkstra finds shortest paths. Prim and Kruskal build a minimum spanning tree." },
];
const ans = (canonical: string, page: number, quote = "") => ({ canonical, aliases: [], exact_only: false, evidence_page: page, evidence_quote: quote });
const open = (text: string, answers: unknown[]) => ({ kind: "open", text, answers });
const cloze = (text: string, answer: string, hint: string) => ({ kind: "cloze", text, tier: "solid", hint, answers: [ans(answer, 1, "BFS uses a queue.")] });

describe("scoreDocument", () => {
  it("scores the seed fixture as known-good: everything kept, all five kinds, every quote verified", () => {
    const card = scoreDocument({ prompts: fixture.game.prompts }, seedPages);
    expect(card).toMatchObject({
      returned: 12,
      kept: 12,
      kindsCovered: 5,
      openPrompts: 3,
      hintsRemoved: 0,
      promptsDropped: 0,
      answersDropped: 0,
      dropsByReason: {},
      enoughForGame: true,
    });
    expect(card.kinds).toEqual({ open: 3, cloze: 3, definition_to_term: 2, ordered_recall: 2, odd_one_out: 2 });
    expect(card.answersPerOpen).toBeCloseTo((13 + 4 + 4) / 3);
    expect(card.quotesVerified).toBe(card.quotedAnswers);
    expect(card.hintsGiven).toBe(7); // 3 cloze + 2 definition_to_term + 2 odd_one_out
  });

  it("counts drops by reason, removed Hints and unverified quotes", () => {
    const card = scoreDocument(
      {
        prompts: [
          open("Name a graph algorithm", [ans("BFS", 1, "BFS uses a queue."), ans("DFS", 1, "not on the page"), ans("Dijkstra", 2), ans("Prim", 2), ans("Floyd", 2), ans("Tarjan", 9)]),
          open("Name a traversal", [ans("BFS", 1), ans("DFS", 1), ans("A star", 1)]),
          cloze("BFS uses a ______.", "queue", "Like a queue at a shop"),
          cloze("BFS uses a ______.", "queue", "A line at a shop"),
          { kind: "riddle", text: "?" },
        ],
      },
      PAGES,
    );
    expect(card).toMatchObject({ returned: 5, kept: 2, openPrompts: 1, answersPerOpen: 4, promptsDropped: 3, answersDropped: 3, hintsGiven: 1, hintsRemoved: 1 });
    expect(card.dropsByReason).toEqual({ "not-on-page": 2, "missing-page": 1, "too-few-answers": 1, schema: 1, duplicate: 1 });
    expect([card.quotesVerified, card.quotedAnswers]).toEqual([2, 5]); // "BFS uses a queue." twice; the rest unquoted or wrong
    expect(card.enoughForGame).toBe(false);
  });

  it("treats a response without prompts as one dropped response", () => {
    const card = scoreDocument({ nope: true }, PAGES);
    expect(card).toMatchObject({ returned: 0, kept: 0, promptsDropped: 1, dropsByReason: { "bad-response": 1 } });
  });
});

describe("dropCode", () => {
  it.each([
    ["cites missing page 14", "missing-page"],
    ["page 3 doesn't mention it or an Alias", "not-on-page"],
    ["only 2 usable Answers (need 4)", "too-few-answers"],
    ["over the 15-Answer cap", "over-cap"],
    ["its name is another Answer's Alias", "alias-clash"],
    ["has 7 items (need 3-6)", "items"],
    ["no page mentions the correct option", "option-not-on-page"],
    ["correct_option isn't one of the options", "options"],
    ["single-answer Prompt has 2 Answers", "answer-count"],
    ["something new on page 12", "something new on page N"],
  ])("%s → %s", (reason, code) => expect(dropCode(reason)).toBe(code));
});

describe("unwrapSaved", () => {
  it("accepts a saved wrapper or a bare response", () => {
    const response = { prompts: [] };
    const saved = { deck: "d", createdAt: "", promptVersion: "x", run: { model: "m", seconds: 1, usage: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 }, costUsd: 0 }, response };
    expect(unwrapSaved(saved)).toEqual({ response, saved });
    expect(unwrapSaved(response)).toEqual({ response, saved: null });
  });
});

describe("formatScorecardTable", () => {
  it("prints one row per deck, a skipped deck's note and a total", () => {
    const card = scoreDocument({ prompts: fixture.game.prompts }, seedPages);
    const run = { model: "gemini-3.6-flash", seconds: 60, usage: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 }, costUsd: 0.05 };
    const table = formatScorecardTable([
      { deck: "a", pages: 12, run, card },
      { deck: "b", pages: 12, run, card },
      { deck: "c", pages: 0, run: null, card: null, note: "deck file missing" },
    ]).split("\n");
    expect(table).toHaveLength(6);
    expect(table[2]).toContain("| a | 12 | gemini-3.6-flash | 12 → 12 | 3/3/2/2/2 | 3 | 7.0 |");
    expect(table[4]).toContain("deck file missing");
    expect(table[5]).toMatch(/^\| \*\*Total\*\* \| 24 \|  \| 24 → 24 .* \| 120 \| 0\.100 \|$/);
  });
});

describe("verification pass in the scorecard (F16)", () => {
  // The verifier rejects one Answer of "Name a graph algorithm" (13 → 12) and the first cloze's only Answer
  const verdicts = {
    prompts: fixture.game.prompts.map((p, i) => ({
      id: `P${i + 1}`,
      clear: true,
      duplicate_of: "",
      answers: (p.answers ?? [{}]).map((_, j) => ({ id: `P${i + 1}.A${j + 1}`, supports: !(i === 0 && j === 0) && i !== 3 })),
    })),
  };

  it("scores what survives the pass and counts its removals apart from the code checks", () => {
    const card = scoreDocument({ prompts: fixture.game.prompts }, seedPages, verdicts);
    expect(card.kept).toBe(11);
    expect(card.verify).toMatchObject({ answersRemoved: 2, promptsRemoved: 1, unverified: 0 });
    expect(card.verify!.drops).toHaveLength(2);
    expect(card.promptsDropped).toBe(0);
    expect(card.drops).toEqual([]);
    expect(scoreDocument({ prompts: fixture.game.prompts }, seedPages).verify).toBeNull();
  });

  it("adds the verification columns only when a card has the pass", () => {
    const run = { model: "gemini-3.6-flash", seconds: 60, usage: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 }, costUsd: 0.05 };
    const verifyRun = { ...run, seconds: 20, costUsd: 0.01 };
    const plain = scoreDocument({ prompts: fixture.game.prompts }, seedPages);
    expect(formatScorecardTable([{ deck: "a", pages: 12, run, card: plain }])).not.toContain("Verify");
    const card = scoreDocument({ prompts: fixture.game.prompts }, seedPages, verdicts);
    const table = formatScorecardTable([
      { deck: "a", pages: 12, run, card, verifyRun },
      { deck: "b", pages: 12, run, card, verifyRun },
    ]).split("\n");
    expect(table[0]).toMatch(/\| s \| \$ \| Verify removed A \/ P \| Verify s \| Verify \$ \|$/);
    expect(table[2]).toMatch(/\| 12 → 11 .*\| 60 \| 0\.050 \| 2 \/ 1 \| 20 \| 0\.010 \|$/);
    expect(table[4]).toMatch(/\| 120 \| 0\.100 \| 4 \/ 2 \| 40 \| 0\.020 \|$/);
  });
});

describe("selection in the scorecard (F17)", () => {
  // The seed deck's 12 Prompts plus a reworded copy of "Name a graph algorithm" with the same Answers
  const response = { prompts: [...fixture.game.prompts, { ...fixture.game.prompts[0], text: "Give an example of an algorithm on graphs" }] };

  it("scores what selectPrompts keeps and reports what it removed", () => {
    const card = scoreDocument(response, seedPages, undefined, { select: true });
    expect(card.kept).toBe(12);
    expect(card.select).toMatchObject({ candidates: 13, removed: 1 });
    expect(card.select!.drops[0].reason).toMatch(/^select: near-duplicate/);
    expect(scoreDocument(response, seedPages).select).toBeNull();
  });

  it("adds a Selected column only when a card has selection", () => {
    const run = { model: "gemini-3.6-flash", seconds: 60, usage: { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 }, costUsd: 0.05 };
    expect(formatScorecardTable([{ deck: "a", pages: 12, run, card: scoreDocument(response, seedPages) }])).not.toContain("Selected");
    const card = scoreDocument(response, seedPages, undefined, { select: true });
    const table = formatScorecardTable([
      { deck: "a", pages: 12, run, card },
      { deck: "b", pages: 12, run, card },
    ]).split("\n");
    expect(table[0]).toMatch(/\| \$ \| Selected \|$/);
    expect(table[2]).toMatch(/\| 13 → 12 \|$/);
    expect(table[4]).toMatch(/\| 26 → 24 \|$/);
  });
});

describe("estimateCostUsd", () => {
  it("bills thinking as output and returns null for an unknown model", () => {
    expect(estimateCostUsd("gemini-3.6-flash", { inputTokens: 1e6, outputTokens: 5e5, thinkingTokens: 5e5 })).toBeCloseTo(0.75 + 3.75);
    expect(estimateCostUsd("nope", { inputTokens: 1, outputTokens: 1, thinkingTokens: 1 })).toBeNull();
  });
});
