import { runRoute } from "@/lib/runs/http";
import { timeoutPrompt } from "@/lib/runs/run-engine";

// The client's countdown hit zero (a Prompt, a Pairs Board or Blitz's clock); the server
// checks its own clock. → RunState
export async function POST(_req: Request, ctx: RouteContext<"/api/runs/[runId]/timeout">) {
  const { runId } = await ctx.params;
  return runRoute((tx, playerId, now) => timeoutPrompt(tx, playerId, runId, now));
}
