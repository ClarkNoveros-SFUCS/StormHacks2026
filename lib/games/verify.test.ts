import { describe, expect, it, vi } from "vitest";
import fixture from "@/db/seed/graph-algorithms.json";
import modesFixture from "@/db/seed/graph-algorithms-modes.json";
import { validateBlitz } from "@/lib/modes/blitz/generate";
import { validateDocument, type DocumentPage } from "./validate";
import { applyVerdicts, verificationInput, verifyDocument, type VerifyCall, type VerifyInput } from "./verify";

const pages: DocumentPage[] = fixture.document.pages.map((p) => ({ pageNumber: p.page_number, contentMd: p.content_md }));
// The seed deck's 12 checked Prompts: 0 "Name a graph algorithm" (13 Answers), 1 MST (4), 2 shortest path (4),
// 3-5 cloze, 6-7 definition_to_term, 8-9 ordered_recall, 10-11 odd_one_out
const prompts = validateDocument({ prompts: fixture.game.prompts }, pages).prompts;

type AnswerVerdict = { id: string; supports: boolean; reason?: string };
type PromptVerdict = { id: string; clear: boolean; duplicate_of: string; reason?: string; answers: AnswerVerdict[] };

/** A verifier that approves everything, with per-Prompt overrides by index. */
function verdicts(input: VerifyInput, edit: (v: PromptVerdict, i: number) => void = () => {}) {
  return {
    prompts: input.questions.map((q, i) => {
      const v: PromptVerdict = { id: q.id, clear: true, duplicate_of: "", answers: q.answers.map((a) => ({ id: a.id, supports: true })) };
      edit(v, i);
      return v;
    }),
  };
}
const approveAll = verdicts(verificationInput(prompts, pages));
const reject = (v: PromptVerdict, ...answerIdx: number[]) => answerIdx.forEach((j) => (v.answers[j].supports = false));
const fakeCall = (edit?: (v: PromptVerdict, i: number) => void): VerifyCall => async (_title, input) => ({ response: verdicts(input, edit), model: "fake" });

describe("verificationInput", () => {
  it("numbers Prompts and Answers in order and sends only the cited pages", () => {
    const input = verificationInput(prompts, pages);
    expect(input.questions.map((q) => q.id)).toEqual(prompts.map((_, i) => `P${i + 1}`));
    expect(input.questions[1]).toMatchObject({ kind: "open", text: "Name a minimum spanning tree algorithm" });
    expect(input.questions[1].answers.map((a) => a.id)).toEqual(["P2.A1", "P2.A2", "P2.A3", "P2.A4"]);
    expect(input.questions[1].answers[0]).toMatchObject({ answer: prompts[1].answers[0].canonical, page: prompts[1].answers[0].evidencePage });
    expect(input.questions[8].items).toEqual(prompts[8].items);
    expect(input.questions[10].options).toEqual(prompts[10].options);
    const cited = new Set(prompts.flatMap((p) => [p.evidencePage, ...p.answers.map((a) => a.evidencePage)]).filter((n) => n !== null));
    expect(input.pages.map((p) => p.pageNumber).sort((a, b) => a - b)).toEqual([...cited].sort((a, b) => a - b));
  });
});

describe("applyVerdicts", () => {
  it("keeps everything unchanged when every verdict approves", () => {
    const out = applyVerdicts(prompts, approveAll);
    expect(out.prompts).toEqual(prompts);
    expect(out).toMatchObject({ dropped: [], answersRemoved: 0, promptsRemoved: 0, unverified: 0 });
  });

  it("drops unsupported Open Answers, then reassigns Tiers and rarity ranks to the rest", () => {
    const input = verdicts(verificationInput(prompts, pages), (v, i) => i === 0 && reject(v, 1, 12));
    const out = applyVerdicts(prompts, input);
    const graph = out.prompts[0];
    expect(graph.answers.map((a) => a.canonical)).toEqual(prompts[0].answers.filter((_, j) => j !== 1 && j !== 12).map((a) => a.canonical));
    // 11 Answers: common 3, solid 4, deep 3, rare 1 (game-generation-pipeline.md § Tier assignment)
    expect(graph.answers.map((a) => a.tier)).toEqual([...Array(3).fill("common"), ...Array(4).fill("solid"), ...Array(3).fill("deep"), "rare"]);
    expect(graph.answers.map((a) => a.rarityRank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(out.answersRemoved).toBe(2);
    expect(out.promptsRemoved).toBe(0);
    expect(out.dropped).toEqual([
      expect.objectContaining({ what: `answer "${prompts[0].answers[1].canonical}"`, reason: expect.stringMatching(/^verify: not supported/) }),
      expect.objectContaining({ what: `answer "${prompts[0].answers[12].canonical}"` }),
    ]);
  });

  it("re-runs check 4: an Open Prompt left with fewer than 4 supported Answers is dropped", () => {
    const input = verdicts(verificationInput(prompts, pages), (v, i) => {
      if (i === 1) {
        reject(v, 3);
        v.answers[3].reason = "builds MSTs, not shortest paths";
      }
    });
    const out = applyVerdicts(prompts, input);
    expect(out.prompts.map((p) => p.text)).not.toContain(prompts[1].text);
    expect(out.promptsRemoved).toBe(1);
    expect(out.answersRemoved).toBe(1);
    expect(out.dropped.map((d) => d.reason)).toEqual([
      "verify: not supported by its page (builds MSTs, not shortest paths)",
      "verify: only 3 supported Answers (need 4)",
    ]);
  });

  it("drops a single-answer Prompt whose Answer isn't supported", () => {
    const input = verdicts(verificationInput(prompts, pages), (v, i) => (i === 3 || i === 8 || i === 10) && reject(v, 0));
    const out = applyVerdicts(prompts, input);
    expect(out.prompts).toHaveLength(prompts.length - 3);
    expect(out.prompts.map((p) => p.text)).not.toContain(prompts[8].text);
    expect(out).toMatchObject({ answersRemoved: 3, promptsRemoved: 3 });
    expect(out.dropped[0]).toMatchObject({ what: "prompt", reason: expect.stringMatching(/^verify: its Answer ".+" isn't supported$/) });
  });

  it("drops unclear Prompts and duplicates of an earlier kept Prompt", () => {
    const input = verdicts(verificationInput(prompts, pages), (v, i) => {
      if (i === 4) Object.assign(v, { clear: false, reason: "two readings" });
      if (i === 7) v.duplicate_of = "P7"; // a kept earlier Prompt → dropped
      if (i === 6) v.duplicate_of = "P5"; // P5 was dropped as unclear → kept
      if (i === 9) v.duplicate_of = "P12"; // a later Prompt → ignored
      if (i === 11) v.duplicate_of = "P12"; // itself → ignored
    });
    const out = applyVerdicts(prompts, input);
    expect(out.prompts.map((p) => p.text)).toEqual(prompts.filter((_, i) => i !== 4 && i !== 7).map((p) => p.text));
    expect(out.dropped.map((d) => d.reason)).toEqual([
      "verify: unclear Prompt (two readings)",
      `verify: same as an earlier Prompt ("${prompts[6].text.slice(0, 50)}")`,
    ]);
    expect(out).toMatchObject({ answersRemoved: 0, promptsRemoved: 2 });
  });

  it("keeps Prompts and Answers that have no usable verdict", () => {
    const input = verdicts(verificationInput(prompts, pages));
    input.prompts.splice(2, 1); // no verdict for P3
    (input.prompts[0] as unknown as { clear: string }).clear = "yes"; // malformed verdict for P1
    input.prompts[1].answers = []; // no Answer verdicts for P2
    const out = applyVerdicts(prompts, input);
    expect(out.prompts).toEqual(prompts);
    expect(out.unverified).toBe(2);
  });

  it("throws on a response that isn't { prompts: [...] }", () => {
    expect(() => applyVerdicts(prompts, { verdicts: [] })).toThrow();
    expect(() => applyVerdicts(prompts, null)).toThrow();
  });

  it("checks other Modes' kinds too: a true/false statement with the wrong truth value is dropped", () => {
    const blitz = modesFixture.games.find((g) => g.mode === "blitz")!;
    const statements = validateBlitz({ prompts: blitz.prompts }, pages).prompts;
    const input = verdicts(verificationInput(statements, pages), (v, i) => i === 0 && reject(v, 0));
    expect(verificationInput(statements, pages).questions[0].answers[0].answer).toMatch(/^(True|False)$/);
    const out = applyVerdicts(statements, input);
    expect(out.prompts).toEqual(statements.slice(1));
    expect(out.prompts[0].isTrue).toBe(statements[1].isTrue); // other fields carried through
  });
});

describe("verifyDocument", () => {
  it("applies the verifier's verdicts and reports what it removed", async () => {
    const out = await verifyDocument("deck.pptx", pages, prompts, fakeCall((v, i) => i === 3 && reject(v, 0)));
    expect(out).toMatchObject({ status: "verified", error: null, model: "fake", promptsRemoved: 1, answersRemoved: 1 });
    expect(out.prompts).toHaveLength(prompts.length - 1);
  });

  it("keeps every Prompt unverified when the call fails, and never throws", async () => {
    const call = vi.fn<VerifyCall>(async () => {
      throw new Error("Gemini request failed 503", { cause: new Error("high demand") });
    });
    const out = await verifyDocument("deck.pptx", pages, prompts, call);
    expect(out).toMatchObject({ status: "failed", error: "Gemini request failed 503 (high demand)", promptsRemoved: 0, unverified: prompts.length });
    expect(out.prompts).toBe(prompts);
  });

  it("keeps every Prompt unverified when the response is malformed", async () => {
    const out = await verifyDocument("deck.pptx", pages, prompts, async () => ({ response: "not json" }));
    expect(out.status).toBe("failed");
    expect(out.prompts).toBe(prompts);
  });

  it("skips the call when there are no Prompts", async () => {
    const call = vi.fn<VerifyCall>();
    expect(await verifyDocument("deck.pptx", pages, [], call)).toMatchObject({ status: "skipped", prompts: [] });
    expect(call).not.toHaveBeenCalled();
  });
});
