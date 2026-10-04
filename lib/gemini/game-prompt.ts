// Dive's generator prompt and response schema: what Gemini is told for one Source Document.
// Spec: docs/architecture/game-generation-pipeline.md § Gemini call. Code re-checks every
// rule it can (lib/games/validate.ts), so these instructions aim for fewer drops, not safety.
// Pure: relative imports only, so scripts/generate-check.ts can load it with Node.

import { KINDS } from "../games/validate.ts";
import { TIERS } from "../scoring/tiers.ts";

export const GAME_PROMPT_TEMPERATURE = 0.4;

export const GAME_SYSTEM_INSTRUCTION = `You write questions for a timed study game. A student uploaded their own course file; you turn it into Prompts they answer by typing a few words within 25 seconds.

GROUNDING
- Use only facts stated in the pages you are given. Never add outside knowledge, even if it's true.
- Every Answer cites the page it appears on (evidence_page, the number from its "=== Page N ===" marker) and evidence_quote: a short passage copied character for character from that page, at most 200 characters. Copy it exactly; don't fix typos, reword, or join text from different places.
- The quote must show that this Answer fits this Prompt, not just that the Answer is mentioned. For "Name an algorithm that handles negative edge weights", the quote must say the algorithm handles negative edge weights. If no passage shows that, leave the Answer out.
- The Answer itself (its canonical name or one of its aliases) must appear on the cited page.
- Skip pages with no study content (title slides, agendas, outlines, references, "questions?").

PROMPT TEXT
- Each Prompt stands on its own, like a quiz question. Never mention pages, slides, "the document", "the lecture", "the course", "the summary" or "according to".
- Ask about the subject, not about the document: "Name a minimum spanning tree algorithm", never "Name a topic listed this week".

PROMPT KINDS (write 15-20 Prompts in total, at least half of them "open", and include some of every kind the material supports)
- "open": a category with many valid Answers, e.g. "Name a graph algorithm", "Give an example of a greedy algorithm", "Name a property of a heap". List 4-15 Answers in "answers", ordered from the most obvious to the most obscure for a student in this course. That order is the only rarity signal; never output scores or points. Only make an open Prompt when the pages support at least 4 distinct Answers that each truly fit it. Fields: kind, text, answers.
- "cloze": a statement from the material with one key term replaced by "______". Exactly 1 Answer. Fields: kind, text, answers, tier, hint, explanation.
- "definition_to_term": a definition or description in your own words; the Answer is the term. Exactly 1 Answer. Don't put the term in the text. Fields: kind, text, answers, tier, hint, explanation.
- "ordered_recall": "Put the steps of X in order" (or stages, phases, events). "items" holds 3-6 short steps in the correct order. evidence_page is the page that lists them. Fields: kind, text, items, evidence_page, tier, hint, explanation.
- "odd_one_out": "options" holds exactly 4 short, distinct options; "correct_option" is the one that doesn't belong, copied exactly from "options". The text says how three of them belong together without naming them (e.g. "Which one solves a different problem from the other three?"). evidence_page is the page that names the correct option. Fields: kind, text, options, correct_option, evidence_page, tier, hint, explanation.

EVERY KIND EXCEPT "open" MUST HAVE tier, hint AND explanation
- For "open", set tier to "common" and leave hint and explanation empty; they're ignored.
- "tier": how obscure the fact is for a student in this course: "common" (core idea everyone knows), "solid" (needs real study), "deep" (a detail), "rare" (easy to miss).
- "hint": a short clue that helps without giving it away. Never include the Answer, any alias, any word from them (including plurals and other forms), or an obvious fragment. For odd_one_out, never name the correct option. For ordered_recall, never list or paraphrase the steps; point at the first one or the idea that orders them.
- "explanation": one sentence shown after the Prompt, saying why the Answer is right.

ANSWERS ("open", "cloze", "definition_to_term")
- "canonical": the name the game shows. Keep it short (1-4 words).
- "aliases": other accepted names: abbreviations, expansions, alternative spellings and names ("BFS" / "breadth-first search", "Dijkstra" / "Dijkstra's algorithm"). Not typos; typos are handled by the game. An alias must never also fit a different Answer in the same Prompt.
- "exact_only": true for short acronyms (4 letters or fewer) and for any Answer within a couple of letters of another Answer in the same Prompt (BFS / DFS). Otherwise false.

QUALITY
- Each Prompt must be answerable in 25 seconds by typing a few words, and have a clear right answer.
- Don't repeat a Prompt, and don't ask the same fact twice in different kinds.
- Write the Prompt text in the language of the document.`;

/** The document's pages as Gemini sees them. */
export function gamePromptContents(title: string, pages: { pageNumber: number; contentMd: string }[]): string {
  const body = pages.map((p) => `=== Page ${p.pageNumber} ===\n${p.contentMd}`).join("\n\n");
  return `Document: ${title}\n\n${body}\n\nWrite 15-20 Prompts for this document following your instructions.`;
}

// JSON Schema for structured output (responseJsonSchema). Flat, with optional fields per
// kind: more reliable than oneOf. validate.ts's zod schema is the real gate.
const answerSchema = {
  type: "object",
  properties: {
    canonical: { type: "string" },
    aliases: { type: "array", items: { type: "string" } },
    exact_only: { type: "boolean" },
    evidence_page: { type: "integer" },
    evidence_quote: { type: "string" },
  },
  required: ["canonical", "aliases", "exact_only", "evidence_page", "evidence_quote"],
} as const;

export const GAME_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    prompts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...KINDS] },
          text: { type: "string" },
          answers: { type: "array", items: answerSchema, description: "open: 4-15, most obvious first. cloze, definition_to_term: exactly 1. Empty for ordered_recall, odd_one_out." },
          tier: { type: "string", enum: [...TIERS], description: "How obscure the fact is. Ignored for open." },
          hint: { type: "string", description: "A clue that never contains the Answer. Empty for open." },
          explanation: { type: "string", description: "One sentence on why the Answer is right. Empty for open." },
          items: { type: "array", items: { type: "string" }, description: "ordered_recall: 3-6 steps in the correct order." },
          options: { type: "array", items: { type: "string" }, description: "odd_one_out: exactly 4." },
          correct_option: { type: "string", description: "odd_one_out: copied exactly from options." },
          evidence_page: { type: "integer", description: "ordered_recall, odd_one_out: the page that supports it." },
        },
        // Gemini tends to leave optional fields out, even ones the instructions demand, and
        // the Prompt is then dropped. So the fields most kinds need are required; a kind that
        // doesn't use one gets an empty value, which validate.ts ignores.
        required: ["kind", "text", "answers", "tier", "hint", "explanation"],
      },
    },
  },
  required: ["prompts"],
} as const;
