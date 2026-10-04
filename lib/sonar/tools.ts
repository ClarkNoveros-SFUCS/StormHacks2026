import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getTopic } from "@/lib/courses/queries";
import { sql } from "@/lib/db";
import { isUuid, recentMistakes, type MistakeScope } from "./mistakes";
import { mistakeLine } from "./page-context";
import { checkPlayable, checkProposal } from "./playable";
import { loadSonarModel } from "./queries";
import type { Action, PageContext, SonarModel } from "./types";

// Sonar (F32): the agent's tools. Read tools return compact text; `recommend` and
// `propose_game` validate on the server and push an Action into the per-request sink, which the
// chat API returns as cards. An invalid call returns an error string so the model can retry.

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The scope a page implies for "my mistakes here". */
export function scopeFor(ctx: PageContext): MistakeScope {
  if (ctx.kind === "module" && ctx.moduleId) return { kind: "module", moduleId: ctx.moduleId };
  if (ctx.kind === "reveal" && ctx.runId) return { kind: "run", runId: ctx.runId };
  if (ctx.kind === "game" && ctx.gameId) return { kind: "game", gameId: ctx.gameId };
  return { kind: "course" };
}

/** `getModel` lets the agent share one model load per request; it defaults to loading on first use. */
export function buildTools(playerId: string, ctx: PageContext, sink: Action[], getModel?: () => Promise<SonarModel>) {
  let cached: Promise<SonarModel> | undefined;
  getModel ??= () => (cached ??= loadSonarModel(playerId));
  const model = getModel;

  const getConcept = tool(
    async ({ id }) => {
      const m = await model();
      const c = m.concepts.find((x) => x.id === id);
      if (!c) return `Unknown concept "${id}". Known: ${m.concepts.map((x) => x.id).join(", ")}`;
      const name = (cid: string) => m.concepts.find((x) => x.id === cid)?.name ?? cid;
      const prereqs = m.edges.filter(([, b]) => b === id).map(([a]) => a);
      const deps = m.edges.filter(([a]) => a === id).map(([, b]) => b);
      const misses = (await recentMistakes(playerId, { kind: "course" }, 40)).filter((x) => x.conceptIds.includes(id)).slice(0, 5);
      return [
        `${c.name} (${c.id}), Topic ${c.topicSlug}, reading pages ${c.pages.join(",") || "?"}: ${c.summary}`,
        `mastery ${pct(c.pEff)} (${c.status}), ${c.n} observations, ${c.right} right, ${c.wrong} wrong, blame ${pct(c.blame)}`,
        `prerequisites: ${prereqs.map((p) => `${name(p)} (${p})`).join(", ") || "none"}`,
        `dependants: ${deps.map((p) => `${name(p)} (${p})`).join(", ") || "none"}`,
        misses.length ? `recent misses:\n${misses.map(mistakeLine).join("\n")}` : "no recent misses on it",
      ].join("\n");
    },
    {
      name: "get_concept",
      description: "One Python Basics Concept: the Player's mastery, status, prerequisites, dependants and recent misses on it.",
      schema: z.object({ id: z.string().describe("Concept id, e.g. comparison_ops") }),
    },
  );

  const getMistakes = tool(
    async ({ scope, conceptId, limit }) => {
      const s: MistakeScope =
        scope === "course" ? { kind: "course" } : scope === "page" || !scope ? scopeFor(ctx) : { kind: "course" };
      const list = await recentMistakes(playerId, s, conceptId ? 40 : (limit ?? 8));
      const picked = (conceptId ? list.filter((x) => x.conceptIds.includes(conceptId)) : list).slice(0, limit ?? 8);
      if (!picked.length) return "No mistakes found in that scope.";
      return picked
        .map((x) => `${mistakeLine(x)}${x.explanation ? `\n  why: ${x.explanation}` : ""}${x.evidence?.quote ? `\n  quote: "${x.evidence.quote}"` : ""}`)
        .join("\n");
    },
    {
      name: "get_mistakes",
      description:
        "The Player's recent wrong answers and timeouts: the Prompt, what they answered, the right answer, the explanation and the evidence page.",
      schema: z.object({
        scope: z.enum(["page", "course"]).optional().describe("page = this page's Module/Run/Game (default); course = Python Basics"),
        conceptId: z.string().optional().describe("Only misses on this Python Basics Concept"),
        limit: z.number().int().min(1).max(20).optional(),
      }),
    },
  );

  const readTopic = tool(
    async ({ topicSlug, page }) => {
      const t = await getTopic(ctx.courseSlug ?? "python-basics", topicSlug, playerId);
      if (!t) return `No Topic "${topicSlug}".`;
      const pages = page ? t.reading.pages.filter((p) => p.pageNumber === page) : t.reading.pages;
      if (!pages.length) return `Topic ${topicSlug} has pages 1–${t.reading.pages.length}.`;
      const body = pages.map((p) => `--- page ${p.pageNumber} ---\n${p.contentMd}`).join("\n");
      return `${t.title} (reading "${t.reading.title}")\n${body.slice(0, 6000)}`;
    },
    {
      name: "read_topic",
      description: "The reading of a Python Basics Topic (markdown), whole or one page. Quote it when you explain.",
      schema: z.object({
        topicSlug: z.string().describe("e.g. operators-expressions"),
        page: z.number().int().min(1).optional(),
      }),
    },
  );

  const readSourcePage = tool(
    async ({ documentId, page }) => {
      if (!isUuid(documentId)) return "documentId must be a file id from the Module.";
      const [p] = await sql<{ filename: string; content_md: string }[]>`
        select d.filename, sp.content_md from source_pages sp join source_documents d on d.id = sp.source_document_id
         where d.id = ${documentId} and d.player_id = ${playerId} and sp.page_number = ${page}`;
      return p ? `${p.filename} p.${page}\n${p.content_md.slice(0, 6000)}` : "No such page in the Player's files.";
    },
    {
      name: "read_source_page",
      description: "One page of one of the Player's own uploaded files (markdown).",
      schema: z.object({ documentId: z.string(), page: z.number().int().min(1) }),
    },
  );

  const recommend = tool(
    async ({ rank, gameId, why }) => {
      if (sink.some((a) => a.kind === "play")) return "You already recommended a Game this turn.";
      if (rank !== undefined) {
        const a = (await model()).actions[rank];
        if (!a) return `No planner action at rank ${rank}.`;
        sink.push(a.kind === "play" ? { ...a, source: "planner", rank } : a.kind === "read" ? { ...a, source: "planner" } : a);
        return `Recommended: ${a.title}. The card is shown; don't repeat the link.`;
      }
      if (!gameId) return "Pass either rank (0–2) or gameId with why.";
      if (!why) return "Sonar's pick needs a one-line why.";
      const p = await checkPlayable(playerId, gameId);
      if (!p.ok) return `Can't recommend that Game: ${p.reason}. Pick another or use a planner rank.`;
      sink.push({
        kind: "play", gameId, mode: p.mode, title: p.title, conceptId: null, topicSlug: p.topicSlug,
        why, source: "sonar", rank: null,
      });
      return `Recommended: ${p.title} (${p.mode}). The card is shown; don't repeat the link.`;
    },
    {
      name: "recommend",
      description:
        "Show the Player a card to start a Game. Either rank (0–2) picks one of the planner's ranked actions (preferred), or gameId + why recommends any other existing Game (Sonar's pick).",
      schema: z.object({
        rank: z.number().int().min(0).max(2).optional(),
        gameId: z.string().optional(),
        why: z.string().max(160).optional().describe("One line for the card, required with gameId"),
      }),
    },
  );

  const proposeGame = tool(
    async ({ moduleId, sourceDocumentIds, mode, title, why }) => {
      const p = await checkProposal(playerId, { moduleId, sourceDocumentIds, mode });
      if (!p.ok) return `Can't propose that Game: ${p.reason}`;
      sink.push({ kind: "create_game", moduleId, sourceDocumentIds: [...new Set(sourceDocumentIds)], mode: p.mode, title, why, source: "sonar" });
      return "Proposed. The Player sees a confirm card; don't claim the Game exists yet.";
    },
    {
      name: "propose_game",
      description:
        "Propose a new Game from whole files of the Player's Module. The Player confirms on a card; nothing is created yet. Modes: leap (recognition), dive (recall), blitz (misconceptions), pairs, apogee, arena.",
      schema: z.object({
        moduleId: z.string(),
        sourceDocumentIds: z.array(z.string()).min(1),
        mode: z.string(),
        title: z.string().min(1).max(80),
        why: z.string().max(160),
      }),
    },
  );

  return [getConcept, getMistakes, readTopic, readSourcePage, recommend, proposeGame];
}
