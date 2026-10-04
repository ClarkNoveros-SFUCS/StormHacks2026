// Gemini requests for new Daily Dive puzzles (npm run daily:generate). Spec:
// docs/architecture/daily-dive.md § Generation, ADR-0006.
//
// Two calls per puzzle: (1) write the puzzle and its fact sheet together, page N backing
// Prompt N; (2) a separate verification pass that judges every Answer against general
// knowledge and the fact sheet, so Answers that are wrong or unsupported are dropped. Then
// the puzzle goes through the same checks as the seed pool (lib/daily/puzzle.ts, lenient).
// Pure: relative .ts imports only, so plain Node can load it.

import { GAME_RESPONSE_SCHEMA } from "../gemini/game-prompt.ts";
import type { GenerationRequest } from "../modes/generation.ts";
import { OPEN_ANSWERS, type PuzzleFile } from "./puzzle.ts";

/** Q23's rotation: launch day (#1) is Computing; puzzle N gets THEMES[(N − 1) % 7]. */
export const THEMES = ["Computing", "Science", "History", "Geography", "Literature", "Mathematics", "Art & Music"] as const;

export function themeFor(number: number): string {
  return THEMES[(number - 1) % THEMES.length];
}

/** The fixed shape of a puzzle: three Open Prompts, then one of each single-answer kind. */
export const PUZZLE_KINDS = ["open", "open", "open", "cloze", "definition_to_term", "ordered_recall", "odd_one_out"] as const;

export const PUZZLE_SYSTEM_INSTRUCTION = `You write the Daily Dive: one short daily trivia game that every player gets the same day. Players type each answer within 25 seconds; rarer correct answers score more, like the game show "Pointless".

AUDIENCE AND FACTS
- High-school to first-year-university level general knowledge in the theme you're given. Fun, fair, and unambiguous.
- Only well-established facts you are certain are true. No trick questions, no current events, no opinions, nothing that changes over time (no "current" record holders, populations or office holders).

OUTPUT
- "theme": the theme you were given. "title": a short catchy title for the day (2-6 words, may start with the theme; never "Daily Dive", the game adds that).
- "fact_sheet.pages": exactly 7 pages, page_number 1 to 7. Page N is a short markdown explainer (a "# heading" and 100-260 words, mostly a bullet list with one bullet per Answer) that backs Prompt N and nothing else. It must name every accepted Answer of Prompt N in a sentence that shows why it fits the Prompt.
- "prompts": exactly 7, in this order of kinds: open, open, open, cloze, definition_to_term, ordered_recall, odd_one_out. Prompt N cites only page N.

GROUNDING
- Every Answer cites evidence_page = its Prompt's number and evidence_quote: a passage copied character for character from that page (at most 200 characters) that shows the Answer fits the Prompt. The Answer's canonical name or an alias must appear on that page.
- ordered_recall and odd_one_out cite evidence_page = their Prompt's number; that page lists the items in order, or names the odd option and why it's different.

PROMPT KINDS
- "open": a category with many valid answers, e.g. "Name a noble gas", "Name a planet with rings". List 8-${OPEN_ANSWERS.max} Answers in "answers" (never fewer than ${OPEN_ANSWERS.min + 2}; pick categories big enough), ordered from the most obvious (most players would type it) to the most obscure (few would think of it). That order is the only rarity signal. Every Answer must truly fit; leave out borderline ones. Set tier "common", hint and explanation "".
- "cloze": a fact with one key term replaced by "______". Exactly 1 Answer.
- "definition_to_term": a description in your own words; the Answer is the term. Exactly 1 Answer. Don't put the term in the text.
- "ordered_recall": "Put these in order …" (by date, size, sequence). "items": 3-6 short items in the correct order.
- "odd_one_out": "options": exactly 4 short, distinct options; "correct_option" is the one that doesn't belong, copied exactly from "options". The text says how three of them belong together without naming them.
- Every kind except "open" has "tier" (common: most adults know it; solid: needs study; deep: a detail; rare: easy to miss), "hint" (a clue that never contains the Answer, any alias or any word from them), and "explanation" (one sentence on why the Answer is right).

ANSWERS
- "canonical": the name shown (1-4 words). "aliases": other accepted names, abbreviations, spellings and short forms players would type ("Mercury" / "planet Mercury"; "WWII" / "Second World War"). Never an alias that also fits another Answer of the same Prompt.
- "exact_only": true for short acronyms (4 letters or fewer) and for Answers within a couple of letters of another Answer in the same Prompt; else false.

QUALITY
- The seven Prompts cover different corners of the theme; never ask the same fact twice.
- Open Prompts ask for named things (people, places, works, terms), not numbers.
- Each fact sheet bullet teaches something about its Answer (a date, a property, why it fits), rather than repeating the question.
- Each Prompt reads like a quiz question and stands on its own: never mention pages, the fact sheet or "according to".`;

/** Gemini's JSON shape: a pool.json puzzle without number/day. */
export const PUZZLE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    theme: { type: "string" },
    title: { type: "string" },
    fact_sheet: {
      type: "object",
      properties: {
        pages: {
          type: "array",
          items: {
            type: "object",
            properties: { page_number: { type: "integer" }, content_md: { type: "string" } },
            required: ["page_number", "content_md"],
          },
        },
      },
      required: ["pages"],
    },
    prompts: GAME_RESPONSE_SCHEMA.properties.prompts,
  },
  required: ["theme", "title", "fact_sheet", "prompts"],
} as const;

/** The request for one new puzzle. `avoid` lists Prompt texts already used in this theme. */
export function puzzleRequest(theme: string, avoid: string[]): GenerationRequest {
  return {
    systemInstruction: PUZZLE_SYSTEM_INSTRUCTION,
    responseSchema: PUZZLE_RESPONSE_SCHEMA,
    temperature: 0.8,
    contents: () =>
      `Theme: ${theme}\n\n` +
      (avoid.length ? `Earlier Daily Dives already asked these, so ask about other things:\n${avoid.map((t) => `- ${t}`).join("\n")}\n\n` : "") +
      "Write today's puzzle following your instructions.",
  };
}

// ---------- Verification ----------

export const VERIFY_SYSTEM_INSTRUCTION = `You are the fact checker for a daily trivia game. For each item, decide whether it is correct.

An item is "supported" only if BOTH hold:
1. It is factually correct as an answer to its question by well-established knowledge (for an ordered list: the order is right; for an odd-one-out: that option is the one that doesn't belong and the other three do belong together).
2. The fact sheet page given with it states it.

Be strict: anything wrong, doubtful, ambiguous, outdated, or a stretch for the question is not supported. Judge every item; give a short reason.`;

export const VERIFY_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, supported: { type: "boolean" }, reason: { type: "string" } },
        required: ["id", "supported", "reason"],
      },
    },
  },
  required: ["verdicts"],
} as const;

type RawAnswer = { canonical?: string; aliases?: string[] };
type RawPrompt = {
  kind?: string; text?: string; answers?: RawAnswer[]; items?: string[]; options?: string[]; correct_option?: string;
};

/** Items to check, one per Answer ("P2.A5") or per single-answer Prompt ("P6"). */
export function verificationItems(puzzle: PuzzleFile): { id: string; prompt: number; question: string; claim: string }[] {
  const items: { id: string; prompt: number; question: string; claim: string }[] = [];
  (puzzle.prompts as RawPrompt[]).forEach((p, i) => {
    const n = i + 1;
    const question = p.text ?? "";
    if (p.kind === "ordered_recall") {
      items.push({ id: `P${n}`, prompt: n, question, claim: `Correct order: ${(p.items ?? []).join(" → ")}` });
    } else if (p.kind === "odd_one_out") {
      items.push({ id: `P${n}`, prompt: n, question, claim: `Options: ${(p.options ?? []).join(", ")}. The odd one out is: ${p.correct_option}` });
    } else if (p.kind === "open") {
      (p.answers ?? []).forEach((a, j) => items.push({ id: `P${n}.A${j + 1}`, prompt: n, question, claim: `Answer: ${a.canonical}` }));
    } else {
      items.push({ id: `P${n}`, prompt: n, question, claim: `Answer: ${p.answers?.[0]?.canonical ?? ""}` });
    }
  });
  return items;
}

export function verifyRequest(puzzle: PuzzleFile): GenerationRequest {
  const items = verificationItems(puzzle);
  const pages = new Map(puzzle.fact_sheet.pages.map((p) => [p.page_number, p.content_md]));
  return {
    systemInstruction: VERIFY_SYSTEM_INSTRUCTION,
    responseSchema: VERIFY_RESPONSE_SCHEMA,
    temperature: 0,
    contents: () =>
      [1, 2, 3, 4, 5, 6, 7]
        .map((n) => {
          const own = items.filter((x) => x.prompt === n);
          if (!own.length) return "";
          return `=== Question ${n}: ${own[0].question}\nFact sheet page ${n}:\n${pages.get(n) ?? "(missing)"}\n\nItems:\n${own
            .map((x) => `- ${x.id}: ${x.claim}`)
            .join("\n")}`;
        })
        .filter(Boolean)
        .join("\n\n") + "\n\nJudge every item.",
  };
}

export type Verdict = { id: string; supported: boolean; reason: string };

/**
 * Applies the verification: drops unsupported Open Answers; a single-answer Prompt that isn't
 * supported (or any item with no verdict) fails the whole puzzle. Returns the cleaned puzzle
 * or the reasons it failed.
 */
export function applyVerdicts(puzzle: PuzzleFile, verdicts: Verdict[]): { puzzle: PuzzleFile; dropped: string[]; failed: string[] } {
  const byId = new Map(verdicts.map((v) => [v.id.trim(), v]));
  const dropped: string[] = [];
  const failed: string[] = [];
  const prompts = (puzzle.prompts as RawPrompt[]).map((p, i) => {
    const n = i + 1;
    if (p.kind !== "open") {
      const v = byId.get(`P${n}`);
      if (!v?.supported) failed.push(`P${n} "${p.text}": ${v ? v.reason : "no verdict"}`);
      return p;
    }
    const answers = (p.answers ?? []).filter((a, j) => {
      const v = byId.get(`P${n}.A${j + 1}`);
      if (v?.supported) return true;
      dropped.push(`P${n} "${a.canonical}": ${v ? v.reason : "no verdict"}`);
      return false;
    });
    return { ...p, answers };
  });
  return { puzzle: { ...puzzle, prompts }, dropped, failed };
}

/**
 * Points every Answer and Prompt of Prompt N at fact sheet page N. The page is written for
 * that Prompt, so a different number is a bookkeeping slip; the checks still require the
 * quote to be verbatim on page N and the Answer to be named there, so grounding is unchanged.
 */
export function alignEvidence(puzzle: PuzzleFile): PuzzleFile {
  const prompts = (puzzle.prompts as (RawPrompt & { evidence_page?: number; answers?: (RawAnswer & { evidence_page?: number })[] })[]).map(
    (p, i) => ({
      ...p,
      ...(p.evidence_page !== undefined && p.evidence_page !== null && { evidence_page: i + 1 }),
      ...(p.answers && { answers: p.answers.map((a) => ({ ...a, evidence_page: i + 1 })) }),
    }),
  );
  return { ...puzzle, prompts };
}

/** The title without a "Daily Dive:" prefix (the game adds "Daily Dive #N: …" itself). */
export function cleanTitle(puzzle: PuzzleFile): PuzzleFile {
  const title = (puzzle.title ?? "").replace(/^\s*daily\s+dive\s*(#\s*\d+)?\s*[:·\-–—]?\s*/i, "").trim();
  return { ...puzzle, title: title || puzzle.title };
}

/** Caps each Open Prompt at OPEN_ANSWERS.max Answers (the most obvious ones), before the checks. */
export function capOpenAnswers(puzzle: PuzzleFile): PuzzleFile {
  const prompts = (puzzle.prompts as RawPrompt[]).map((p) =>
    p.kind === "open" && (p.answers?.length ?? 0) > OPEN_ANSWERS.max ? { ...p, answers: p.answers!.slice(0, OPEN_ANSWERS.max) } : p,
  );
  return { ...puzzle, prompts };
}

/** Kinds in the wrong order make the puzzle unusable (the share grid and pages assume it). */
export function kindErrors(puzzle: PuzzleFile): string[] {
  const kinds = (puzzle.prompts as RawPrompt[]).map((p) => p.kind);
  return kinds.length === PUZZLE_KINDS.length && kinds.every((k, i) => k === PUZZLE_KINDS[i])
    ? []
    : [`kinds are ${kinds.join(", ")}; expected ${PUZZLE_KINDS.join(", ")}`];
}

// USD per 1M tokens (thinking is billed as output). Estimates only, as in scripts/generate-check.ts.
export const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "gemini-3.7-flash": { input: 0.75, output: 3.75 },
  "gemini-3.6-flash": { input: 0.75, output: 3.75 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
};

export function costUsd(model: string, usage: { inputTokens: number; outputTokens: number; thinkingTokens: number }): number | null {
  const price = PRICES[model];
  return price ? (usage.inputTokens * price.input + (usage.outputTokens + usage.thinkingTokens) * price.output) / 1e6 : null;
}
