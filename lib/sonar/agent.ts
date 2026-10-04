import "server-only";
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { Annotation, END, MemorySaver, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { recentMistakes } from "./mistakes";
import { describeContext, mistakeLine } from "./page-context";
import { customModuleFor, type CustomModule } from "./module-scope";
import { loadSonarModel } from "./queries";
import { buildTools, scopeFor } from "./tools";
import type { Action, ChatResponse, PageContext, SonarModel } from "./types";

// Sonar (F32): the coach agent. observe (no LLM: fresh numbers) → coach (Claude Sonnet 5.5, Gemini as fallback; + tools) ⇄ tools → END.
// Memory: MemorySaver keyed by the Player id, on globalThis so dev reloads keep it. The snapshot
// is a separate state field, rebuilt every turn and never added to the message history.
// Spec: docs/architecture/sonar.md § The Sonar agent.

const HISTORY = 16;

export const PERSONA = `You are Sonar, a baby dolphin and the study buddy of Lumen the anglerfish, inside the quiz game Lumen.
Voice: warm, playful, brief. Under 90 words unless the Player asks you to explain something. No headings. Light markdown only (inline code is fine).
Be specific: quote the Player's own wrong answers and the reading.
Never invent numbers or facts. Percentages and counts come only from the snapshot or your tools. If you don't know, say so or use a tool.
To explain a concept, read it first (read_topic for Python Basics, read_source_page for the Player's own files) and quote it.
Cards are the links: never write links or URLs. At most 3 Read cards and one Game card per turn. When the Player asks to go to pages, give a Read card per page; never say you can't link.
Each Player message starts with a [Page: …] tag. Earlier messages may be from other pages: act on the current page (the snapshot), not an old one.
Python Basics: the snapshot has a concept map and the planner's ranked actions; call recommend with a rank (or a gameId with a reason).
The Player's own Module (its page, or a Reveal/Game of one of its Games): there is no concept map and no planner. Stay on that Module and never bring up Python Basics unless asked. Reason from their misses and the pages they came from (read_source_page), then decide:
- Gaps in what a page teaches (wrong answers clustered on a few pages) → suggest_reading for the page with the most misses.
- Recall or speed (timeouts, near-misses, or they've read it already) → recommend one of this Module's ready Games (gameId), or propose_game on that file in a Mode that fits: recognition → leap, recall → dive, misconceptions → blitz.
Show both a Read and a Game card when both help; say which to do first and why.`;

/** `custom`: the page belongs to the Player's own Module (lib/sonar/module-scope.ts). */
export function briefingFor(ctx: PageContext, custom = false): string {
  const where =
    ctx.kind === "module" ? "in this Module"
    : ctx.kind === "reveal" ? "after this Run"
    : ctx.kind === "topic" ? "on this Topic"
    : custom ? "in this Module"
    : "in Python Basics";
  const then = custom
    ? "then decide between reading and playing: suggest_reading for the page their misses cluster on, and/or recommend one of this Module's ready Games or propose_game for that file"
    : "then call recommend";
  return `(Briefing) Brief the Player on where they stand ${where}, in 3–4 short sentences, ${then}.`;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The compact numbers the coach sees: concepts, root cause, the planner's top 3. */
export function modelSnapshot(m: SonarModel): string {
  if (m.observations === 0) return "Python Basics: the Player hasn't played any Course Games yet (no mastery data).";
  const byId = new Map(m.concepts.map((c) => [c.id, c]));
  const lines = [`Python Basics mastery (${m.observations} guesses replayed). Concept: mastery, status, blame share:`];
  for (const c of m.concepts) lines.push(`- ${c.id} "${c.name}" [${c.topicSlug}]: ${c.n ? pct(c.pEff) : "-"}, ${c.status}${c.blame ? `, blame ${pct(c.blame)}` : ""}`);
  lines.push(`Topics (Course says / Sonar says): ${m.topics.map((t) => `${t.number} ${t.slug} ${t.coursePassed ? "passed" : "not passed"} / ${pct(t.sonarMastery)}`).join("; ")}`);
  const rc = m.rootCause;
  lines.push(
    rc
      ? `Root cause: ${rc.conceptId} (${byId.get(rc.conceptId)?.name ?? rc.conceptId}) holds ${pct(rc.blameShare)} of the blame for ${rc.misses} of the last 10 misses, which were on ${rc.missedOn.join(", ")}.`
      : "Root cause: none found.",
  );
  lines.push("Planner's ranked actions (recommend with rank):");
  m.actions.slice(0, 3).forEach((a, i) => lines.push(`  rank ${i}: [${a.kind}] ${a.title}: ${a.why}`));
  return lines.join("\n");
}

const State = Annotation.Root({
  ...MessagesAnnotation.spec,
  snapshot: Annotation<string>(),
});

type Store = { saver?: MemorySaver };
const store = globalThis as unknown as { sonarMemory?: Store };
const memory = (store.sonarMemory ??= {});
const checkpointer = (memory.saver ??= new MemorySaver());

// The coach model. SONAR_MODEL "claude-…" (the default) calls Anthropic directly with ANTHROPIC_API_KEY;
// "anthropic/<model>" goes through the LangSmith LLM Gateway with LANGSMITH_API_KEY (beta, the org must have it
// enabled; the Anthropic key is then a Provider Secret in LangSmith). Gemini (GEMINI_MODEL, then
// GEMINI_FALLBACK_MODEL) is the fallback, and the only model when no Claude key is set.
export const DEFAULT_SONAR_MODEL = "claude-sonnet-5-5";
const LANGSMITH_GATEWAY = "https://gateway.smith.langchain.com";
const isClaude = (model: string) => /^(anthropic\/|claude-)/.test(model);

function claudeModel(model: string) {
  const viaGateway = model.startsWith("anthropic/");
  const apiKey = viaGateway ? process.env.LANGSMITH_API_KEY : process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new ChatAnthropic({
    model,
    apiKey,
    ...(viaGateway ? { anthropicApiUrl: LANGSMITH_GATEWAY } : {}),
    maxTokens: 2048,
    maxRetries: 1,
    // Sonnet 5.5 can't disable thinking; "between_tools" turns it off, so replies are quick and the trimmed
    // history never replays thinking blocks (Claude rejects those once earlier history changes).
    invocationKwargs: { thinking: { type: "between_tools" } },
  });
}

function geminiModel(model: string) {
  return new ChatGoogleGenerativeAI({
    model,
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.5,
    maxRetries: 1,
    thinkingConfig: { thinkingBudget: 0 },
  });
}

/** The models to try in order: Claude (when its key is set), then Gemini. */
export function coachModels(): (ChatAnthropic | ChatGoogleGenerativeAI)[] {
  const primary = process.env.SONAR_MODEL || DEFAULT_SONAR_MODEL;
  const claude = isClaude(primary) ? claudeModel(primary) : null;
  const gemini = [isClaude(primary) ? undefined : primary, process.env.GEMINI_MODEL, process.env.GEMINI_FALLBACK_MODEL]
    .filter((m, i, all): m is string => !!m && all.indexOf(m) === i);
  return [...(claude ? [claude] : []), ...(process.env.GEMINI_API_KEY ? gemini.map(geminiModel) : [])];
}

/** The last ~16 messages, starting at a Player message so no tool call is cut from its result. */
export function trimHistory(messages: BaseMessage[], max = HISTORY): BaseMessage[] {
  if (messages.length <= max) return messages;
  let i = messages.length - max;
  while (i < messages.length && messages[i].getType() !== "human") i++;
  return i < messages.length ? messages.slice(i) : messages.slice(-1);
}

export class SonarModelError extends Error {}

/** The Player's message as stored in history, tagged with the page it was sent from. */
export function tagPage(text: string, ctx: PageContext, mod: CustomModule | null): string {
  return `[Page: ${ctx.kind} ${ctx.path}${mod ? `, Module "${mod.name}"` : ""}]\n${text}`;
}

export async function runSonar({
  playerId,
  message,
  context,
  chatId,
}: {
  playerId: string;
  message?: string;
  context: PageContext;
  /** A saved chat in the drawer: its own memory thread. Omitted = the Player's one default thread. */
  chatId?: string;
}): Promise<ChatResponse> {
  const sink: Action[] = [];
  let modelP: Promise<SonarModel> | undefined;
  const getModel = () => (modelP ??= loadSonarModel(playerId));
  const moduleP = customModuleFor(playerId, context);
  const getModule = () => moduleP;
  const tools = buildTools(playerId, context, sink, getModel, getModule);

  const [first, ...rest] = coachModels().map((m) => m.bindTools(tools));
  if (!first) throw new SonarModelError("Set LANGSMITH_API_KEY (Claude via the LangSmith gateway) or GEMINI_API_KEY and GEMINI_MODEL");
  const llm = rest.length ? first.withFallbacks(rest) : first;

  const observe = async () => {
    const scope = scopeFor(context);
    const mod = await moduleP;
    const [m, page, misses] = await Promise.all([
      mod ? null : getModel(),
      describeContext(playerId, context, mod),
      recentMistakes(playerId, scope, 8),
    ]);
    const snapshot = [
      `Now: ${new Date().toISOString()}`,
      page,
      m ? modelSnapshot(m) : `This page is the Player's own Module "${mod!.name}": no Python Basics data, no planner ranks.`,
      misses.length ? `Latest ${misses.length} mistakes (${scope.kind === "course" ? "Python Basics" : `this ${scope.kind}`}; a sample, not a total, so don't count them as one):\n${misses.map(mistakeLine).join("\n")}` : "No recent mistakes in this scope.",
    ].join("\n\n");
    return { snapshot };
  };

  const coach = async (state: typeof State.State) => {
    const system = new SystemMessage(`${PERSONA}\n\n=== SNAPSHOT (fresh this turn) ===\n${state.snapshot}`);
    try {
      const reply = await llm.invoke([system, ...trimHistory(state.messages)]);
      return { messages: [reply] };
    } catch (e) {
      throw new SonarModelError(e instanceof Error ? e.message : String(e));
    }
  };

  const graph = new StateGraph(State)
    .addNode("observe", observe)
    .addNode("coach", coach)
    .addNode("tools", new ToolNode(tools))
    .addEdge(START, "observe")
    .addEdge("observe", "coach")
    .addConditionalEdges("coach", toolsCondition, ["tools", END])
    .addEdge("tools", "coach")
    .compile({ checkpointer });

  const mod = await moduleP;
  const text = tagPage(message?.trim() || briefingFor(context, !!mod), context, mod);
  const out = await graph.invoke(
    { messages: [new HumanMessage(text)] },
    { configurable: { thread_id: chatId ? `sonar:${playerId}:${chatId}` : `sonar:${playerId}` }, recursionLimit: 12 },
  );
  // Every AI message of this turn (after the Player's message): Claude often explains before it calls
  // recommend and adds only a short line after, so the last message alone would drop the explanation.
  const turnStart = out.messages.findLastIndex((m) => m.getType() === "human");
  const reply =
    out.messages
      .slice(turnStart + 1)
      .filter((m) => m instanceof AIMessage || m.getType() === "ai")
      .map((m) => m.text?.trim())
      .filter(Boolean)
      .join("\n\n") || "Here's what I'd do next.";
  return { reply, actions: sink };
}
