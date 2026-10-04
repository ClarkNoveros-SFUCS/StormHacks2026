import { readJson, runRoute } from "@/lib/runs/http";
import { guess } from "@/lib/runs/run-engine";

// Body: GuessBody ({ text } | { order } | { option }, optional position). → GuessResponse
export async function POST(req: Request, ctx: RouteContext<"/api/runs/[runId]/guess">) {
  const { runId } = await ctx.params;
  return runRoute(async (tx, playerId, now) => guess(tx, playerId, runId, await readJson(req), now));
}
