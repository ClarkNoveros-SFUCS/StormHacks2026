// Prompt selection (F17): Gemini is asked for ~25 Prompts per document, the checks and the
// verification pass (F16) drop the bad ones, and this keeps the best 15–20 of what's left.
// Spec: docs/architecture/game-generation-pipeline.md § Overgenerate and select (F17).
//
// Greedy: each step takes the candidate with the highest score given what's already chosen,
// so kind balance, page coverage and duplicates are judged against the Prompts kept so far.
// Pure (relative .ts imports) so scripts load it with plain Node and tests drive it directly.

import { normalize } from "../matching/normalize.ts";
import type { Drop } from "./validate.ts";
import type { VerifiablePrompt, VerifyStatus } from "./verify.ts";

/** Keep at least this many per document when there are enough (stop early only above it). */
export const SELECT_MIN = 15;
/** Never keep more than this many per document. */
export const SELECT_MAX = 20;

/** Share of the kept Prompts each kind aims for: half Open (as the instructions ask), the rest split evenly. */
const KIND_TARGET: Record<string, number> = { open: 0.5, cloze: 0.125, definition_to_term: 0.125, ordered_recall: 0.125, odd_one_out: 0.125 };

// Score weights. A typical good Prompt scores 1.0–1.8 on its own; balance and coverage move it ±0.4.
const OPEN_ANSWER_BONUS = 0.1; //    per Answer above 4 (up to 8 more), the Open Prompt's room for Rarity
const MISSING_QUOTE_PENALTY = 0.3; // × the share of its Answers whose quote wasn't found on the page
const NO_HINT_PENALTY = 0.1; //      a single-answer Prompt whose Hint check 5 removed
const VERIFY_PENALTY: Record<VerifyStatus, number> = { verified: 0, trimmed: 0.15, unverified: 0.05 };
const KIND_WEIGHT = 0.4; //          × how far the kind is below (or above) its target share, clamped to ±1
const PAGE_WEIGHT = 0.3; //          × the share of its pages no kept Prompt cites yet
const SIMILAR_TEXT_FROM = 0.4; //    text similarity above this costs (similarity − 0.4)
const OVERLAP_WEIGHT = 0.6; //       × how much its Answers overlap a kept Prompt's (answerOverlap)
/** At or above this, a Prompt is a near-duplicate of a kept one and is never chosen. */
export const NEAR_DUPLICATE = 0.8;
/** Above SELECT_MIN, stop when the best remaining score falls below this. */
export const STOP_BELOW = 0.5;

export type SelectOptions = {
  min?: number;
  max?: number;
  /** The verification pass's result for each Prompt (same order); missing = not run. */
  verification?: (VerifyStatus | undefined)[];
};

export type Selection<P> = { prompts: P[]; dropped: Drop[] };

/** Words that say what kind of question it is rather than what it's about. */
const STOPWORDS = new Set(
  "a an the of in on to for is are be by with and or its it this that these those which what one name give example put steps step order from other three each".split(" "),
);

/** Content words of a text, normalized, crudely singular ("paths" → "path"). */
export function contentWords(text: string): Set<string> {
  const words = normalize(text)
    .split(" ")
    .filter((w) => w && !STOPWORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
  return new Set(words);
}

/** Dice similarity of two texts' content words: 1 for the same words, 0 for none in common. */
export function textSimilarity(a: string, b: string): number {
  const x = contentWords(a);
  const y = contentWords(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return (2 * shared) / (x.size + y.size);
}

/** What a Prompt's Answer is, for comparing two Prompts: Answer names, steps or options. */
function answerSet(p: VerifiablePrompt): Set<string> {
  if (p.kind === "ordered_recall") return new Set((p.items ?? []).map(normalize));
  if (p.kind === "odd_one_out") return new Set((p.options ?? []).map(normalize));
  return new Set(p.answers.map((a) => normalize(a.canonical)));
}

const SINGLE_TYPED = new Set(["cloze", "definition_to_term"]);

/**
 * How much two Prompts ask for the same thing, 0–1 (Jaccard: shared over all): their Open
 * Answers, steps or options; 1 when two single-answer Prompts (cloze, definition) have the
 * same term, i.e. the same fact asked twice. A broad Open Prompt and a narrow one ("Name a
 * graph algorithm", "Name an MST algorithm") share a little; an Open Prompt and a
 * single-answer one may share an Answer freely (0).
 */
export function answerOverlap(a: VerifiablePrompt, b: VerifiablePrompt): number {
  const comparable =
    a.kind === b.kind ? a.kind !== "true_false" && a.kind !== "multiple_choice" : SINGLE_TYPED.has(a.kind) && SINGLE_TYPED.has(b.kind);
  if (!comparable) return 0;
  const x = answerSet(a);
  const y = answerSet(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const k of x) if (y.has(k)) shared++;
  return shared / (x.size + y.size - shared);
}

/** The pages a Prompt cites. */
function pagesOf(p: VerifiablePrompt): number[] {
  return [...new Set([...(p.evidencePage === null ? [] : [p.evidencePage]), ...p.answers.map((a) => a.evidencePage)])];
}

/** A Prompt's score on its own: Answers per Open Prompt, quotes, Hint, verification. */
export function quality(p: VerifiablePrompt & { hint?: string | null }, status?: VerifyStatus): number {
  let score = 1;
  if (p.kind === "open") score += OPEN_ANSWER_BONUS * Math.min(Math.max(p.answers.length - 4, 0), 8);
  if (p.kind === "open" || SINGLE_TYPED.has(p.kind)) {
    const missing = p.answers.filter((a) => a.evidenceQuote === null).length;
    if (p.answers.length) score -= (MISSING_QUOTE_PENALTY * missing) / p.answers.length;
  }
  if (p.kind !== "open" && "hint" in p && p.hint === null) score -= NO_HINT_PENALTY;
  if (status) score -= VERIFY_PENALTY[status];
  return score;
}

/**
 * Keeps the best `min`–`max` (default 15–20) of one document's checked and verified Prompts,
 * in their original order. Greedy: each step adds the candidate with the highest score given
 * what's kept: its quality, plus a bonus for a kind below its target share and for pages no
 * kept Prompt cites, minus penalties for similar text and shared Answers. Near-duplicates of
 * a kept Prompt (text or Answers ≥ 0.8 alike) are never kept. Above `min`, it stops when the
 * best score left is below 0.5. Everything not kept is reported as a `select: …` drop.
 */
export function selectPrompts<P extends VerifiablePrompt & { hint?: string | null }>(prompts: P[], options: SelectOptions = {}): Selection<P> {
  const min = options.min ?? SELECT_MIN;
  const max = Math.max(options.max ?? SELECT_MAX, min);
  const base = prompts.map((p, i) => quality(p, options.verification?.[i]));
  const chosen: number[] = [];
  const kindCount = new Map<string, number>();
  const covered = new Set<number>();
  const nearDuplicateOf = new Map<number, number>();
  const lastScore = new Map<number, number>();

  while (chosen.length < max) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < prompts.length; i++) {
      if (chosen.includes(i) || nearDuplicateOf.has(i)) continue;
      const s = score(i);
      if (s === null) continue;
      lastScore.set(i, s);
      if (s > bestScore) [best, bestScore] = [i, s]; // ties keep the earlier Prompt
    }
    if (best === -1 || (chosen.length >= min && bestScore < STOP_BELOW)) break;
    chosen.push(best);
    const p = prompts[best];
    kindCount.set(p.kind, (kindCount.get(p.kind) ?? 0) + 1);
    for (const page of pagesOf(p)) covered.add(page);
  }

  const kept = new Set(chosen);
  const dropped: Drop[] = [];
  prompts.forEach((p, i) => {
    if (kept.has(i)) return;
    const dup = nearDuplicateOf.get(i);
    const reason =
      dup !== undefined
        ? `select: near-duplicate of "${prompts[dup].text.slice(0, 50)}"`
        : `select: not among the best ${chosen.length} (score ${(lastScore.get(i) ?? base[i]).toFixed(2)})`;
    dropped.push({ prompt: p.text.slice(0, 80), what: "prompt", reason });
  });
  return { prompts: [...chosen].sort((a, b) => a - b).map((i) => prompts[i]), dropped };

  /** Candidate i's score given what's chosen, or null (and remembered) if it's a near-duplicate. */
  function score(i: number): number | null {
    const p = prompts[i];
    let similar = 0;
    let overlap = 0;
    for (const j of chosen) {
      const sim = textSimilarity(p.text, prompts[j].text);
      const ov = answerOverlap(p, prompts[j]);
      if (sim >= NEAR_DUPLICATE || ov >= NEAR_DUPLICATE) {
        nearDuplicateOf.set(i, j);
        return null;
      }
      similar = Math.max(similar, sim);
      overlap = Math.max(overlap, ov);
    }
    const target = KIND_TARGET[p.kind] ?? 0.125;
    const deficit = Math.max(-1, Math.min(1, target * (chosen.length + 1) - (kindCount.get(p.kind) ?? 0)));
    const pages = pagesOf(p);
    const fresh = pages.length ? pages.filter((pg) => !covered.has(pg)).length / pages.length : 0;
    return (
      base[i] +
      KIND_WEIGHT * deficit +
      PAGE_WEIGHT * fresh -
      Math.max(0, similar - SIMILAR_TEXT_FROM) -
      OVERLAP_WEIGHT * overlap
    );
  }
}
