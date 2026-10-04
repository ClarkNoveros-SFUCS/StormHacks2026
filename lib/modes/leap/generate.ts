// Leap's generator: multiple-choice questions (stem, 4 options, exactly 1 correct, explanation,
// Evidence for the correct option). Spec: game-generation-pipeline.md § Leap.
// Pure: relative .ts imports only (scripts/generate-check.ts loads it with Node).

import { z } from "zod";
import { normalize } from "../../matching/normalize.ts";
import { TIERS } from "../../scoring/tiers.ts";
import {
  containsWords, keepAll, notEnoughFor, pagesAsText, pageTexts, promptLabel, quoteOnPage,
  type Drop, type GeneratedPrompt, type ModeGenerator,
} from "../generation.ts";
import { MATH_NOTATION_RULE } from "../../gemini/math-notation.ts";
import { MODES } from "../index.ts";

const MIN = MODES.leap.minPrompts;

export const LEAP_SYSTEM_INSTRUCTION = `You write multiple-choice questions for a fast study game. A student uploaded their own course file; each question is answered by clicking one of 4 options within 15 seconds.

GROUNDING
- Use only facts stated in the pages you are given. Never add outside knowledge, even if it's true.
- The correct option must be supported by the pages. Give evidence_page (the number from its "=== Page N ===" marker) and evidence_quote: a short passage copied character for character from that page, at most 200 characters, that shows the correct option is right. Copy it exactly; don't fix typos, reword, or join text from different places.
- Skip pages with no study content (title slides, agendas, outlines, references, "questions?"). Course administration (exams, grading, deadlines, policies) is never a question.

QUESTIONS (write 12-16)
- "text": the question stem. It stands on its own, like an exam question. Never mention pages, slides, "the document", "the lecture" or "according to". Don't put the answer in the stem.
- "options": exactly 4 short options (a few words each, at most about 12 words), all different, all the same kind of thing and similar in length and style.
- "correct_option": the one correct option, copied exactly from "options". Exactly one option is correct.
- The 3 wrong options (distractors) must be plausible to a student who hasn't studied: take them from the same notes (other algorithms, terms, values or properties that appear in the pages), and make each one clearly wrong for this stem once you know the material. Never use "all of the above", "none of the above" or "both A and B".
- Vary which position the correct option is in.
- "explanation": one sentence shown after answering, saying why the correct option is right (and, if useful, why a tempting distractor is wrong).
- "tier": how obscure the fact is for a student in this course: "common", "solid", "deep" or "rare".
- Cover different pages and ideas; don't ask the same fact twice.
- Write in the language of the document.

EXAMPLE (format and quality only, from a lecture on graph algorithms; not content to reuse)
{"kind":"multiple_choice","text":"Which algorithm finds single-source shortest paths when some edge weights are negative?","options":["Dijkstra","Bellman-Ford","Prim","BFS"],"correct_option":"Bellman-Ford","explanation":"Bellman-Ford relaxes every edge V - 1 times, so it handles negative weights; Dijkstra assumes they can't occur.","tier":"solid","evidence_page":6,"evidence_quote":"Finds shortest paths from one source, and works with negative edge weights."}
BAD: "Which algorithm was NOT covered this week?", or distractors that aren't the same kind of thing ("Dijkstra", "O(V^3)", "a queue", "Kruskal"). GOOD: four algorithms from the notes, one of them right for the stem.${MATH_NOTATION_RULE}`;

export const LEAP_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    prompts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["multiple_choice"] },
          text: { type: "string" },
          options: { type: "array", items: { type: "string" }, description: "Exactly 4 distinct options." },
          correct_option: { type: "string", description: "Copied exactly from options." },
          explanation: { type: "string" },
          tier: { type: "string", enum: [...TIERS] },
          evidence_page: { type: "integer" },
          evidence_quote: { type: "string", description: "Verbatim from evidence_page, at most 200 characters." },
        },
        required: ["kind", "text", "options", "correct_option", "explanation", "tier", "evidence_page", "evidence_quote"],
      },
    },
  },
  required: ["prompts"],
} as const;

const RawMcq = z.object({
  kind: z.literal("multiple_choice").default("multiple_choice"),
  text: z.string().trim().min(1),
  options: z.array(z.string()),
  correct_option: z.string(),
  explanation: z.string().nullish(),
  tier: z.enum(TIERS).nullish(),
  evidence_page: z.number().int(),
  evidence_quote: z.string().nullish(),
});

const optionKey = (o: string) => o.toLowerCase().replace(/\s+/g, " ").trim();

const BANNED_OPTION =/^(all|none|both|neither) of (the )?(above|these|them)$|^both [a-d] and [a-d]$/i;

/** Checks one document's multiple-choice questions. Never throws on bad content. */
export function validateLeap(response: unknown, pages: { pageNumber: number; contentMd: string }[]) {
  const dropped: Drop[] = [];
  const prompts: GeneratedPrompt[] = [];
  const list = (response as { prompts?: unknown } | null)?.prompts;
  if (!Array.isArray(list)) {
    return { prompts, dropped: [{ prompt: "(response)", what: "response", reason: "not { prompts: [...] }" }], quotesCleared: 0 };
  }
  const text = pageTexts(pages);

  for (const raw of list) {
    const parsed = RawMcq.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      dropped.push({ prompt: promptLabel(raw), what: "prompt", reason: `schema: ${issue.path.join(".")} ${issue.message}` });
      continue;
    }
    const p = parsed.data;
    const drop = (reason: string) => dropped.push({ prompt: p.text.slice(0, 80), what: "prompt", reason });

    // Shape: exactly 4 distinct, usable options, none of them "all of the above". Distinct by
    // case and spacing only: normalize() drops symbols, so "O(V + E)" and "O(V * E)" would collide.
    const options = p.options.map((o) => o.trim());
    if (options.length !== 4) { drop(`has ${options.length} options (need 4)`); continue; }
    if (options.some((o) => !normalize(o)) || new Set(options.map(optionKey)).size !== 4) { drop("options aren't 4 distinct options"); continue; }
    if (options.some((o) => BANNED_OPTION.test(normalize(o)))) { drop('uses "all/none of the above"'); continue; }

    // Exactly one correct option: an exact copy, else the one option equal up to case and spacing
    const correct = options.includes(p.correct_option.trim())
      ? p.correct_option.trim()
      : options.find((o) => optionKey(o) === optionKey(p.correct_option));
    if (!correct) { drop("correct_option isn't one of the options"); continue; }

    // Evidence: the cited page exists and the quote is verbatim on it
    if (!text.has(p.evidence_page)) { drop(`cites missing page ${p.evidence_page}`); continue; }
    const quote = quoteOnPage(p.evidence_quote, text.get(p.evidence_page));
    if (!quote) { drop(`evidence quote isn't verbatim on page ${p.evidence_page}`); continue; }

    // The stem must not name the correct option while naming none of the others
    const stem = normalize(p.text);
    const named = (o: string) => normalize(o).length > 2 && containsWords(stem, normalize(o));
    if (named(correct) && !options.some((o) => o !== correct && named(o))) { drop("the stem gives away the answer"); continue; }

    const tier = p.tier ?? "solid";
    prompts.push({
      kind: "multiple_choice",
      text: p.text,
      tier,
      hint: null,
      explanation: p.explanation?.trim() || null,
      items: null,
      options,
      evidencePage: p.evidence_page,
      isTrue: null,
      answers: [{ canonical: correct, keys: [], exactOnly: false, evidencePage: p.evidence_page, evidenceQuote: quote, tier, rarityRank: null }],
    });
  }
  return { prompts, dropped, quotesCleared: 0 };
}

export const leapGenerator: ModeGenerator = {
  request: {
    systemInstruction: LEAP_SYSTEM_INSTRUCTION,
    responseSchema: LEAP_RESPONSE_SCHEMA,
    temperature: 0.4,
    contents: (title, pages) => `${pagesAsText(title, pages)}\n\nWrite 12-16 multiple-choice questions for this document following your instructions.`,
  },
  minPrompts: MIN,
  validate: validateLeap,
  finalize: keepAll,
  notEnough: notEnoughFor("Leap", "questions", MIN),
};
