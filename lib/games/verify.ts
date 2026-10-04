// Verification pass (F16): what a second Gemini call per Source Document is shown, and how its
// verdicts are applied to the Prompts that passed the Mode's checks. Code checks only confirm
// an Answer is *mentioned* on its page; this asks whether the page shows it actually answers
// the Prompt, and whether each Prompt is clear and not a reworded duplicate.
// Spec: docs/architecture/game-generation-pipeline.md § Verification pass (F16).
//
// Pure (relative .ts imports, no Gemini import) so scripts load it with plain Node and tests
// drive it with a fake verifier. The Gemini side lives in lib/gemini/verify.ts.

import type { GeminiUsage } from "../gemini.ts";
import { assignOpenTiers } from "../scoring/tiers.ts";
import { z } from "zod";
import { MIN_OPEN_ANSWERS, type DocumentPage, type Drop, type ValidAnswer } from "./validate.ts";

/** Any checked Prompt: Dive's ValidPrompt or another Mode's GeneratedPrompt. */
export type VerifiablePrompt = {
  kind: string;
  text: string;
  items: string[] | null;
  options: string[] | null;
  evidencePage: number | null;
  answers: ValidAnswer[];
};

// ---------- What the verifier is shown ----------

export type VerifyQuestion = {
  /** "P1", "P2", … in document order. */
  id: string;
  kind: string;
  text: string;
  options?: string[];
  items?: string[];
  /** Ids "P1.A1", …; `answer` is the canonical ("True"/"False" for true_false, "correct order" for ordered_recall). */
  answers: { id: string; answer: string; page: number; quote: string | null }[];
};

export type VerifyInput = { questions: VerifyQuestion[]; /** Only the pages something cites. */ pages: DocumentPage[] };

const promptId = (i: number) => `P${i + 1}`;
const answerId = (i: number, j: number) => `P${i + 1}.A${j + 1}`;

/** The questions (with their Answers, pages and quotes) and the text of every cited page. */
export function verificationInput(prompts: VerifiablePrompt[], pages: DocumentPage[]): VerifyInput {
  const cited = new Set<number>();
  const questions = prompts.map((p, i): VerifyQuestion => {
    if (p.evidencePage !== null) cited.add(p.evidencePage);
    return {
      id: promptId(i),
      kind: p.kind,
      text: p.text,
      ...(p.options ? { options: p.options } : {}),
      ...(p.items ? { items: p.items } : {}),
      answers: p.answers.map((a, j) => {
        cited.add(a.evidencePage);
        return { id: answerId(i, j), answer: a.canonical, page: a.evidencePage, quote: a.evidenceQuote };
      }),
    };
  });
  return { questions, pages: pages.filter((p) => cited.has(p.pageNumber)) };
}

// ---------- Applying the verdicts ----------

const AnswerVerdict = z.object({ id: z.string(), supports: z.boolean(), reason: z.string().nullish() });
const PromptVerdict = z.object({
  id: z.string(),
  clear: z.boolean(),
  duplicate_of: z.string().nullish(),
  reason: z.string().nullish(),
  answers: z.array(z.unknown()).nullish(),
});
const Verdicts = z.object({ prompts: z.array(z.unknown()) });

/** What the pass said about a kept Prompt: all verified, some Open Answers removed, or no verdict. */
export type VerifyStatus = "verified" | "trimmed" | "unverified";

export type Applied<P> = {
  prompts: P[];
  /** One per kept Prompt, same order (used by selectPrompts, F17). */
  statuses: VerifyStatus[];
  dropped: Drop[];
  /** Answers the verifier judged unsupported (any kind). */
  answersRemoved: number;
  /** Prompts removed: unclear, duplicate, an unsupported single Answer, or too few supported Open Answers. */
  promptsRemoved: number;
  /** Prompts with no usable verdict, kept as they were. */
  unverified: number;
};

/**
 * Applies the verifier's response to the Prompts it was shown (same order). Drops unsupported
 * Answers, then re-runs check 4 (≥ 4 Open Answers) and Tier assignment; drops unclear Prompts
 * and duplicates of an earlier kept Prompt. A Prompt or Answer without a verdict is kept.
 * Throws only when the response isn't `{ prompts: [...] }` (the caller keeps everything).
 */
export function applyVerdicts<P extends VerifiablePrompt>(prompts: P[], response: unknown): Applied<P> {
  const top = Verdicts.safeParse(response);
  if (!top.success) throw new Error("verification response isn't { prompts: [...] }");
  const byId = new Map<string, z.infer<typeof PromptVerdict>>();
  for (const raw of top.data.prompts) {
    const v = PromptVerdict.safeParse(raw);
    if (v.success && !byId.has(v.data.id.trim())) byId.set(v.data.id.trim(), v.data);
  }

  const dropped: Drop[] = [];
  const kept: P[] = [];
  const statuses: VerifyStatus[] = [];
  const keptIds = new Set<string>();
  let answersRemoved = 0;
  let unverified = 0;
  const because = (reason: string | null | undefined) => (reason?.trim() ? ` (${reason.trim().slice(0, 120)})` : "");

  prompts.forEach((p, i) => {
    const id = promptId(i);
    const label = p.text.slice(0, 80);
    const drop = (reason: string, what = "prompt") => dropped.push({ prompt: label, what, reason: `verify: ${reason}` });
    const v = byId.get(id);
    if (!v) {
      unverified++;
      kept.push(p);
      statuses.push("unverified");
      keptIds.add(id);
      return;
    }
    if (!v.clear) return drop(`unclear Prompt${because(v.reason)}`);
    const dup = v.duplicate_of?.trim();
    if (dup && dup !== id && keptIds.has(dup)) {
      return drop(`same as an earlier Prompt ("${prompts[Number(dup.slice(1)) - 1].text.slice(0, 50)}")`);
    }

    const supports = new Map<string, z.infer<typeof AnswerVerdict>>();
    for (const raw of v.answers ?? []) {
      const a = AnswerVerdict.safeParse(raw);
      if (a.success) supports.set(a.data.id.trim(), a.data);
    }
    const unsupported = p.answers.flatMap((a, j) => {
      const verdict = supports.get(answerId(i, j));
      return verdict && !verdict.supports ? [{ a, verdict }] : [];
    });
    answersRemoved += unsupported.length;
    if (!unsupported.length) return keep(p, "verified");

    if (p.kind !== "open") {
      // Single-answer kinds: the Prompt's only Answer (the term, option, order or truth value) is wrong
      return drop(`its Answer "${p.answers[0].canonical}" isn't supported${because(unsupported[0].verdict.reason)}`);
    }
    for (const { a, verdict } of unsupported) drop(`not supported by its page${because(verdict.reason)}`, `answer "${a.canonical}"`);
    const left = p.answers.filter((a) => !unsupported.some((u) => u.a === a));
    // Check 4 again, then Tiers again: the order (most obvious first) is unchanged
    if (left.length < MIN_OPEN_ANSWERS) return drop(`only ${left.length} supported Answers (need ${MIN_OPEN_ANSWERS})`);
    const tiers = assignOpenTiers(left.length);
    keep({ ...p, answers: left.map((a, k) => ({ ...a, tier: tiers[k], rarityRank: k + 1 })) }, "trimmed");

    function keep(prompt: P, status: VerifyStatus) {
      kept.push(prompt);
      statuses.push(status);
      keptIds.add(id);
    }
  });

  return { prompts: kept, statuses, dropped, answersRemoved, promptsRemoved: prompts.length - kept.length, unverified };
}

// ---------- One document ----------

/** Sends one document's questions to the verifier and returns its raw JSON (lib/gemini/verify.ts, or a fake). */
export type VerifyCall = (title: string, input: VerifyInput) => Promise<{ response: unknown; model?: string; usage?: GeminiUsage }>;

export type VerifyOutcome<P> = Applied<P> & {
  /** 'failed': the call or its response failed, and every Prompt was kept unverified. */
  status: "verified" | "failed" | "skipped";
  error: string | null;
  seconds: number;
  model: string | null;
  usage: GeminiUsage | null;
  /** The verifier's raw response, for saving (scripts). */
  response: unknown;
};

/**
 * Verifies one document's checked Prompts. Never throws: if the call or its response fails,
 * every Prompt is kept unverified and `status` is 'failed' (the caller logs it), so a
 * verification problem never fails the Game.
 */
export async function verifyDocument<P extends VerifiablePrompt>(
  title: string,
  pages: DocumentPage[],
  prompts: P[],
  call: VerifyCall,
): Promise<VerifyOutcome<P>> {
  const unchanged = (status: "failed" | "skipped", error: string | null, seconds = 0): VerifyOutcome<P> => ({
    prompts, statuses: prompts.map(() => "unverified" as const), dropped: [], answersRemoved: 0, promptsRemoved: 0, unverified: prompts.length,
    status, error, seconds, model: null, usage: null, response: null,
  });
  if (!prompts.length) return unchanged("skipped", null);
  const started = Date.now();
  try {
    const out = await call(title, verificationInput(prompts, pages));
    const seconds = (Date.now() - started) / 1000;
    const applied = applyVerdicts(prompts, out.response);
    return { ...applied, status: "verified", error: null, seconds, model: out.model ?? null, usage: out.usage ?? null, response: out.response };
  } catch (err) {
    const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : "";
    return unchanged("failed", `${err instanceof Error ? err.message : String(err)}${cause}`, (Date.now() - started) / 1000);
  }
}
