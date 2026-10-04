// Sonar (F32): the learner model. Replays a Player's guesses through Bayesian Knowledge Tracing
// (BKT), noisy-AND over a Prompt's Concepts. Pure, client-safe. Spec: docs/architecture/sonar.md
// § Learner model.

import type { ModeId, PromptKind } from "@/lib/modes";
import type { Concept, ConceptState, ConceptStatus } from "./types";

export const PRIOR = 0.3;
export const LEARN = 0.1; // T: chance to learn a Concept from one observation
export const HALF_LIFE_HOURS = 72;
/** Weight of a fallback observation (Prompt with no tag, credited to its Topic's weakest Concept). */
export const FALLBACK_WEIGHT = 0.5;
/** Root cause and ConceptState.blame look at this many recent misses. */
export const RECENT_MISSES = 10;

export type Evidence = { guess: number; slip: number };

/** P(guess) and P(slip) for one observation: the Mode, the Prompt kind and whether a hint was used. */
export function evidenceFor(mode: ModeId, kind: PromptKind, hintUsed: boolean): Evidence {
  if (mode === "pairs") return { guess: 0.2, slip: 0.1 };
  if (mode === "blitz" || kind === "true_false") return { guess: 0.5, slip: 0.15 };
  if (mode === "leap" || mode === "arena" || kind === "multiple_choice") {
    return mode === "leap" && hintUsed ? { guess: 0.5, slip: 0.1 } : { guess: 0.25, slip: 0.1 };
  }
  // Dive / Apogee. guess_events.hint_used = the Hint was revealed (Leap: the 50/50).
  if (hintUsed) return { guess: 0.3, slip: 0.1 };
  if (kind === "ordered_recall") return { guess: 0.05, slip: 0.15 };
  if (kind === "odd_one_out") return { guess: 0.25, slip: 0.1 };
  return { guess: 0.05, slip: 0.1 }; // open, cloze, definition_to_term
}

/**
 * One BKT step over k ≤ 3 Concepts (noisy-AND): P(correct | all known) = 1 − slip, else guess.
 * Enumerates the 2^k knowledge states for each Concept's exact posterior, then applies T.
 * `blame` is each Concept's share of the drop on a miss (sums to 1; all 0 when right).
 */
export function bktStep(priors: readonly number[], correct: boolean, e: Evidence, T = LEARN): { next: number[]; blame: number[] } {
  const k = priors.length;
  const known = new Array<number>(k).fill(0);
  let total = 0;
  for (let s = 0; s < 1 << k; s++) {
    let w = 1;
    for (let i = 0; i < k; i++) w *= s & (1 << i) ? priors[i] : 1 - priors[i];
    const allKnown = s === (1 << k) - 1;
    const pRight = allKnown ? 1 - e.slip : e.guess;
    const like = w * (correct ? pRight : 1 - pRight);
    total += like;
    for (let i = 0; i < k; i++) if (s & (1 << i)) known[i] += like;
  }
  const post = known.map((x, i) => (total > 0 ? x / total : priors[i]));
  const drops = post.map((p, i) => Math.max(0, priors[i] - p));
  const sum = drops.reduce((a, b) => a + b, 0);
  const blame = !correct && sum > 0 ? drops.map((d) => d / sum) : drops.map(() => 0);
  return { next: post.map((p) => p + (1 - p) * T), blame };
}

/** p after forgetting: halves every 72 hours since it was last seen. */
export function effective(p: number, lastSeen: Date | null, now: Date): number {
  if (!lastSeen) return p;
  const hours = Math.max(0, (now.getTime() - lastSeen.getTime()) / 3_600_000);
  return p * 2 ** (-hours / HALF_LIFE_HOURS);
}

export function statusOf(pEff: number, n: number): ConceptStatus {
  if (n === 0) return "unseen";
  if (pEff >= 0.85 && n >= 3) return "mastered";
  return pEff >= 0.5 ? "learning" : "weak";
}

/** One guess (or timeout) to replay. `concepts` primary first; `fallback` = untagged Prompt, Topic's Concepts. */
export type Observation = {
  at: Date;
  concepts: string[];
  fallback: boolean;
  correct: boolean;
  mode: ModeId;
  kind: PromptKind;
  hintUsed: boolean;
};

/** A miss with each Concept's share of its blame. `on` = the Concept the Prompt mainly tests. */
export type Miss = { at: Date; on: string; blame: Record<string, number> };

export type Replay = {
  concepts: ConceptState[];
  misses: Miss[];
  /** Modes each Concept was observed in. */
  modesSeen: Record<string, ModeId[]>;
};

/**
 * Replays observations (oldest first). A fallback observation updates only the Topic's
 * lowest-p Concept, as a single-Concept step moved halfway (FALLBACK_WEIGHT): weaker evidence
 * than a real tag, and it doesn't smear one Prompt over every Concept of the Topic.
 */
export function replay(graph: readonly Concept[], observations: readonly Observation[], now: Date): Replay {
  const p = new Map(graph.map((c) => [c.id, PRIOR]));
  const n = new Map<string, number>();
  const right = new Map<string, number>();
  const wrong = new Map<string, number>();
  const last = new Map<string, Date>();
  const modes = new Map<string, Set<ModeId>>();
  const misses: Miss[] = [];

  for (const o of observations) {
    let ids = [...new Set(o.concepts.filter((id) => p.has(id)))].slice(0, 3);
    if (ids.length === 0) continue;
    if (o.fallback) ids = [ids.reduce((a, b) => (p.get(b)! < p.get(a)! ? b : a))];
    const priors = ids.map((id) => p.get(id)!);
    const step = bktStep(priors, o.correct, evidenceFor(o.mode, o.kind, o.hintUsed));
    ids.forEach((id, i) => {
      const next = o.fallback ? priors[i] + FALLBACK_WEIGHT * (step.next[i] - priors[i]) : step.next[i];
      p.set(id, next);
      n.set(id, (n.get(id) ?? 0) + 1);
      (o.correct ? right : wrong).set(id, ((o.correct ? right : wrong).get(id) ?? 0) + 1);
      last.set(id, o.at);
      modes.set(id, (modes.get(id) ?? new Set()).add(o.mode));
    });
    if (!o.correct) misses.push({ at: o.at, on: ids[0], blame: Object.fromEntries(ids.map((id, i) => [id, step.blame[i]])) });
  }

  const recent = misses.slice(-RECENT_MISSES);
  const blame = new Map<string, number>();
  for (const m of recent) for (const [id, b] of Object.entries(m.blame)) blame.set(id, (blame.get(id) ?? 0) + b);

  const concepts = graph.map((c): ConceptState => {
    const pp = p.get(c.id)!;
    const seen = last.get(c.id) ?? null;
    const pEff = effective(pp, seen, now);
    const count = n.get(c.id) ?? 0;
    return {
      ...c,
      p: pp,
      pEff,
      n: count,
      right: right.get(c.id) ?? 0,
      wrong: wrong.get(c.id) ?? 0,
      lastSeen: seen ? seen.toISOString() : null,
      status: statusOf(pEff, count),
      blame: recent.length ? (blame.get(c.id) ?? 0) / recent.length : 0,
    };
  });
  return { concepts, misses, modesSeen: Object.fromEntries([...modes].map(([id, s]) => [id, [...s]])) };
}
