// Dive's generator prompt and response schema: what Gemini is told for one Source Document.
// Spec: docs/architecture/game-generation-pipeline.md § Gemini call. Code re-checks every
// rule it can (lib/games/validate.ts), so these instructions aim for fewer drops, not safety.
// Pure: relative imports only, so scripts/generate-check.ts can load it with Node.

import { KINDS } from "../games/validate.ts";
import { TIERS } from "../scoring/tiers.ts";
import { MATH_NOTATION_RULE } from "./math-notation.ts";

export const GAME_PROMPT_TEMPERATURE = 0.4;

/**
 * Worked examples shown to Gemini (F15), one per kind except definition_to_term, taken from
 * the seed fixture (db/seed/graph-algorithms.json). Models copy examples more reliably than
 * they follow rules. game-prompt.test.ts checks that each one passes validateDocument on the
 * seed pages, so an example never teaches something the checks would drop.
 */
export const GAME_PROMPT_EXAMPLES = [
  {
    kind: "open",
    text: "Name a shortest-path algorithm",
    answers: [
      { canonical: "Dijkstra", aliases: ["Dijkstra's algorithm"], exact_only: false, evidence_page: 5, evidence_quote: "Finds shortest paths from one source in a graph with non-negative edge weights." },
      { canonical: "BFS", aliases: ["breadth-first search"], exact_only: true, evidence_page: 12, evidence_quote: "Unweighted shortest paths: BFS is enough." },
      { canonical: "Bellman-Ford", aliases: [], exact_only: false, evidence_page: 6, evidence_quote: "Finds shortest paths from one source, and works with negative edge weights." },
      { canonical: "Floyd-Warshall", aliases: [], exact_only: false, evidence_page: 7, evidence_quote: "Finds the shortest paths between every pair of vertices (all-pairs shortest paths)." },
    ],
    tier: "common",
    hint: "",
    explanation: "",
  },
  {
    kind: "cloze",
    text: "Kruskal uses ______ to check whether an edge would create a cycle.",
    answers: [
      { canonical: "union-find", aliases: ["disjoint set"], exact_only: false, evidence_page: 9, evidence_quote: "Kruskal uses union-find to check whether an edge would create a cycle." },
    ],
    tier: "solid",
    hint: "A structure that tracks which vertices already share a component.",
    explanation: "If both ends of an edge already share a component, adding the edge would close a cycle, and union-find answers that almost in O(1).",
  },
  {
    kind: "ordered_recall",
    text: "Put the steps of Dijkstra's algorithm in order.",
    items: ["Set the source distance to 0", "Pick the closest unvisited node", "Relax its outgoing edges", "Mark it visited and repeat"],
    evidence_page: 5,
    answers: [],
    tier: "solid",
    hint: "Before exploring anything, you need one distance you already know.",
    explanation: "Dijkstra starts from the source at distance 0, then repeatedly settles the closest unvisited node and relaxes its edges.",
  },
  {
    kind: "odd_one_out",
    text: "Which one solves a different problem from the other three?",
    options: ["Kruskal", "Prim", "Borůvka", "Dijkstra"],
    correct_option: "Dijkstra",
    evidence_page: 8,
    answers: [],
    tier: "common",
    hint: "Three of them build the same kind of tree.",
    explanation: "Kruskal, Prim and Borůvka build minimum spanning trees; Dijkstra computes shortest paths.",
  },
] as const;

const examples = GAME_PROMPT_EXAMPLES.map((e) => JSON.stringify(e)).join("\n");

/** How many Prompts per document Dive asks for, normally and when overgenerating (F17, GEMINI_OVERGENERATE). */
export const GAME_PROMPT_COUNT = "15-20";
export const GAME_OVERGENERATE_COUNT = "about 25";
// Asked for 25 with "at least half open", Gemini padded with single-answer kinds (F17 run 1), so say how many.
const GAME_OVERGENERATE_OPEN = "at least 12 of them";

/** Dive's instructions, asking for `count` Prompts per document, `open` of them Open Prompts. */
export const gameSystemInstruction = (count: string, open = "at least half of them") =>
  gameInstruction(`write ${count} Prompts in total, ${open} "open", and include some of every kind the material supports`);

/** Dive's instructions with `task` (which Prompts to write) in the PROMPT KINDS heading. */
const gameInstruction = (task: string) => `You write questions for a timed study game. A student uploaded their own course file; you turn it into Prompts they answer by typing a few words within 25 seconds.

GROUNDING
- Use only facts stated in the pages you are given. Never add outside knowledge, even if it's true.
- Every Answer cites the page it appears on (evidence_page, the number from its "=== Page N ===" marker) and evidence_quote: a short passage copied character for character from that page, at most 200 characters. Copy it exactly; don't fix typos, reword, or join text from different places.
- The quote must show that this Answer fits this Prompt, not just that the Answer is mentioned. For "Name an algorithm that handles negative edge weights", the quote must say the algorithm handles negative edge weights. If no passage shows that, leave the Answer out.
- The Answer itself (its canonical name or one of its aliases) must appear on the cited page.
- Skip pages with no study content (title slides, agendas, outlines, references, "questions?").
- Course administration is never a Prompt: exams, midterm rules, grading, deadlines, office hours, course policies, contact details.

PROMPT TEXT
- Each Prompt stands on its own, like a quiz question. Never mention pages, slides, "the document", "the lecture", "the course", "the summary" or "according to".
- Ask about the subject, not about the document: "Name a minimum spanning tree algorithm", never "Name a topic listed this week", "covered in the material", "mentioned in section 3" or "in this lecture".

PROMPT KINDS (${task})
- "open": a category with many valid Answers, e.g. "Name a graph algorithm", "Give an example of a greedy algorithm", "Name a property of a heap". List 4-15 Answers in "answers", ordered from the most obvious to the most obscure for a student in this course. That order is the only rarity signal; never output scores or points. Only make an open Prompt when the pages support at least 4 distinct Answers that each truly fit it. One category per Prompt: no "or" joining two categories. Fields: kind, text, answers.
- "cloze": a statement from the material with one key term replaced by "______". Exactly 1 Answer. Fields: kind, text, answers, tier, hint, explanation.
- "definition_to_term": a definition or description in your own words; the Answer is the term. Exactly 1 Answer. Don't put the term in the text. Fields: kind, text, answers, tier, hint, explanation.
- "ordered_recall": "Put the steps of X in order" (or stages, phases, events). "items" holds 3-6 short steps in the correct order. evidence_page is the page that lists them. Fields: kind, text, items, evidence_page, tier, hint, explanation.
- "odd_one_out": "options" holds exactly 4 short, distinct options; "correct_option" is the one that doesn't belong, copied exactly from "options". The text says how three of them belong together without naming them (e.g. "Which one solves a different problem from the other three?"). All four options are named in the pages; the odd one differs in what it is or does, never in whether the document mentions it. evidence_page is the page that names the correct option. Fields: kind, text, options, correct_option, evidence_page, tier, hint, explanation.

EVERY KIND EXCEPT "open" MUST HAVE tier, hint AND explanation
- For "open", set tier to "common" and leave hint and explanation empty; they're ignored.
- "tier": how obscure the fact is for a student in this course: "common" (core idea everyone knows), "solid" (needs real study), "deep" (a detail), "rare" (easy to miss).
- "hint": a short clue that helps without giving it away. Never include the Answer, any alias, any word from them (including plurals and other forms), or an obvious fragment. Never spell out or describe an acronym or abbreviation ("abbreviated as", "its initials stand for"). For odd_one_out, never name the correct option. For ordered_recall, never list or paraphrase the steps; point at the first one or the idea that orders them.
- "explanation": one sentence shown after the Prompt, saying why the Answer is right.

ANSWERS ("open", "cloze", "definition_to_term")
- "canonical": the name the game shows. Keep it short (1-4 words): the name of a thing (an algorithm, term, structure, property), written as it appears on the cited page. Never a sentence or a paraphrase, and never only symbols ("+", "*", "<=", "->"): the student types a name.
- "aliases": other accepted names: abbreviations, expansions, alternative spellings and names ("BFS" / "breadth-first search", "Dijkstra" / "Dijkstra's algorithm"). Not typos; typos are handled by the game. An alias must never also fit a different Answer in the same Prompt.
- "exact_only": true for short acronyms (4 letters or fewer) and for any Answer within a couple of letters of another Answer in the same Prompt (BFS / DFS). Otherwise false.

QUALITY
- Each Prompt must be answerable in 25 seconds by typing a few words, and have a clear right answer.
- Don't repeat a Prompt, and don't ask the same fact twice in different kinds.
- Write the Prompt text in the language of the document.

EXAMPLES
These show the format and the quality to aim for, on a lecture about graph algorithms. They are not content to reuse: write your Prompts about the document you are given.
${examples}

BAD → GOOD
- Steps are not Answers. BAD open "Name a step in Dijkstra's algorithm" with answers like "Pick the unvisited node with the smallest known distance": sentences students can't type, and paraphrases that aren't on the page. GOOD: an ordered_recall "Put the steps of Dijkstra's algorithm in order", as in the example above. Use open only when each Answer is a short name.
- Names, not symbols. BAD "Name an arithmetic operator that returns NULL on null values" with answers "+", "-", "*", "/". GOOD: skip it, or ask for things with word names that appear on the page.
- One category. BAD "Name an algorithm that finds shortest paths or builds a spanning tree", "Name a procedure or method used on a heap". GOOD: "Name a minimum spanning tree algorithm" (Kruskal, Prim, Borůvka, ...).
- The subject, not the document. BAD "Name a topic covered in this material", "Name a graph algorithm mentioned in the lecture". GOOD: "Name a graph algorithm that runs in linear time".
- Odd one out from the deck. BAD "Which algorithm was NOT covered in the lecture?" with an option no page names. GOOD: four options the pages all name, where one does something different, as in the example above.
- Study content only. BAD "Name a rule for taking the midterm exam". GOOD: no Prompt from that slide.
- Hints that don't give it away. BAD hint for union-find: "A disjoint-set structure" (an alias) or "Its operations are find and union" (words from the Answer). GOOD: "A structure that tracks which vertices already share a component." BAD hint for DAG: "An acronym for a directed graph without cycles" (spells it out). GOOD: "Topological sort only exists on this kind of graph."${MATH_NOTATION_RULE}`;

export const GAME_SYSTEM_INSTRUCTION = gameSystemInstruction(GAME_PROMPT_COUNT);
/** F17: ask for more than we keep; selectPrompts (lib/games/select.ts) keeps the best 15-20. */
export const GAME_OVERGENERATE_SYSTEM_INSTRUCTION = gameSystemInstruction(GAME_OVERGENERATE_COUNT, GAME_OVERGENERATE_OPEN);

/**
 * F30: the split request's two calls, sent in parallel for one document. Both see every page
 * (an Open Prompt's Answers come from the whole deck); one writes only Open Prompts, the other
 * every other kind. Counts add up to the single call's (15-20, at least half Open; overgenerating,
 * about 25 with at least 12 Open).
 */
export const GAME_SPLIT_COUNTS = { open: "8-10", other: "7-10" };
export const GAME_OVERGENERATE_SPLIT_COUNTS = { open: "12-14", other: "11-13" };
const OTHER_KINDS = KINDS.filter((k) => k !== "open");
const quoted = (kinds: readonly string[]) => kinds.map((k) => `"${k}"`).join(", ").replace(/, ([^,]*)$/, " and $1");

export const gameOpenSystemInstruction = (count: string) =>
  gameInstruction(
    `write ${count} Prompts, all of them "open". Another writer covers the other kinds from the same pages at the same time, so write only "open" Prompts here`,
  );
export const gameOtherSystemInstruction = (count: string) =>
  gameInstruction(
    `write ${count} Prompts using only ${quoted(OTHER_KINDS)}, and include some of every one of these kinds the material supports. Another writer covers the "open" Prompts from the same pages at the same time, so write no "open" Prompts here`,
  );

/** The document's pages as Gemini sees them, asking for `count` Prompts. */
export function gamePromptContentsFor(count: string) {
  return (title: string, pages: { pageNumber: number; contentMd: string }[]): string => {
    const body = pages.map((p) => `=== Page ${p.pageNumber} ===\n${p.contentMd}`).join("\n\n");
    return `Document: ${title}\n\n${body}\n\nWrite ${count} Prompts for this document following your instructions.`;
  };
}

/** The document's pages as Gemini sees them. */
export const gamePromptContents = gamePromptContentsFor(GAME_PROMPT_COUNT);
export const gameOvergenerateContents = gamePromptContentsFor(GAME_OVERGENERATE_COUNT);

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

/** The response schema, with `kind` limited to `kinds` (F30's split calls each allow only their own). */
export const gameResponseSchema = (kinds: readonly string[]) => ({
  type: "object",
  properties: {
    prompts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...kinds] },
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
});

export const GAME_RESPONSE_SCHEMA = gameResponseSchema(KINDS);
export const GAME_OPEN_RESPONSE_SCHEMA = gameResponseSchema(["open"]);
export const GAME_OTHER_RESPONSE_SCHEMA = gameResponseSchema(OTHER_KINDS);
