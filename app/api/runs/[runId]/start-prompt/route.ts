import { runRoute } from "@/lib/runs/http";
import { startPrompt } from "@/lib/runs/run-engine";

// Starts the current Prompt's 25 s clock; idempotent. → RunState
export async function POST(_req: Request, ctx: RouteContext<"/api/runs/[runId]/start-prompt">) {
  const { runId } = await ctx.params;
  return runRoute((tx, playerId, now) => startPrompt(tx, playerId, runId, now));
}
