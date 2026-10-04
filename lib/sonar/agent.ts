import "server-only";
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { Annotation, END, MemorySaver, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { recentMistakes } from "./mistakes";
import { describeContext, mistakeLine } from "./page-context";
import { loadSonarModel } from "./queries";
import { buildTools, scopeFor } from "./tools";
import type { Action, ChatResponse, PageContext, SonarModel } from "./types";

// Sonar (F32): the coach agent. observe (no LLM: fresh numbers) → coach (Gemini + tools) ⇄ tools → END.
// Memory: MemorySaver keyed by the Player id, on globalThis so dev reloads keep it. The snapshot
// is a separate state field, rebuilt every turn and never added to the message history.
// Spec: docs/architecture/sonar.md § The Sonar agent.

const HISTORY = 16;

export const PERSONA = `You are Sonar, a baby dolphin and the study buddy of Lumen the anglerfish, inside the quiz game Lumen.
Voice: warm, playful, brief. Under 90 words unless the Player asks you to explain something. No headings. Light markdown only (inline code is fine).
Be specific: quote the Player's own wrong answers and the reading.
Never invent numbers or facts. Percentages and counts come only from the snapshot or your tools. If you don't know, say so or use a tool.
To explain a concept, read it first (read_topic for Python Basics, read_source_page for the Player's own files) and quote it.
To suggest what to play, call recommend (prefer a planner rank; a gameId of your own needs a reason) or propose_game. Never write links or URLs; the card is the link.
Python Basics has a concept map in the snapshot. For the Player's own Modules there is no map: reason from their mistakes and pages.
On a Module page, when misses cluster in one file, offer propose_game for that file in a Mode that fits the weakness: recognition → leap, recall → dive, misconceptions → blitz.`;

export function briefingFor(ctx: PageContext): string {
  const where =
    ctx.kind === "module" ? "in this Module"
    : ctx.kind === "reveal" ? "after this Run"
    : ctx.kind === "topic" ? "on this Topic"
    : "in Python Basics";
  return `(Briefing) Brief the Player on where they stand ${where}, in 3–4 short sentences, then call recommend${ctx.kind === "module" ? " or propose_game" : ""}.`;
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

function chatModel(model: string) {
  return new ChatGoogleGenerativeAI({
    model,
    apiKey: process.env.GEMINI_API_KEY,
    temperature: 0.5,
    maxRetries: 1,
    thinkingConfig: { thinkingBudget: 0 },
  });
}

/** The last ~16 messages, starting at a Player message so no tool call is cut from its result. */
export function trimHistory(messages: BaseMessage[], max = HISTORY): BaseMessage[] {
  if (messages.length <= max) return messages;
  let i = messages.length - max;
  while (i < messages.length && messages[i].getType() !== "human") i++;
  return i < messages.length ? messages.slice(i) : messages.slice(-1);
}

export class SonarModelError extends Error {}

export async function runSonar({ playerId, message, context }: { playerId: string; message?: string; context: PageContext }): Promise<ChatResponse> {
  const sink: Action[] = [];
  let modelP: Promise<SonarModel> | undefined;
  const getModel = () => (modelP ??= loadSonarModel(playerId));
  const tools = buildTools(playerId, context, sink, getModel);

  const primary = process.env.SONAR_MODEL || process.env.GEMINI_MODEL;
  if (!primary || !process.env.GEMINI_API_KEY) throw new SonarModelError("GEMINI_API_KEY and GEMINI_MODEL must be set");
  const fallbackName = process.env.GEMINI_FALLBACK_MODEL;
  const bound = chatModel(primary).bindTools(tools);
  const llm = fallbackName && fallbackName !== primary ? bound.withFallbacks([chatModel(fallbackName).bindTools(tools)]) : bound;

  const observe = async () => {
    const scope = scopeFor(context);
    const [m, page, misses] = await Promise.all([
      getModel(),
      describeContext(playerId, context),
      recentMistakes(playerId, scope, 8),
    ]);
    const snapshot = [
      `Now: ${new Date().toISOString()}`,
      page,
      modelSnapshot(m),
      misses.length ? `Recent mistakes (${scope.kind === "course" ? "Python Basics" : `this ${scope.kind}`}):\n${misses.map(mistakeLine).join("\n")}` : "No recent mistakes in this scope.",
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

  const text = message?.trim() || briefingFor(context);
  const out = await graph.invoke(
    { messages: [new HumanMessage(text)] },
    { configurable: { thread_id: `sonar:${playerId}` }, recursionLimit: 12 },
  );
  const last = [...out.messages].reverse().find((m) => m instanceof AIMessage || m.getType() === "ai");
  const reply = last?.text?.trim() || "Here's what I'd do next.";
  return { reply, actions: sink };
}
