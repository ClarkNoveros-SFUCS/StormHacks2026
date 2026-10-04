// Pairs' generator: definition_to_term Prompts (a short definition ↔ its term), and more of
// them than Dive asks for, since a Run uses 12 distinct terms. Dive's checks for the kind are
// reused (Evidence names the term, alias hygiene, quotes); Pairs adds card-sized definitions,
// no term in its own definition, and one Prompt per term across the Game.
// Spec: game-generation-pipeline.md § Pairs. Pure: relative .ts imports only.

import { validateDocument } from "../../games/validate.ts";
import { normalize } from "../../matching/normalize.ts";
import { TIERS } from "../../scoring/tiers.ts";
import {
  containsWords, notEnoughFor, pagesAsText, type Drop, type GeneratedPrompt, type ModeGenerator, type Tagged,
} from "../generation.ts";
import { MATH_NOTATION_RULE } from "../../gemini/math-notation.ts";
import { MODES } from "../index.ts";

const MIN = MODES.pairs.minPrompts;
/** A definition has to fit on a card. */
export const MAX_DEFINITION = 200;
const MAX_TERM_WORDS = 6;

export const PAIRS_SYSTEM_INSTRUCTION = `You write term-definition pairs for a matching game. A student uploaded their own course file; the game shows 6 terms and 6 definitions and the student matches them against the clock.

GROUNDING
- Use only terms and facts stated in the pages you are given. Never add outside knowledge.
- Each pair's Answer is the term. It cites the page the term appears on (evidence_page, the number from its "=== Page N ===" marker) and evidence_quote: a short passage copied character for character from that page, at most 200 characters, that shows what the term means. Copy it exactly.
- The term (its canonical name or one of its aliases) must appear on the cited page.
- Skip pages with no study content (title slides, agendas, outlines, references). Course administration (exams, grading, deadlines, policies) is never a pair.

PAIRS (write 16-24, each about a DIFFERENT term)
- "kind": always "definition_to_term".
- "text": the definition, in your own words, at most 25 words (under 180 characters), precise enough that only this term fits it among the others. Never use the term, its aliases or any word from them in the definition.
- "answers": exactly 1 Answer: "canonical" is the term (1-4 words), "aliases" its other accepted names (abbreviations, expansions), "exact_only" true for acronyms of 4 letters or fewer.
- Pick the key terms of the material: concepts, algorithms, data structures, properties, named methods. Prefer terms a student must know.
- "tier": how obscure the term is for a student in this course: "common", "solid", "deep" or "rare".
- "explanation": one sentence shown after the game, adding a detail about the term.
- "hint": leave empty.
- Write in the language of the document.

EXAMPLE (format and quality only, from a lecture on graph algorithms; not content to reuse)
{"kind":"definition_to_term","text":"A structure that tracks which vertices already share a component, so an edge that would close a cycle can be skipped.","answers":[{"canonical":"union-find","aliases":["disjoint set"],"exact_only":false,"evidence_page":9,"evidence_quote":"Keeps track of which vertices are already in the same component."}],"tier":"solid","explanation":"With union by rank and path compression, each operation is almost O(1).","hint":""}
BAD: a definition that uses the term or a word from it ("A set structure that is disjoint..."), or a term that is a sentence. GOOD: as above, a short named term and a definition that fits only it.${MATH_NOTATION_RULE}`;

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

export const PAIRS_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    prompts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["definition_to_term"] },
          text: { type: "string", description: "The definition (at most 25 words); never contains the term." },
          answers: { type: "array", items: answerSchema, description: "Exactly 1: the term." },
          tier: { type: "string", enum: [...TIERS] },
          hint: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["kind", "text", "answers", "tier", "explanation"],
      },
    },
  },
  required: ["prompts"],
} as const;

/** Dive's checks for definition_to_term, then Pairs' card checks. Never throws on bad content. */
export function validatePairs(response: unknown, pages: { pageNumber: number; contentMd: string }[]) {
  const result = validateDocument(response, pages);
  const dropped: Drop[] = [...result.dropped];
  const prompts: GeneratedPrompt[] = [];
  for (const p of result.prompts) {
    const drop = (reason: string) => dropped.push({ prompt: p.text.slice(0, 80), what: "prompt", reason });
    if (p.kind !== "definition_to_term") { drop(`Pairs only uses definition_to_term, not ${p.kind}`); continue; }
    if (p.text.length > MAX_DEFINITION) { drop(`definition is over ${MAX_DEFINITION} characters`); continue; }
    const [term] = p.answers;
    if (term.canonical.split(/\s+/).length > MAX_TERM_WORDS) { drop(`term is over ${MAX_TERM_WORDS} words`); continue; }
    const definition = normalize(p.text);
    if (term.keys.some((k) => containsWords(definition, k))) { drop("the definition names its own term"); continue; }
    prompts.push({ ...p, hint: null, isTrue: null });
  }
  return { prompts, dropped, quotesCleared: result.quotesCleared };
}

/** One Prompt per term across the Game (a Board can't show two identical terms). */
export function dedupeTerms<D>(kept: Tagged<D>[]) {
  const seen = new Set<string>();
  const dropped: Drop[] = [];
  const out = kept.filter(({ prompt }) => {
    const key = normalize(prompt.answers[0].canonical);
    if (seen.has(key)) {
      dropped.push({ prompt: prompt.text.slice(0, 80), what: "prompt", reason: `term "${prompt.answers[0].canonical}" repeats another pair` });
      return false;
    }
    seen.add(key);
    return true;
  });
  return { kept: out, dropped };
}

export const pairsGenerator: ModeGenerator = {
  request: {
    systemInstruction: PAIRS_SYSTEM_INSTRUCTION,
    responseSchema: PAIRS_RESPONSE_SCHEMA,
    temperature: 0.4,
    contents: (title, pages) => `${pagesAsText(title, pages)}\n\nWrite 16-24 term-definition pairs for this document following your instructions.`,
  },
  minPrompts: MIN,
  validate: validatePairs,
  finalize: dedupeTerms,
  notEnough: notEnoughFor("Pairs", "distinct term-definition pairs", MIN),
};
