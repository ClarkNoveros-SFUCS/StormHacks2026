// What every Mode's generator looks like, plus the checks Modes share. Spec:
// docs/architecture/game-generation-pipeline.md § Per-Mode generation.
//
// The pipeline (lib/games/generate-game.ts) is shared: read pages, one Gemini call per Source
// Document with the Mode's request, the Mode's per-document checks, check 7 (duplicate text),
// the Mode's Game-level checks, then one transaction writing prompts/answers/answer_keys.
// Pure: relative .ts imports only, so scripts/generate-check.ts can load it with plain Node.

import type { Drop, DocumentPage, ValidPrompt } from "../games/validate.ts";
import type { VerifyStatus } from "../games/verify.ts";
import { normalize } from "../matching/normalize.ts";
import type { PromptKind } from "./index.ts";

export type { DocumentPage, Drop };

export const NOT_ENOUGH_CONTENT = "Not enough usable content to make a Game";
export const MAX_QUOTE = 200;

/** What one Gemini call is given. Dive's lives in lib/gemini/game-prompt.ts. */
export type GenerationRequest = {
  systemInstruction: string;
  responseSchema: object;
  temperature: number;
  contents: (title: string, pages: DocumentPage[]) => string;
};

/** A checked Prompt ready to store, for any kind. `isTrue` is set for true_false only. */
export type GeneratedPrompt = Omit<ValidPrompt, "kind"> & { kind: PromptKind; isTrue: boolean | null };

export type DocumentChecks = { prompts: GeneratedPrompt[]; dropped: Drop[]; quotesCleared: number };

export type Tagged<D> = { doc: D; prompt: GeneratedPrompt };

export type ModeGenerator = {
  /** The Gemini call for one Source Document. */
  request: GenerationRequest;
  /** Fewer Prompts than this after every check → the Game fails. */
  minPrompts: number;
  /** Per-document checks on Gemini's response (drop what fails, never throw). */
  validate(response: unknown, pages: DocumentPage[]): DocumentChecks;
  /** Game-level checks after duplicate texts are removed (e.g. Blitz's true/false balance). */
  finalize<D>(kept: Tagged<D>[]): { kept: Tagged<D>[]; dropped: Drop[] };
  /** The user-facing error when too few Prompts survive. */
  notEnough(kept: number): string;
  /**
   * F17, Dive's engine only: a request for more Prompts than a Game needs, and how to keep the
   * best per document after the checks and the verification pass. Used when GEMINI_OVERGENERATE is on.
   */
  overgenerate?: {
    request: GenerationRequest;
    select(prompts: GeneratedPrompt[], verification?: VerifyStatus[]): { prompts: GeneratedPrompt[]; dropped: Drop[] };
  };
};

/**
 * F17: ask for ~25 Prompts per document and keep the best 15-20 (Modes with `overgenerate`).
 * Off by default. GEMINI_OVERGENERATE=on (or 1/true/yes) turns it on.
 */
export function overgenerateEnabled(): boolean {
  return /^(on|1|true|yes)$/i.test(process.env.GEMINI_OVERGENERATE?.trim() ?? "");
}

export function notEnoughFor(modeName: string, what: string, min: number) {
  return (kept: number) =>
    `${NOT_ENOUGH_CONTENT}: a ${modeName} Game needs ${min} ${what} and only ${kept} passed the checks. Try adding more files`;
}

export const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/** The quote if it's verbatim on the page (whitespace- and case-insensitive) and ≤ 200 characters, else null. */
export function quoteOnPage(quote: string | null | undefined, pageText: string | undefined): string | null {
  const q = quote ? collapse(quote) : "";
  if (!q || q.length > MAX_QUOTE || pageText === undefined) return null;
  const page = collapse(pageText);
  return page.includes(q) || page.toLowerCase().includes(q.toLowerCase()) ? q : null;
}

/** Whole-word containment on normalized text (both sides already normalized). */
export function containsWords(haystack: string, needle: string): boolean {
  return needle !== "" && ` ${haystack} `.includes(` ${needle} `);
}

export function promptLabel(raw: unknown): string {
  const text = (raw as { text?: unknown } | null)?.text;
  return typeof text === "string" && text.trim() ? text.trim().slice(0, 80) : "(no text)";
}

/** The pages' text by page number. */
export function pageTexts(pages: DocumentPage[]) {
  return new Map(pages.map((p) => [p.pageNumber, p.contentMd]));
}

/** "=== Page N ===" blocks, the shape Dive's prompt already uses. */
export function pagesAsText(title: string, pages: DocumentPage[]) {
  return `Document: ${title}\n\n${pages.map((p) => `=== Page ${p.pageNumber} ===\n${p.contentMd}`).join("\n\n")}`;
}

export const same = (a: string, b: string) => normalize(a) === normalize(b);

/** No Game-level checks. */
export function keepAll<D>(kept: Tagged<D>[]) {
  return { kept, dropped: [] as Drop[] };
}
