// Sonar (F32): the speech bubble that pops from the mascot on Reveal, Topic and Module pages.
// Templated from the model and a few facts the route gathers, no LLM. Pure and client-safe.
// Spec: docs/architecture/sonar.md (Q10). Served by GET /api/sonar/bubble.

import type { Bubble, PageContext, SonarModel } from "./types";

/** What the route gathers for the page; each field only for the page kinds that need it. */
export type BubbleFacts = {
  /** The learner model (topic pages). */
  model?: SonarModel | null;
  /** The Run on a Reveal page: its wrong and timed-out Prompts. */
  run?: { misses: number; prompts: number; topicTitle: string | null; gameTitle: string } | null;
  /** The Module page: misses on its Games in the last 7 days, grouped by source file, most first. */
  module?: { misses: number; files: { filename: string; misses: number }[] } | null;
};

/** Below this, a Topic the Course calls passed gets the "I'm hearing…" nudge. */
export const MASTERY_NUDGE = 0.7;
/** The Module bubble needs at least this many misses in the last 7 days. */
export const MODULE_MISSES_MIN = 3;
export const MAX_BUBBLE_CHARS = 70;

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Shortens `s` to fit `max` characters, with an ellipsis. */
function fit(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

function bubble(text: string, tone: NonNullable<Bubble>["tone"], prompt: string): Bubble {
  return { text: fit(text, MAX_BUBBLE_CHARS), tone, prompt };
}

/** The bubble for this page, or null when Sonar has nothing worth saying. */
export function bubbleFor(ctx: PageContext, facts: BubbleFacts): Bubble {
  switch (ctx.kind) {
    case "reveal":
      return revealBubble(facts.run);
    case "topic":
      return ctx.courseSlug === "python-basics" && ctx.topicSlug ? topicBubble(ctx.topicSlug, facts.model) : null;
    case "module":
      return moduleBubble(facts.module);
    default:
      return null;
  }
}

function revealBubble(run: BubbleFacts["run"]): Bubble {
  if (!run || run.prompts === 0) return null;
  if (run.misses === 0) return bubble("Clean run! Not a single miss. Eee-eee! 🐬", "cheer", "What should I learn next?");
  const on = run.topicTitle ?? run.gameTitle;
  const what = `${run.misses} miss${run.misses === 1 ? "" : "es"}`;
  const text = `${what} on ${on}… want to know why?`;
  return bubble(text.length <= MAX_BUBBLE_CHARS ? text : `${what} this run… want to know why?`, "nudge", "Why did I miss those in my last run?");
}

function topicBubble(slug: string, model: SonarModel | null | undefined): Bubble {
  if (!model || model.observations === 0) return null;
  const topic = model.topics.find((t) => t.slug === slug);
  if (!topic) return null;
  const root = model.rootCause;
  const rootConcept = root ? model.concepts.find((c) => c.id === root.conceptId) : undefined;
  if (rootConcept && rootConcept.topicSlug === slug) {
    return bubble(
      `I traced your misses back to ${rootConcept.name.toLowerCase()} here!`,
      "alert",
      `Why is ${rootConcept.name} causing my mistakes?`,
    );
  }
  if (topic.coursePassed && topic.sonarMastery < MASTERY_NUDGE) {
    return bubble(
      `Course says passed. I'm hearing ${pct(topic.sonarMastery)}…`,
      "nudge",
      `Why do you think I haven't mastered ${topic.title}?`,
    );
  }
  return null;
}

function moduleBubble(m: BubbleFacts["module"]): Bubble {
  if (!m || m.misses < MODULE_MISSES_MIN) return null;
  const top = m.files[0];
  const text = top
    ? `You missed ${top.misses} on ${fit(top.filename, 30)}. Want me to dig in?`
    : `You missed ${m.misses} in this Module. Want me to dig in?`;
  return bubble(text, "nudge", "What am I getting wrong in this Module?");
}
