// Study notes for one parsed page (#75): Gemini rewrites the raw text layer of a slide into tidy
// markdown (headings, lists, tables, bold key terms, readable formulas) without adding content.
// Shown in the Reveal's slide panel and the Module file viewer; content_md stays the source of
// truth for generation and Evidence.
//
// Server only in the app, but no "server-only" import, like the other lib/gemini files.

import { defaultModels, generateDocumentPrompts } from "../gemini.ts";
import type { GenerationRequest } from "../modes/generation.ts";

/** Per attempt. A single page is small; the panel shows the raw text while it waits. */
const NOTES_TIMEOUT_MS = 45_000;
/** Longest notes we keep. A page is at most a few KB of text. */
export const MAX_NOTES = 20_000;

export const NOTES_SYSTEM_INSTRUCTION = `You turn one page of text extracted from a student's lecture slides (or notes) into clean, readable study notes in markdown.

The text came from a PDF/PPTX text layer, so it is messy: bullet markers are often lost (each line was a bullet), numbered items look like "1 Axiom 1 — ...", columns are joined with " | ", formulas are broken across lines (fractions split into numerator / denominator lines, sums as "Xn ... i=1", primes and complements as stray "′" or "c" lines), and running headers or footers may remain.

Rewrite it so a student can study from it:
- Keep the page's title as a "## " heading. Use "### " for sub-sections (e.g. "Example: Coin tosses", "Propositions").
- Restore lists: "- " bullets, "1. " for numbered items, two-space indent for sub-points.
- Use a markdown table when the content is parallel or tabular. Always use a table for: 3+ named items that each have a formula or definition (laws, axioms, rules, properties: | Law | Formula |), a comparison of two or more things (e.g. "Disjoint vs. Independent": | | Disjoint | Independent |), side-by-side columns, and the given values of a word problem (| Quantity | Value |). Every table needs a header row and a separator row ("| --- | --- |"). Keep cells short; long explanations stay as bullets.
- **Bold** each key term where it is defined.
- Rebuild formulas into one readable line with Unicode math, inside backticks: \`P(A|B) = P(A ∩ B) / P(B)\`, \`P(Aᶜ) = 1 − P(A)\`, \`P(⋃ᵢ Aᵢ) = Σᵢ P(Aᵢ)\`, \`(A ∪ B)′ = A′ ∩ B′\`. No LaTeX, no $ signs.
- Put a worked answer or key takeaway in a "> " quote line if the page has one.
- Drop leftover headers/footers (author name, course name, "22 / 22"), image credits ("Photo credit: …", "Image by …") and lone stray symbols.

Rules:
- Use ONLY what is on the page. Never add facts, explanations, examples or answers that aren't there. If a formula is too garbled to rebuild with confidence, keep the readable parts as they are.
- Keep the page's wording; fix only obvious extraction glitches (split words, broken symbols).
- No HTML, no images, no code fences, no "# " level-1 headings.
- If the page has almost no text, return what there is, tidied.`;

export const NOTES_RESPONSE_SCHEMA = {
  type: "object",
  properties: { notes_md: { type: "string", description: "The page as tidy study notes in markdown." } },
  required: ["notes_md"],
} as const;

const NOTES_REQUEST: GenerationRequest = {
  systemInstruction: NOTES_SYSTEM_INSTRUCTION,
  responseSchema: NOTES_RESPONSE_SCHEMA,
  temperature: 0.1,
  contents: (title, pages) =>
    `Document: ${title}\n\n${pages.map((p) => `=== Page ${p.pageNumber} ===\n${p.contentMd}`).join("\n\n")}\n\nRewrite this page as study notes following your instructions.`,
};

/**
 * The fast model first (GEMINI_FALLBACK_MODEL, usually a flash-lite) since a Player is waiting
 * on it, then GEMINI_MODEL. Reformatting doesn't need the stronger model.
 */
function notesModels(): string[] {
  const models = defaultModels();
  return models.length > 1 ? [models[1], models[0]] : models;
}

/** Gemini's study notes for one page, or throws GeminiError. Empty input gives "". */
export async function writePageNotes(title: string, page: { pageNumber: number; contentMd: string }): Promise<string> {
  if (!page.contentMd.trim()) return "";
  const { response } = await generateDocumentPrompts(title, [page], NOTES_REQUEST, {
    models: notesModels(),
    timeoutMs: NOTES_TIMEOUT_MS,
  });
  const md = (response as { notes_md?: unknown })?.notes_md;
  return typeof md === "string" ? cleanNotes(md) : "";
}

/** Unwraps a code fence around the whole answer and caps the length. (The viewer never renders HTML.) */
export function cleanNotes(md: string): string {
  let s = md.replace(/\r\n?/g, "\n").trim();
  const fenced = s.match(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/);
  if (fenced) s = fenced[1].trim();
  return s.length > MAX_NOTES ? s.slice(0, MAX_NOTES) : s;
}
