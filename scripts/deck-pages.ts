// Shared by generate:check and generate:eval: env loading, a file's or the seed fixture's
// pages (extracted exactly as the upload pipeline does), and the prompt version hash.

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { extractPages } from "../lib/documents/extract/index.ts";
import { toParsedPages, validateUpload } from "../lib/documents/parsed-pages.ts";
import { generateDocumentPrompts } from "../lib/gemini.ts";
import { GAME_PROMPT_TEMPERATURE, GAME_RESPONSE_SCHEMA, GAME_SYSTEM_INSTRUCTION } from "../lib/gemini/game-prompt.ts";
import { estimateCostUsd } from "../lib/gemini/pricing.ts";
import type { RunInfo } from "../lib/games/scorecard.ts";
import { generateSplit, type GenerationRequest } from "../lib/modes/generation.ts";
import { VERIFY_RESPONSE_SCHEMA, VERIFY_SYSTEM_INSTRUCTION, VERIFY_TEMPERATURE } from "../lib/gemini/verify.ts";
import type { DocumentPage } from "../lib/games/validate.ts";

export const root = path.resolve(import.meta.dirname, "..");

export function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(path.join(root, file));
    } catch {}
  }
}

export type Deck = { title: string; pages: DocumentPage[] };

/** A local PDF, PPTX or DOCX, parsed as an upload would be. */
export async function loadFileDeck(file: string): Promise<Deck> {
  const { size } = await stat(file);
  const mimeType = validateUpload(path.basename(file), "", size);
  const pages = toParsedPages(await extractPages(new Uint8Array(await readFile(file)), mimeType));
  return { title: path.basename(file), pages: pages.map((p) => ({ pageNumber: p.pageNumber, contentMd: p.contentMd })) };
}

/** The seed fixture's document (db/seed/graph-algorithms.json). */
export async function loadSeedDeck(): Promise<Deck> {
  const fixture = JSON.parse(await readFile(path.join(root, "db/seed/graph-algorithms.json"), "utf8"));
  return {
    title: fixture.document.filename,
    pages: fixture.document.pages.map((p: { page_number: number; content_md: string }) => ({ pageNumber: p.page_number, contentMd: p.content_md })),
  };
}

/**
 * Short hash of what Gemini is asked (instructions, schema, temperature): tells saved responses
 * apart. `instruction`: the overgenerate one (F17) when overgenerating.
 */
export function promptVersion(instruction: string = GAME_SYSTEM_INSTRUCTION): string {
  return createHash("sha256")
    .update(`${instruction}\n${JSON.stringify(GAME_RESPONSE_SCHEMA)}\n${GAME_PROMPT_TEMPERATURE}`)
    .digest("hex")
    .slice(0, 8);
}

/** Short hash of what the verifier is asked (F16): tells saved verifications apart. */
export function verifyVersion(): string {
  return createHash("sha256")
    .update(`${VERIFY_SYSTEM_INSTRUCTION}\n${JSON.stringify(VERIFY_RESPONSE_SCHEMA)}\n${VERIFY_TEMPERATURE}`)
    .digest("hex")
    .slice(0, 8);
}

export const charCount =(pages: DocumentPage[]) => pages.reduce((n, p) => n + p.contentMd.length, 0);

/**
 * The version of a plan's requests: promptVersion of the one instruction (so single-call hashes
 * don't change), or a hash over every call's instructions and schema for a split request (F30).
 */
export function requestsVersion(requests: GenerationRequest[]): string {
  if (requests.length === 1) return promptVersion(requests[0].systemInstruction);
  return promptVersion(requests.map((r) => `${r.systemInstruction}\n${JSON.stringify(r.responseSchema)}`).join("\n---\n"));
}

/**
 * A document's calls as generateGame sends them (in parallel, joined; F30), timed. `run` has
 * the wall time and summed usage, with one entry per successful call in `parts`.
 */
export async function generateTimed(title: string, pages: DocumentPage[], requests: GenerationRequest[]) {
  const started = Date.now();
  const out = await generateSplit(requests, async (request) => {
    const t = Date.now();
    const r = await generateDocumentPrompts(title, pages, request);
    const part: RunInfo = { model: r.model, seconds: (Date.now() - t) / 1000, usage: r.usage, costUsd: estimateCostUsd(r.model, r.usage) };
    return { response: r.response, part };
  });
  const parts = out.parts.map((p) => p.part);
  const sum = (k: keyof RunInfo["usage"]) => parts.reduce((n, p) => n + p.usage[k], 0);
  const run: RunInfo = {
    model: [...new Set(parts.map((p) => p.model))].join("+"),
    seconds: (Date.now() - started) / 1000,
    usage: { inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"), thinkingTokens: sum("thinkingTokens") },
    costUsd: parts.every((p) => p.costUsd !== null) ? parts.reduce((n, p) => n + p.costUsd!, 0) : null,
    ...(requests.length > 1 ? { parts } : {}),
  };
  return { response: out.response, run, failed: out.failed };
}
