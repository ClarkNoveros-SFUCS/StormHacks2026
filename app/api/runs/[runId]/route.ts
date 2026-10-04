import { runRoute } from "@/lib/runs/http";
import { getRunState } from "@/lib/runs/run-engine";

// → RunState
export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[runId]">) {
  const { runId } = await ctx.params;
  return runRoute((tx, playerId, now) => getRunState(tx, playerId, runId, now));
}
