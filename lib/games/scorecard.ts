// Generation scorecard (F14): numbers for one document's Gemini response after the checks,
// so prompt and check changes are compared on real decks instead of by eye.
// Spec: docs/architecture/game-generation-pipeline.md § Improving output quality.
// Pure, with relative .ts imports, so scripts/generate-eval.ts can load it with plain Node.

import type { GeminiUsage } from "../gemini.ts";
import { dedupeAcrossDocuments, KINDS, RawPrompt, validateDocument, type DocumentPage, type Drop, type Kind, type ValidPrompt } from "./validate.ts";
import { selectPrompts } from "./select.ts";
import { applyVerdicts } from "./verify.ts";

/** The Gemini call that produced a response, as recorded when it was saved. */
export type RunInfo = { model: string; seconds: number; usage: GeminiUsage; costUsd: number | null };

/** What scripts write with --save: the raw response plus how it was made. */
export type SavedResponse = {
  deck: string;
  createdAt: string;
  /** Hash of the instructions, schema and temperature (see promptVersion in scripts/deck-pages.ts). */
  promptVersion: string;
  run: RunInfo;
  response: unknown;
};

/** What scripts write for a verification call (F16): the verifier's raw response plus how it was made. */
export type SavedVerification = {
  deck: string;
  createdAt: string;
  /** Hash of the verification instructions, schema and temperature (verifyVersion in scripts/deck-pages.ts). */
  verifyVersion: string;
  run: RunInfo;
  /** The texts of the Prompts it judged, in order: verdicts only apply to these exact Prompts. */
  prompts: string[];
  response: unknown;
};

/** The verification pass's effect on one document (F16). */
export type VerifyCard = {
  /** Answers the verifier judged unsupported. */
  answersRemoved: number;
  /** Prompts it removed: unclear, duplicate, unsupported single Answer, or under 4 Open Answers. */
  promptsRemoved: number;
  /** Prompts it gave no usable verdict for (kept). */
  unverified: number;
  drops: Drop[];
};

/** The selection step's effect on one document (F17). */
export type SelectCard = {
  /** Prompts it chose from (after the checks and the verification pass). */
  candidates: number;
  /** Prompts it didn't keep. */
  removed: number;
  drops: Drop[];
};

export type Scorecard = {
  /** The Prompts that survive the checks (and the verification pass and selection, if run), as they'd be stored. */
  prompts: ValidPrompt[];
  returned: number;
  kept: number;
  kinds: Record<Kind, number>;
  kindsCovered: number;
  openPrompts: number;
  /** Mean kept Answers per kept Open Prompt; null without Open Prompts. */
  answersPerOpen: number | null;
  /** Kept Answers that carry a quote: open, cloze, definition_to_term. */
  quotedAnswers: number;
  /** Of those, how many quotes were found on their page. */
  quotesVerified: number;
  /** Kept cloze / definition_to_term / odd_one_out Prompts whose response had a Hint (check 5 applies). */
  hintsGiven: number;
  /** Of those, Hints removed by check 5 for naming the Answer. */
  hintsRemoved: number;
  promptsDropped: number;
  answersDropped: number;
  /** Short reason code → count, over Prompt and Answer drops (see dropCode). */
  dropsByReason: Record<string, number>;
  /** At least 7 Prompts, enough for a one-document Game. */
  enoughForGame: boolean;
  /** Code-check drops only; the verification pass's are in `verify.drops`. */
  drops: Drop[];
  /** Null when no verification verdicts were given. */
  verify: VerifyCard | null;
  /** Null unless selection (F17) was applied. */
  select: SelectCard | null;
};

const HINT_CHECKED: readonly Kind[] = ["cloze", "definition_to_term", "odd_one_out"];
const MIN_GAME_PROMPTS = 7;

// validate.ts reasons → short codes. Order matters: the first match wins.
const DROP_CODES: [RegExp, string][] = [
  [/^not \{ prompts/, "bad-response"],
  [/^schema:/, "schema"],
  [/has no tier/, "no-tier"],
  [/^single-answer Prompt has \d+ Answers/, "answer-count"],
  [/lost when normalized/, "unusable-name"],
  [/^cites missing page/, "missing-page"],
  [/doesn't mention it or an Alias/, "not-on-page"],
  [/^repeats an earlier Answer/, "repeat"],
  [/another Answer's Alias/, "alias-clash"],
  [/usable Answers \(need/, "too-few-answers"],
  [/-Answer cap/, "over-cap"],
  [/^its Answer was dropped/, "answer-dropped"],
  [/items/, "items"],
  [/no page mentions the correct option/, "option-not-on-page"],
  [/options|correct_option/, "options"],
  [/^duplicate Prompt text/, "duplicate"],
];

/** A short, stable code for a drop reason (numbers stripped when nothing matches). */
export function dropCode(reason: string): string {
  return DROP_CODES.find(([re]) => re.test(reason))?.[1] ?? reason.replace(/\d+/g, "N");
}

/**
 * Scores one document's response against its pages, exactly as generateGame checks it. With
 * `verdicts` (the verifier's raw response for the checked Prompts, in order), the verification
 * pass is applied too, and with `select` (F17, overgenerating) then selectPrompts; the numbers
 * describe what survives. Throws if `verdicts` is malformed.
 */
export function scoreDocument(response: unknown, pages: DocumentPage[], verdicts?: unknown, { select = false } = {}): Scorecard {
  const result = validateDocument(response, pages);
  const { kept, dropped: duplicates } = dedupeAcrossDocuments([{ doc: 0, prompts: result.prompts }]);
  const checked = kept.map((k) => k.prompt);
  const applied = verdicts === undefined ? null : applyVerdicts(checked, verdicts);
  const verified = applied ? applied.prompts : checked;
  const selected = select ? selectPrompts(verified, { verification: applied?.statuses }) : null;
  const prompts = selected ? selected.prompts : verified;
  const drops = [...result.dropped, ...duplicates];
  const rawPrompts = (response as { prompts?: unknown } | null)?.prompts;
  const raws = Array.isArray(rawPrompts) ? rawPrompts : [];

  // The Hint each Prompt had before check 5, by text (validated Prompts keep the trimmed text).
  const rawHint = new Map<string, string>();
  for (const raw of raws) {
    const p = RawPrompt.safeParse(raw);
    if (p.success && p.data.hint?.trim()) rawHint.set(p.data.text, p.data.hint.trim());
  }

  const kinds = Object.fromEntries(KINDS.map((k) => [k, prompts.filter((p) => p.kind === k).length])) as Record<Kind, number>;
  const open = prompts.filter((p) => p.kind === "open");
  const quoted = prompts.filter((p) => p.kind === "open" || p.kind === "cloze" || p.kind === "definition_to_term").flatMap((p) => p.answers);
  const hinted = prompts.filter((p) => HINT_CHECKED.includes(p.kind) && rawHint.has(p.text));
  const dropsByReason: Record<string, number> = {};
  for (const d of drops) dropsByReason[dropCode(d.reason)] = (dropsByReason[dropCode(d.reason)] ?? 0) + 1;

  return {
    prompts,
    returned: raws.length,
    kept: prompts.length,
    kinds,
    kindsCovered: KINDS.filter((k) => kinds[k] > 0).length,
    openPrompts: open.length,
    answersPerOpen: open.length ? open.reduce((n, p) => n + p.answers.length, 0) / open.length : null,
    quotedAnswers: quoted.length,
    quotesVerified: quoted.filter((a) => a.evidenceQuote !== null).length,
    hintsGiven: hinted.length,
    hintsRemoved: hinted.filter((p) => p.hint === null).length,
    promptsDropped: drops.filter((d) => d.what === "prompt" || d.what === "response").length,
    answersDropped: drops.filter((d) => d.what.startsWith("answer")).length,
    dropsByReason,
    enoughForGame: prompts.length >= MIN_GAME_PROMPTS,
    drops,
    verify: applied && {
      answersRemoved: applied.answersRemoved,
      promptsRemoved: applied.promptsRemoved,
      unverified: applied.unverified,
      drops: applied.dropped,
    },
    select: selected && { candidates: verified.length, removed: selected.dropped.length, drops: selected.dropped },
  };
}

/** Accepts a SavedResponse or a bare Gemini response (older generate:check --save files). */
export function unwrapSaved(json: unknown): { response: unknown; saved: SavedResponse | null } {
  const o = json as Partial<SavedResponse> | null;
  if (o && typeof o === "object" && "response" in o && !("prompts" in o)) return { response: o.response, saved: o as SavedResponse };
  return { response: json, saved: null };
}

// ---------- Table ----------

/** `verifyRun`: the verification call (F16), when the card includes the pass. */
export type ScorecardRow = { deck: string; pages: number; run: RunInfo | null; card: Scorecard | null; note?: string; verifyRun?: RunInfo | null };

const KIND_SHORT: Record<Kind, string> = { open: "o", cloze: "c", definition_to_term: "d", ordered_recall: "r", odd_one_out: "x" };

/**
 * A markdown table, one row per deck plus a total, ready to paste into the spec. When any card
 * includes the verification pass, three columns are added: Answers / Prompts it removed, and
 * the verification call's seconds and cost. When any card includes selection (F17), a
 * "Selected" column shows candidates → kept.
 */
export function formatScorecardTable(rows: ScorecardRow[]): string {
  const verified = rows.some((r) => r.card?.verify);
  const selected = rows.some((r) => r.card?.select);
  const head = [
    "Deck",
    "Pages",
    "Model",
    "Prompts ret → kept",
    `Kinds (${KINDS.map((k) => KIND_SHORT[k]).join("/")})`,
    "Open",
    "Ans/Open",
    "Quotes ok",
    "Hints removed",
    "Dropped P / A",
    "Drops by reason",
    "s",
    "$",
    ...(verified ? ["Verify removed A / P", "Verify s", "Verify $"] : []),
    ...(selected ? ["Selected"] : []),
  ];
  const lines = [row(head), row(head.map(() => "---"))];
  const pct = (n: number, d: number) => (d ? `${n}/${d} (${Math.round((100 * n) / d)}%)` : "–");
  const money = (n: number | null | undefined) => (n == null ? "?" : n.toFixed(3));
  const reasons = (r: Record<string, number>) =>
    Object.entries(r)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k, n]) => `${k} ${n}`)
      .join(", ") || "–";

  for (const { deck, pages, run, card, note, ...rest } of rows) {
    if (!card) {
      lines.push(row([deck, String(pages || "–"), "–", note ?? "skipped", ...Array(head.length - 4).fill("")]));
      continue;
    }
    lines.push(
      row([
        deck,
        String(pages),
        run?.model ?? "?",
        `${card.returned} → ${card.kept}${card.enoughForGame ? "" : " ⚠"}`,
        KINDS.map((k) => card.kinds[k]).join("/"),
        String(card.openPrompts),
        card.answersPerOpen === null ? "–" : card.answersPerOpen.toFixed(1),
        pct(card.quotesVerified, card.quotedAnswers),
        card.hintsGiven ? `${card.hintsRemoved}/${card.hintsGiven}` : "–",
        `${card.promptsDropped} / ${card.answersDropped}`,
        reasons(card.dropsByReason),
        run ? run.seconds.toFixed(0) : "?",
        money(run?.costUsd),
        ...(verified ? verifyCells(card.verify, rest.verifyRun) : []),
        ...(selected ? [card.select ? `${card.select.candidates} → ${card.kept}` : "–"] : []),
      ]),
    );
  }

  const scored = rows.filter((r) => r.card) as (ScorecardRow & { card: Scorecard })[];
  if (scored.length > 1) {
    const sum = (f: (c: Scorecard) => number) => scored.reduce((n, r) => n + f(r.card), 0);
    const open = sum((c) => c.openPrompts);
    const openAnswers = sum((c) => (c.answersPerOpen ?? 0) * c.openPrompts);
    const total: Record<string, number> = {};
    for (const r of scored) for (const [k, n] of Object.entries(r.card.dropsByReason)) total[k] = (total[k] ?? 0) + n;
    const runs = scored.map((r) => r.run);
    lines.push(
      row([
        "**Total**",
        String(scored.reduce((n, r) => n + r.pages, 0)),
        "",
        `${sum((c) => c.returned)} → ${sum((c) => c.kept)}`,
        KINDS.map((k) => sum((c) => c.kinds[k])).join("/"),
        String(open),
        open ? (openAnswers / open).toFixed(1) : "–",
        pct(sum((c) => c.quotesVerified), sum((c) => c.quotedAnswers)),
        `${sum((c) => c.hintsRemoved)}/${sum((c) => c.hintsGiven)}`,
        `${sum((c) => c.promptsDropped)} / ${sum((c) => c.answersDropped)}`,
        reasons(total),
        runs.every(Boolean) ? runs.reduce((n, r) => n + r!.seconds, 0).toFixed(0) : "?",
        runs.every((r) => r?.costUsd != null) ? money(runs.reduce((n, r) => n + r!.costUsd!, 0)) : "?",
        ...(verified ? verifyTotal() : []),
        ...(selected ? [`${sum((c) => c.select?.candidates ?? c.kept)} → ${sum((c) => c.kept)}`] : []),
      ]),
    );
  }
  return lines.join("\n");

  function verifyCells(v: VerifyCard | null, vr: RunInfo | null | undefined) {
    if (!v) return ["–", "", ""];
    return [`${v.answersRemoved} / ${v.promptsRemoved}`, vr ? vr.seconds.toFixed(0) : "?", money(vr?.costUsd)];
  }

  function verifyTotal() {
    const vs = scored.filter((r) => r.card.verify);
    const vruns = vs.map((r) => r.verifyRun);
    return [
      `${vs.reduce((n, r) => n + r.card.verify!.answersRemoved, 0)} / ${vs.reduce((n, r) => n + r.card.verify!.promptsRemoved, 0)}`,
      vruns.every(Boolean) ? vruns.reduce((n, r) => n + r!.seconds, 0).toFixed(0) : "?",
      vruns.every((r) => r?.costUsd != null) ? money(vruns.reduce((n, r) => n + r!.costUsd!, 0)) : "?",
    ];
  }

  function row(cells: string[]) {
    return `| ${cells.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`;
  }
}
