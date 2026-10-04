import { runRoute } from "@/lib/runs/http";
import { getReveal } from "@/lib/runs/run-engine";

// Every Prompt's Answers, Evidence and your results; 409 until the Run is finished. → Reveal
export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[runId]/reveal">) {
  const { runId } = await ctx.params;
  return runRoute((tx, playerId) => getReveal(tx, playerId, runId));
}
