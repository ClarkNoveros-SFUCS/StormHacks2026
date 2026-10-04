import { runRoute } from "@/lib/runs/http";
import { startPrompt } from "@/lib/runs/run-engine";

// Starts the current clock, idempotent: the Prompt (Dive/Apogee 25 s, Leap 15 s), the Pairs
// Board (60 s), or Blitz's one 60 s clock. → RunState
export async function POST(_req: Request, ctx: RouteContext<"/api/runs/[runId]/start-prompt">) {
  const { runId } = await ctx.params;
  return runRoute((tx, playerId, now) => startPrompt(tx, playerId, runId, now));
}
