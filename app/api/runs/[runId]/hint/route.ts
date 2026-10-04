import { runRoute } from "@/lib/runs/http";
import { revealHint } from "@/lib/runs/run-engine";

// Reveals the current single-answer Prompt's Hint (drops it one Tier). → HintResponse
export async function POST(_req: Request, ctx: RouteContext<"/api/runs/[runId]/hint">) {
  const { runId } = await ctx.params;
  return runRoute((tx, playerId, now) => revealHint(tx, playerId, runId, now));
}
