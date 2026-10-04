import { runRoute } from "@/lib/runs/http";
import { pair } from "@/lib/runs/run-engine";

// Pairs: { termId, definitionId, board? } → PairResponse. Other Modes get 409.
export async function POST(req: Request, ctx: RouteContext<"/api/runs/[runId]/pair">) {
  const { runId } = await ctx.params;
  // Read the body before the transaction opens; unparseable JSON becomes undefined → 400
  const body: unknown = await req.json().catch(() => undefined);
  return runRoute((tx, playerId, now) => pair(tx, playerId, runId, body, now));
}
