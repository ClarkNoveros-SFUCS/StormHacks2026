// Blitz's generator: true/false statements (statement, truth value, explanation, Evidence),
// roughly half true and half false. Spec: game-generation-pipeline.md § Blitz.
// Pure: relative .ts imports only (scripts/generate-check.ts loads it with Node).

import { z } from "zod";
import { normalize } from "../../matching/normalize.ts";
import { TIERS } from "../../scoring/tiers.ts";
import {
  containsWords, notEnoughFor, pagesAsText, pageTexts, promptLabel, quoteOnPage,
  type Drop, type GeneratedPrompt, type ModeGenerator, type Tagged,
} from "../generation.ts";
import { MODES } from "../index.ts";

const MIN = MODES.blitz.minPrompts;
export const MAX_STATEMENT = 200;
/** The larger side (true or false) may be at most this many times the smaller one. */
export const MAX_IMBALANCE = 1.5;

export const BLITZ_SYSTEM_INSTRUCTION = `You write true/false statements for a rapid-fire study game. A student uploaded their own course file; the game flashes one statement at a time and the student has about two seconds to judge it.

GROUNDING
- Use only facts stated in the pages you are given. Never add outside knowledge.
- Every statement cites evidence_page (the number from its "=== Page N ===" marker) and evidence_quote: a short passage copied character for character from that page, at most 200 characters, that shows whether the statement is true or false. Copy it exactly.
- Skip pages with no study content (title slides, agendas, outlines, references).

STATEMENTS (write 36-45, about half true and half false)
- "text": one short, self-contained statement (at most 20 words), readable at a glance. Never mention pages, slides, "the document" or "the lecture".
- "is_true": true or false.
- A true statement restates a fact from the pages in your own words.
- A false statement changes exactly one detail of a real fact from the pages so it becomes clearly wrong: swap in another algorithm, term, value or property that also appears in the notes. It must be unambiguously false according to the pages, never a matter of opinion or wording.
- Avoid "always/never" traps, double negatives and trick wording. One idea per statement.
- "explanation": one sentence shown afterwards: for a false statement, the correct fact.
- "tier": how obscure the fact is for a student in this course: "common", "solid", "deep" or "rare".
- Cover many different pages and facts; don't state the same fact twice.
- Write in the language of the document.`;

export const BLITZ_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    prompts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["true_false"] },
          text: { type: "string", description: "The statement, at most 20 words." },
          is_true: { type: "boolean" },
          explanation: { type: "string" },
          tier: { type: "string", enum: [...TIERS] },
          evidence_page: { type: "integer" },
          evidence_quote: { type: "string", description: "Verbatim from evidence_page, at most 200 characters." },
        },
        required: ["kind", "text", "is_true", "explanation", "tier", "evidence_page", "evidence_quote"],
      },
    },
  },
  required: ["prompts"],
} as const;

const RawStatement = z.object({
  kind: z.literal("true_false").default("true_false"),
  text: z.string().trim().min(1),
  is_true: z.boolean(),
  explanation: z.string().nullish(),
  tier: z.enum(TIERS).nullish(),
  evidence_page: z.number().int(),
  evidence_quote: z.string().nullish(),
});

/** Checks one document's statements. Never throws on bad content. */
export function validateBlitz(response: unknown, pages: { pageNumber: number; contentMd: string }[]) {
  const dropped: Drop[] = [];
  const prompts: GeneratedPrompt[] = [];
  const list = (response as { prompts?: unknown } | null)?.prompts;
  if (!Array.isArray(list)) {
    return { prompts, dropped: [{ prompt: "(response)", what: "response", reason: "not { prompts: [...] }" }], quotesCleared: 0 };
  }
  const text = pageTexts(pages);

  for (const raw of list) {
    const parsed = RawStatement.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      dropped.push({ prompt: promptLabel(raw), what: "prompt", reason: `schema: ${issue.path.join(".")} ${issue.message}` });
      continue;
    }
    const p = parsed.data;
    const drop = (reason: string) => dropped.push({ prompt: p.text.slice(0, 80), what: "prompt", reason });
    if (p.text.length > MAX_STATEMENT) { drop(`statement is over ${MAX_STATEMENT} characters`); continue; }
    if (!text.has(p.evidence_page)) { drop(`cites missing page ${p.evidence_page}`); continue; }
    const quote = quoteOnPage(p.evidence_quote, text.get(p.evidence_page));
    if (!quote) { drop(`evidence quote isn't verbatim on page ${p.evidence_page}`); continue; }
    // A "false" statement that's copied word for word from the notes is really true
    if (!p.is_true && containsWords(normalize(text.get(p.evidence_page)!), normalize(p.text))) {
      drop("a false statement that appears verbatim in the notes");
      continue;
    }
    const tier = p.tier ?? "solid";
    prompts.push({
      kind: "true_false",
      text: p.text,
      tier,
      hint: null,
      explanation: p.explanation?.trim() || null,
      items: null,
      options: null,
      evidencePage: p.evidence_page,
      isTrue: p.is_true,
      answers: [{
        canonical: p.is_true ? "True" : "False", keys: [], exactOnly: false,
        evidencePage: p.evidence_page, evidenceQuote: quote, tier, rarityRank: null,
      }],
    });
  }
  return { prompts, dropped, quotesCleared: 0 };
}

/**
 * Balances true and false across the Game: the larger side keeps at most 1.5× the smaller
 * one (its first statements, in document order), so always answering one way can't win.
 */
export function balanceTrueFalse<D>(kept: Tagged<D>[]) {
  const trues = kept.filter((k) => k.prompt.isTrue).length;
  const falses = kept.length - trues;
  const cap = Math.floor(Math.min(trues, falses) * MAX_IMBALANCE);
  const major = trues > falses;
  let seen = 0;
  const dropped: Drop[] = [];
  const out = kept.filter(({ prompt }) => {
    if (Boolean(prompt.isTrue) !== major) return true;
    seen += 1;
    if (seen <= cap) return true;
    dropped.push({ prompt: prompt.text.slice(0, 80), what: "prompt", reason: `too many ${major ? "true" : "false"} statements (balance)` });
    return false;
  });
  return { kept: out, dropped };
}

export const blitzGenerator: ModeGenerator = {
  request: {
    systemInstruction: BLITZ_SYSTEM_INSTRUCTION,
    responseSchema: BLITZ_RESPONSE_SCHEMA,
    temperature: 0.5,
    contents: (title, pages) => `${pagesAsText(title, pages)}\n\nWrite 36-45 true/false statements for this document, about half of them false, following your instructions.`,
  },
  minPrompts: MIN,
  validate: validateBlitz,
  finalize: balanceTrueFalse,
  notEnough: notEnoughFor("Blitz", "true/false statements", MIN),
};
