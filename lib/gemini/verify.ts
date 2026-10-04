// The verification call (F16): one Gemini call per Source Document after the Mode's checks,
// judging each Answer against its page and each Prompt for clarity and duplicates. The
// verdicts are applied in lib/games/verify.ts. Spec: docs/architecture/game-generation-pipeline.md
// § Verification pass (F16).
//
// Server only in the app, but no "server-only" import: scripts/generate-eval.ts runs it with Node.

import { defaultModels, generateDocumentPrompts } from "../gemini.ts";
import type { VerifyCall, VerifyInput } from "../games/verify.ts";
import type { GenerationRequest } from "../modes/generation.ts";

export const VERIFY_TEMPERATURE = 0;
/** Per attempt. Verification is optional, so it gets less patience than generation. */
const VERIFY_TIMEOUT_MS = 120_000;

export const VERIFY_SYSTEM_INSTRUCTION = `You check questions for a study game. Another model wrote them from a student's own course file; code already confirmed that every answer is mentioned on the page it cites. Your job is to catch what that misses: answers that are mentioned but wrong, unclear questions, and repeats.

You get the cited pages ("=== Page N ===") and a JSON list of questions. Each question has an id, a kind, its text (plus options or items for some kinds), and its answers, each with an id, the page it cites and a quote from that page (null if none was found).

FOR EVERY ANSWER, "supports": true or false
- true when the cited page (the quote, or the rest of that page) shows the answer is a correct answer to the question as written.
- false when the page only mentions it without showing it fits, when it answers a different question, or when it is wrong for this question. Example: for "Name an algorithm that handles negative edge weights", Kruskal cited on a page about minimum spanning trees is false, even though the page names it.
- Judge only by the pages. Don't be pedantic about wording: a correct answer phrased differently from the page is still true. Common abbreviations and obvious paraphrases are fine.
- By kind:
  - open: one of several valid answers to "Name a …"-style questions. Judge each answer on its own.
  - cloze: the answer fills the blank correctly.
  - definition_to_term: the answer is the term the text defines.
  - ordered_recall: one answer "correct order": true if the items are in the correct order according to the page.
  - odd_one_out: the answer is the option marked as the odd one out: true only if it differs from the other three in the way the question asks and those three clearly belong together; false if a different option is the odd one out. Check every option against the pages.
  - multiple_choice: the answer is the option marked correct: true only if it is correct AND no other option is also correct.
  - true_false: the answer is "True" or "False": true if the statement has that truth value according to the page.
- Before "supports", write "reason": a few words on what the cited page says that decides it (e.g. "Kruskal builds MSTs, not shortest paths"). Read the page; don't assume.

FOR EVERY QUESTION
- "clear": false only if a student who knows the material couldn't tell what is asked: it's vague, asks for several different kinds of thing at once (e.g. "Name a sorting algorithm, a data structure, or a complexity class"), has two readings, depends on a figure or example that isn't in the text, or refers to "the slides", "the document", "the lecture" or "the example". Most questions are clear.
- "duplicate_of": the id of an EARLIER question in the list that asks for the same fact in other words (same answers in substance); otherwise "". Two questions on the same topic that ask different things are not duplicates.
- If unclear, give "reason": a few words.

Return one entry per question, with every answer id, in the order given.`;

export const VERIFY_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    prompts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          clear: { type: "boolean" },
          duplicate_of: { type: "string", description: 'The id of an earlier question it repeats, or "".' },
          reason: { type: "string", description: "Only when unclear: a few words." },
          answers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                reason: { type: "string", description: "A few words: what the cited page says that decides it." },
                supports: { type: "boolean" },
              },
              required: ["id", "reason", "supports"],
            },
          },
        },
        required: ["id", "clear", "duplicate_of", "answers"],
      },
    },
  },
  required: ["prompts"],
} as const;

/** The user turn: the cited pages, then the questions as JSON. */
export function verifyContents(title: string, input: VerifyInput): string {
  const pages = input.pages.map((p) => `=== Page ${p.pageNumber} ===\n${p.contentMd}`).join("\n\n");
  return `Document: ${title}\n\n${pages}\n\nQUESTIONS\n${JSON.stringify(input.questions, null, 1)}\n\nCheck every question and answer following your instructions.`;
}

/** On unless GEMINI_VERIFY is "off" (also "0" / "false"). */
export function verificationEnabled(): boolean {
  return !/^(off|0|false|no)$/i.test(process.env.GEMINI_VERIFY?.trim() ?? "");
}

/**
 * The verifier's models in order: GEMINI_VERIFY_MODEL, else GEMINI_FALLBACK_MODEL (the cheaper
 * flash-lite: on the eval decks it caught the planted errors, took 5-15 s and is rarely
 * overloaded), then the usual GEMINI_MODEL → GEMINI_FALLBACK_MODEL.
 */
export function verifyModels(): string[] {
  const preferred = process.env.GEMINI_VERIFY_MODEL?.trim() || process.env.GEMINI_FALLBACK_MODEL?.trim();
  return [...new Set([...(preferred ? [preferred] : []), ...defaultModels()])];
}

/** The real verifier: one Gemini call with the shared retries and fallback. Throws GeminiError. */
export const geminiVerifyCall: VerifyCall = async (title, input) => {
  const request: GenerationRequest = {
    systemInstruction: VERIFY_SYSTEM_INSTRUCTION,
    responseSchema: VERIFY_RESPONSE_SCHEMA,
    temperature: VERIFY_TEMPERATURE,
    contents: () => verifyContents(title, input),
  };
  return generateDocumentPrompts(title, input.pages, request, { models: verifyModels(), timeoutMs: VERIFY_TIMEOUT_MS });
};
