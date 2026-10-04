// Checks on Gemini's response for one Source Document, before anything is stored.
// Spec: docs/architecture/game-generation-pipeline.md § Checks. Pure: no server-only
// imports and relative .ts imports, so scripts/generate-check.ts can load it with Node.
//
// Checks 1-3 and 7 are shared by every Game Mode; 4-6 and Tier assignment are Dive's
// (docs/architecture/game-modes.md). Failing items are dropped, never the whole document,
// and every drop is reported with a reason so the prompt can be tuned.

import { z } from "zod";
import { normalize } from "../matching/normalize.ts";
import { assignOpenTiers, TIERS, type Tier } from "../scoring/tiers.ts";

export const KINDS = ["open", "cloze", "definition_to_term", "ordered_recall", "odd_one_out"] as const;
export type Kind = (typeof KINDS)[number];

export const MAX_OPEN_ANSWERS = 15;
const MIN_OPEN_ANSWERS = 4;
const MAX_QUOTE = 200;

// ---------- Response schema (the flat shape Gemini returns) ----------

const RawAnswer = z.object({
  canonical: z.string(),
  aliases: z.array(z.string()).default([]),
  exact_only: z.boolean().default(false),
  evidence_page: z.number().int(),
  evidence_quote: z.string().nullish(),
});

export const RawPrompt = z.object({
  kind: z.enum(KINDS),
  text: z.string().trim().min(1),
  answers: z.array(RawAnswer).nullish(),
  tier: z.enum(TIERS).nullish(),
  hint: z.string().nullish(),
  explanation: z.string().nullish(),
  items: z.array(z.string()).nullish(),
  options: z.array(z.string()).nullish(),
  correct_option: z.string().nullish(),
  evidence_page: z.number().int().nullish(),
});
export type RawPrompt = z.infer<typeof RawPrompt>;

/** Top level only: each Prompt is parsed on its own so one bad Prompt never drops the rest. */
const RawResponse = z.object({ prompts: z.array(z.unknown()) });

// ---------- Output ----------

export type DocumentPage = { pageNumber: number; contentMd: string };

export type ValidAnswer = {
  canonical: string;
  /** Normalized canonical + Aliases for answer_keys; empty for ordered_recall / odd_one_out. */
  keys: string[];
  exactOnly: boolean;
  evidencePage: number;
  /** Null when the quote wasn't found verbatim on its page. */
  evidenceQuote: string | null;
  tier: Tier;
  /** Open Prompts only: 1 = most obvious. */
  rarityRank: number | null;
};

export type ValidPrompt = {
  kind: Kind;
  text: string;
  tier: Tier | null; // single-answer only
  hint: string | null; // single-answer only; null hides the Hint button
  explanation: string | null;
  items: string[] | null; // ordered_recall, in the correct order
  options: string[] | null; // odd_one_out
  evidencePage: number | null; // ordered_recall, odd_one_out
  answers: ValidAnswer[];
};

export type Drop = { prompt: string; what: string; reason: string };

export type DocumentResult = { prompts: ValidPrompt[]; dropped: Drop[]; quotesCleared: number };

// ---------- Helpers ----------

/** Whole-word containment on normalized text (both sides already normalized). */
export function containsWords(haystack: string, needle: string): boolean {
  return needle !== "" && ` ${haystack} `.includes(` ${needle} `);
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * A typed name's answer_key, or null when normalizing loses it: empty, or one character left
 * from something longer ("A*" → "a" would match the word "a" on every page and as a guess).
 * A genuine one-character name ("C", "R") is kept.
 */
function keyOf(name: string): string | null {
  const n = normalize(name);
  if (!n) return null;
  return n.length > 1 || n === name.trim().toLowerCase() ? n : null;
}

/** answer_keys for canonical + Aliases, deduped, canonical first, unusable ones left out. */
function keysOf(canonical: string, aliases: string[]): string[] {
  return [...new Set([canonical, ...aliases].map(keyOf).filter((k): k is string => k !== null))];
}

function label(raw: unknown): string {
  const text = (raw as { text?: unknown } | null)?.text;
  return typeof text === "string" && text.trim() ? text.trim().slice(0, 80) : "(no text)";
}

// ---------- Per document ----------

/** Validates one document's Gemini response against its pages. Never throws on bad content. */
export function validateDocument(response: unknown, pages: DocumentPage[]): DocumentResult {
  const dropped: Drop[] = [];
  const top = RawResponse.safeParse(response);
  if (!top.success) {
    return { prompts: [], dropped: [{ prompt: "(response)", what: "response", reason: "not { prompts: [...] }" }], quotesCleared: 0 };
  }

  const pageText = new Map(pages.map((p) => [p.pageNumber, p.contentMd]));
  const normalizedPage = new Map(pages.map((p) => [p.pageNumber, normalize(p.contentMd)]));
  let quotesCleared = 0;
  const prompts: ValidPrompt[] = [];

  for (const raw of top.data.prompts) {
    const parsed = RawPrompt.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      dropped.push({ prompt: label(raw), what: "prompt", reason: `schema: ${issue.path.join(".")} ${issue.message}` });
      continue;
    }
    const p = parsed.data;
    const drop = (reason: string, what = "prompt") => dropped.push({ prompt: p.text.slice(0, 80), what, reason });
    const result = p.kind === "ordered_recall" || p.kind === "odd_one_out" ? oneShot(p, drop) : typed(p, drop);
    if (result) prompts.push(result);
  }
  return { prompts, dropped, quotesCleared };

  /** open, cloze, definition_to_term */
  function typed(p: RawPrompt, drop: (reason: string, what?: string) => void): ValidPrompt | null {
    const open = p.kind === "open";
    const tier = p.tier ?? null;
    if (!open && !tier) return drop("single-answer Prompt has no tier"), null;
    const raws = p.answers ?? [];
    if (!open && raws.length !== 1) return drop(`single-answer Prompt has ${raws.length} Answers`), null;

    type Candidate = { canonical: string; keys: string[]; exactOnly: boolean; evidencePage: number; quote: string | null };
    let candidates: Candidate[] = [];
    for (const a of raws) {
      const canonical = a.canonical.trim();
      const keys = keysOf(canonical, a.aliases);
      if (!keyOf(canonical)) {
        drop("its name is lost when normalized", `answer "${canonical}"`);
        continue;
      }
      // Check 1: the cited page exists
      const page = normalizedPage.get(a.evidence_page);
      if (page === undefined) {
        drop(`cites missing page ${a.evidence_page}`, `answer "${canonical}"`);
        continue;
      }
      // Check 2: the page mentions the canonical or an Alias
      if (!keys.some((k) => containsWords(page, k))) {
        drop(`page ${a.evidence_page} doesn't mention it or an Alias`, `answer "${canonical}"`);
        continue;
      }
      candidates.push({ canonical, keys, exactOnly: a.exact_only, evidencePage: a.evidence_page, quote: verifiedQuote(a.evidence_quote, a.evidence_page) });
    }

    // Check 3: alias hygiene. A repeated canonical keeps its first Answer. Any key two
    // Answers share is removed from both; an Answer whose canonical was removed is dropped.
    if (open) {
      const seen = new Set<string>();
      candidates = candidates.filter((c) => {
        const k = normalize(c.canonical);
        if (seen.has(k)) return drop("repeats an earlier Answer", `answer "${c.canonical}"`), false;
        seen.add(k);
        return true;
      });
      const owners = new Map<string, number>();
      for (const c of candidates) for (const k of c.keys) owners.set(k, (owners.get(k) ?? 0) + 1);
      candidates = candidates.filter((c) => {
        if (owners.get(normalize(c.canonical))! > 1) {
          return drop("its name is another Answer's Alias", `answer "${c.canonical}"`), false;
        }
        c.keys = c.keys.filter((k) => owners.get(k) === 1);
        return true;
      });
    }

    if (open) {
      // Check 4: still enough Answers. Above the cap, keep the most obvious ones.
      if (candidates.length < MIN_OPEN_ANSWERS) return drop(`only ${candidates.length} usable Answers (need ${MIN_OPEN_ANSWERS})`), null;
      if (candidates.length > MAX_OPEN_ANSWERS) {
        for (const c of candidates.slice(MAX_OPEN_ANSWERS)) drop(`over the ${MAX_OPEN_ANSWERS}-Answer cap`, `answer "${c.canonical}"`);
        candidates = candidates.slice(0, MAX_OPEN_ANSWERS);
      }
      const tiers = assignOpenTiers(candidates.length);
      return {
        kind: p.kind,
        text: p.text,
        tier: null,
        hint: null,
        explanation: p.explanation?.trim() || null,
        items: null,
        options: null,
        evidencePage: null,
        answers: candidates.map((c, i) => answer(c, tiers[i], i + 1)),
      };
    }

    const [only] = candidates;
    if (!only) return drop("its Answer was dropped"), null;
    return {
      kind: p.kind,
      text: p.text,
      tier,
      hint: checkedHint(p.hint, only.keys), // check 5
      explanation: p.explanation?.trim() || null,
      items: null,
      options: null,
      evidencePage: null,
      answers: [answer(only, tier!, null)],
    };

    function answer(c: Candidate, t: Tier, rarityRank: number | null): ValidAnswer {
      return { canonical: c.canonical, keys: c.keys, exactOnly: c.exactOnly, evidencePage: c.evidencePage, evidenceQuote: c.quote, tier: t, rarityRank };
    }
  }

  /** ordered_recall, odd_one_out: one stored Answer, no answer_keys (compared exactly by the run engine). */
  function oneShot(p: RawPrompt, drop: (reason: string) => void): ValidPrompt | null {
    if (!p.tier) return drop("single-answer Prompt has no tier"), null;
    // Check 1: the cited page exists
    const page = p.evidence_page == null ? undefined : normalizedPage.get(p.evidence_page);
    if (page === undefined) return drop(`cites missing page ${p.evidence_page}`), null;
    const base = { text: p.text, tier: p.tier, explanation: p.explanation?.trim() || null, evidencePage: p.evidence_page! };

    if (p.kind === "ordered_recall") {
      // Check 6: 3-6 distinct items
      const items = (p.items ?? []).map((s) => s.trim());
      if (items.length < 3 || items.length > 6) return drop(`has ${items.length} items (need 3-6)`), null;
      if (new Set(items.map(normalize)).size !== items.length || items.some((s) => !normalize(s))) return drop("items aren't distinct"), null;
      return {
        ...base,
        kind: p.kind,
        hint: p.hint?.trim() || null,
        items,
        options: null,
        answers: [{ canonical: "correct order", keys: [], exactOnly: false, evidencePage: base.evidencePage, evidenceQuote: null, tier: p.tier, rarityRank: null }],
      };
    }

    // Check 6: exactly 4 distinct options including correct_option (exact: the run engine compares exactly)
    const options = (p.options ?? []).map((s) => s.trim());
    const correct = p.correct_option?.trim() ?? "";
    if (options.length !== 4 || new Set(options.map(normalize)).size !== 4 || options.some((s) => !normalize(s))) {
      return drop("needs exactly 4 distinct options"), null;
    }
    if (!options.includes(correct)) return drop("correct_option isn't one of the options"), null;
    // Check 2: a page mentions the correct option. Gemini often cites the page about the other
    // three, so fall back to the first page that does; the option must still be in the file.
    let evidencePage = base.evidencePage;
    if (!containsWords(page, normalize(correct))) {
      const other = pages.find((pg) => containsWords(normalizedPage.get(pg.pageNumber)!, normalize(correct)));
      if (!other) return drop("no page mentions the correct option"), null;
      evidencePage = other.pageNumber;
    }
    return {
      ...base,
      evidencePage,
      kind: p.kind,
      hint: checkedHint(p.hint, [normalize(correct)]), // check 5
      items: null,
      options,
      answers: [{ canonical: correct, keys: [], exactOnly: false, evidencePage, evidenceQuote: null, tier: p.tier, rarityRank: null }],
    };
  }

  /** Check 5: a Hint that names the Answer (any key, as a whole word) is removed. */
  function checkedHint(hint: string | null | undefined, keys: string[]): string | null {
    const h = hint?.trim();
    if (!h) return null;
    const n = normalize(h);
    return keys.some((k) => containsWords(n, k)) ? null : h;
  }

  /** The quote if it's on its page (whitespace-insensitive) and short enough; else null. */
  function verifiedQuote(quote: string | null | undefined, pageNumber: number): string | null {
    const q = quote ? collapse(quote) : "";
    if (!q) return null;
    const page = collapse(pageText.get(pageNumber) ?? "");
    if (q.length <= MAX_QUOTE && (page.includes(q) || page.toLowerCase().includes(q.toLowerCase()))) return q;
    quotesCleared++;
    return null;
  }
}

// ---------- Across documents ----------

/**
 * Check 7: the same Prompt text (normalized) in two places keeps the first. Takes each
 * document's result in document order; returns the kept Prompts tagged with their document.
 */
export function dedupeAcrossDocuments<D, P extends { text: string } = ValidPrompt>(docs: { doc: D; prompts: P[] }[]) {
  const seen = new Set<string>();
  const kept: { doc: D; prompt: P }[] = [];
  const dropped: Drop[] = [];
  for (const { doc, prompts } of docs) {
    for (const prompt of prompts) {
      const key = normalize(prompt.text);
      if (seen.has(key)) {
        dropped.push({ prompt: prompt.text.slice(0, 80), what: "prompt", reason: "duplicate Prompt text" });
        continue;
      }
      seen.add(key);
      kept.push({ doc, prompt });
    }
  }
  return { kept, dropped };
}
