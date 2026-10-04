// Sonar (F32): the planner. Ranks the top 3 next Actions (existing Topic Practice Games, or the
// reading) from the learner model. Pure, client-safe, templated `why` lines (no LLM).
// Spec: docs/architecture/sonar.md § Learner model (Ranked next actions).

import type { ModeId } from "@/lib/modes";
import { descendants, prerequisites, type Edge } from "./graph";
import type { Action, ConceptState, RootCause } from "./types";

export const FRONTIER_PREREQ = 0.7;
export const MAX_ACTIONS = 3;

export type PlanTopic = {
  slug: string;
  number: number;
  title: string;
  coursePassed: boolean;
  /** The Course's unlock rule (lib/courses/rules.ts lockedTopics). */
  locked: boolean;
  games: { gameId: string; mode: ModeId; title: string }[];
};

export type PlanInput = {
  concepts: readonly ConceptState[];
  edges: readonly Edge[];
  topics: readonly PlanTopic[];
  rootCause: RootCause | null;
  observations: number;
  /** Modes each Concept was observed in (lib/sonar/model.ts replay). */
  modesSeen: Record<string, ModeId[]>;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const COURSE = "python-basics";

type Play = Extract<Action, { kind: "play" }>;
type Read = Extract<Action, { kind: "read" }>;

function play(t: PlanTopic, modes: ModeId[], conceptId: string | null, why: string): Play | null {
  for (const m of modes) {
    const g = t.games.find((x) => x.mode === m);
    if (g) return { kind: "play", gameId: g.gameId, mode: g.mode, title: g.title, conceptId, topicSlug: t.slug, why, source: "planner", rank: null };
  }
  return null;
}

function read(t: PlanTopic, c: ConceptState | null): Read {
  const pages = c?.pages.length ? `${c.pages.length > 1 ? "Pages" : "Page"} ${c.pages.join(", ")}` : "The reading";
  return {
    kind: "read",
    href: `/explore/${COURSE}/${t.slug}`,
    title: c ? `Read: ${c.name}` : `Read: ${t.title}`,
    why: c ? `${pages} of Topic ${t.number}, ${t.title}, teach ${c.name}.` : `Topic ${t.number}, ${t.title}: start with the reading.`,
    source: "planner",
  };
}

/** The top 3 Actions, best first. Never a locked Topic's Game. */
export function planActions(input: PlanInput): Action[] {
  const { concepts, edges, topics, rootCause, observations, modesSeen } = input;
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const topicOf = (c: ConceptState) => topics.find((t) => t.slug === c.topicSlug);
  const out: Action[] = [];
  const add = (a: Action | null) => {
    if (!a || out.length >= MAX_ACTIONS) return;
    const key = (x: Action) => (x.kind === "play" ? x.gameId : x.kind === "read" ? x.href : x.title);
    if (out.some((x) => key(x) === key(a))) return;
    out.push(a);
  };

  // A new Player: the first unpassed, unlocked Topic
  if (observations === 0) {
    const t = topics.find((x) => !x.coursePassed && !x.locked) ?? topics[0];
    if (t) {
      add(play(t, ["leap", "dive", "blitz"], null, `Start here: Topic ${t.number}, ${t.title}. Leap is multiple choice, a gentle first look.`));
      add(read(t, null));
      add(play(t, ["blitz", "pairs"], null, `A quick true/false warm-up on ${t.title}.`));
    }
    return rank(out);
  }

  /** One Concept → its Topic's Game in the Mode for its status (+ the reading when weak). */
  const forConcept = (c: ConceptState, why: string) => {
    const t = topicOf(c);
    if (!t || t.locked) return;
    const seen = modesSeen[c.id] ?? [];
    if (c.status === "weak" || c.status === "unseen") {
      add(play(t, ["leap", "dive", "blitz"], c.id, why));
      add(read(t, c));
    } else if (c.status === "learning") {
      add(play(t, ["dive", "apogee", "leap"], c.id, why));
    } else if (seen.every((m) => m === "blitz" || m === "leap")) {
      add(play(t, ["dive", "apogee"], c.id, `${why} Only seen in ${seen.join(" and ")} so far: confirm it with typed recall.`));
    } else {
      const next = topics.find((x) => x.number > t.number && !x.locked && !x.coursePassed);
      add(next ? play(next, ["leap", "dive"], null, `${c.name} is mastered (${pct(c.pEff)}). On to Topic ${next.number}, ${next.title}.`)
               : play(t, ["arena", "apogee"], c.id, `${c.name} is mastered (${pct(c.pEff)}). Test it under pressure.`));
    }
  };

  // 1. The Root cause
  if (rootCause) {
    const c = byId.get(rootCause.conceptId);
    if (c) {
      const on = rootCause.missedOn.map((id) => byId.get(id)?.name ?? id).join(", ");
      forConcept(c, `${c.name} (${pct(c.pEff)}) holds ${pct(rootCause.blameShare)} of the blame for your last misses, on ${on}.`);
    }
  }

  // 2. The frontier: weakest Concept whose prerequisites are all ≥ 0.7, ties → more dependants
  const frontier = concepts
    .filter((c) => c.status !== "mastered" && c.id !== rootCause?.conceptId && !topicOf(c)?.locked)
    .filter((c) => prerequisites(c.id, edges).every((id) => (byId.get(id)?.pEff ?? 0) >= FRONTIER_PREREQ))
    .map((c) => ({ c, deps: descendants(c.id, edges).size }))
    .sort((a, b) => a.c.pEff - b.c.pEff || b.deps - a.deps);
  for (const { c, deps } of frontier) {
    if (out.length >= MAX_ACTIONS) break;
    const after = deps ? ` ${deps} Concept${deps > 1 ? "s" : ""} build on it.` : "";
    forConcept(c, c.n === 0
      ? `Next up: ${c.name}. Its prerequisites are solid.${after}`
      : `${c.name} is at ${pct(c.pEff)} after ${c.n} guesses (${c.wrong} wrong), and its prerequisites are solid.${after}`);
  }

  // 3. A fading Concept → a quick review
  const fading = concepts.filter((c) => c.p >= 0.85 && c.pEff < 0.6).sort((a, b) => a.pEff - b.pEff);
  for (const c of fading) {
    const t = topicOf(c);
    if (!t || t.locked) continue;
    add(play(t, ["blitz", "leap"], c.id, `${c.name} was ${pct(c.p)} but has faded to ${pct(c.pEff)} since you last saw it. A quick review.`));
  }

  // 4. Still short: the weakest seen Concepts, prerequisites or not
  const rest = concepts.filter((c) => c.n > 0 && c.status !== "mastered" && !topicOf(c)?.locked).sort((a, b) => a.pEff - b.pEff);
  for (const c of rest) {
    if (out.length >= MAX_ACTIONS) break;
    forConcept(c, `${c.name} is at ${pct(c.pEff)} after ${c.n} guesses (${c.wrong} wrong).`);
  }
  return rank(out);
}

/** Planner play actions get rank 0–2 in order. */
function rank(actions: Action[]): Action[] {
  return actions.map((a, i) => (a.kind === "play" ? { ...a, rank: i } : a));
}
