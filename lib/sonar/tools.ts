import "server-only";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getTopic } from "@/lib/courses/queries";
import { sql } from "@/lib/db";
import { isUuid, recentMistakes, type MistakeScope } from "./mistakes";
import { mistakeLine } from "./page-context";
import { customModuleFor, type CustomModule } from "./module-scope";
import { checkPlayable, checkProposal, checkReading } from "./playable";
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

/** One Game card (play or create) per turn. */
const hasGameCard = (sink: Action[]) => sink.some((a) => a.kind === "play" || a.kind === "create_game");

/**
 * `getModel` and `getModule` let the agent share one load per request; they default to loading on
 * first use. `getModule` is the Player's own Module the page belongs to: when set, the tools stay on
 * it (no planner ranks, no Games from elsewhere).
 */
export function buildTools(
  playerId: string,
  ctx: PageContext,
  sink: Action[],
  getModel?: () => Promise<SonarModel>,
  getModule?: () => Promise<CustomModule | null>,
) {
  let cached: Promise<SonarModel> | undefined;
  let cachedModule: Promise<CustomModule | null> | undefined;
  getModel ??= () => (cached ??= loadSonarModel(playerId));
  getModule ??= () => (cachedModule ??= customModuleFor(playerId, ctx));
  const model = getModel;
  const ownModule = getModule;

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
      const mod = await ownModule();
      const s: MistakeScope =
        scope === "course" ? { kind: "course" }
        : scope === "module" ? (mod ? { kind: "module", moduleId: mod.moduleId } : scopeFor(ctx))
        : scopeFor(ctx);
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
        scope: z.enum(["page", "module", "course"]).optional()
          .describe("page = this page's Module/Run/Game (default); module = every Game of the Player's Module this page belongs to; course = Python Basics"),
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
      if (hasGameCard(sink)) return "You already showed a Game card this turn.";
      const mod = await ownModule();
      if (rank !== undefined) {
        if (mod) return `Planner ranks are Python Basics only. This page is the Player's Module "${mod.name}": pass a gameId of one of its ready Games, or use propose_game.`;
        const a = (await model()).actions[rank];
        if (!a) return `No planner action at rank ${rank}.`;
        sink.push(a.kind === "play" ? { ...a, source: "planner", rank } : a.kind === "read" ? { ...a, source: "planner" } : a);
        return `Recommended: ${a.title}. The card is shown; don't repeat the link.`;
      }
      if (!gameId) return "Pass either rank (0–2) or gameId with why.";
      if (!why) return "Sonar's pick needs a one-line why.";
      const p = await checkPlayable(playerId, gameId, mod?.moduleId);
      if (!p.ok) return `Can't recommend that Game: ${p.reason}. ${mod ? "Pick another of this Module's Games or use propose_game." : "Pick another or use a planner rank."}`;
      sink.push({
        kind: "play", gameId, mode: p.mode, title: p.title, conceptId: null, topicSlug: p.topicSlug,
        why, source: "sonar", rank: null,
      });
      return `Recommended: ${p.title} (${p.mode}). The card is shown; don't repeat the link.`;
    },
    {
      name: "recommend",
      description:
        "Show the Player a card to start a Game. On Python Basics pages, rank (0–2) picks one of the planner's ranked actions (preferred). On the Player's own Module (Module page, or a Reveal/Game of a Module Game) ranks are refused: pass gameId + why for one of that Module's ready Games.",
      schema: z.object({
        rank: z.number().int().min(0).max(2).optional(),
        gameId: z.string().optional(),
        why: z.string().max(160).optional().describe("One line for the card, required with gameId"),
      }),
    },
  );

  const proposeGame = tool(
    async ({ sourceDocumentIds, mode, title, why }) => {
      const mod = await ownModule();
      if (!mod) return "propose_game only works on the Player's own Module (its page, or a Reveal of one of its Games).";
      if (hasGameCard(sink)) return "You already showed a Game card this turn.";
      const moduleId = mod.moduleId;
      const p = await checkProposal(playerId, { moduleId, sourceDocumentIds, mode });
      if (!p.ok) return `Can't propose that Game: ${p.reason}`;
      sink.push({ kind: "create_game", moduleId, sourceDocumentIds: [...new Set(sourceDocumentIds)], mode: p.mode, title, why, source: "sonar" });
      return "Proposed. The Player sees a confirm card; don't claim the Game exists yet.";
    },
    {
      name: "propose_game",
      description:
        "Propose a new Game from whole files of the Player's Module this page belongs to (the Module is taken from the page). The Player confirms on a card; nothing is created yet. Modes: leap (recognition), dive (recall), blitz (misconceptions), pairs, apogee, arena.",
      schema: z.object({
        sourceDocumentIds: z.array(z.string()).min(1),
        mode: z.string(),
        title: z.string().min(1).max(80),
        why: z.string().max(160),
      }),
    },
  );

  const suggestReading = tool(
    async ({ documentId, page, why }) => {
      const mod = await ownModule();
      if (!mod) return "suggest_reading only works on the Player's own Module. For Python Basics use a planner rank.";
      if (sink.some((a) => a.kind === "read")) return "You already showed a Read card this turn.";
      const r = await checkReading(playerId, mod.moduleId, documentId, page);
      if (!r.ok) return `Can't suggest that page: ${r.reason}`;
      sink.push({ kind: "read", href: `/modules/files/${documentId}?page=${page}`, title: `Read: ${r.filename} p.${page}`, why, source: "sonar" });
      return "Suggested. The Player sees a Read card that opens the page; don't repeat the link.";
    },
    {
      name: "suggest_reading",
      description:
        "Show the Player a Read card that opens one page of a file in their Module (the one this page belongs to) as study notes. Use it when misses show a gap in what the page teaches.",
      schema: z.object({
        documentId: z.string().describe("A file's documentId from the Module"),
        page: z.number().int().min(1),
        why: z.string().max(160).describe("One line for the card: what this page covers that they missed"),
      }),
    },
  );

  return [getConcept, getMistakes, readTopic, readSourcePage, recommend, proposeGame, suggestReading];
}
