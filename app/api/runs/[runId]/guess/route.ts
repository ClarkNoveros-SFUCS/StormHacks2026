import { runRoute } from "@/lib/runs/http";
import { guess } from "@/lib/runs/run-engine";

// Body: GuessBody ({ text } | { order } | { option }, optional position). → GuessResponse
export async function POST(req: Request, ctx: RouteContext<"/api/runs/[runId]/guess">) {
  const { runId } = await ctx.params;
  // Read the body before the transaction opens, so a slow upload can't hold a pooled connection.
  // Unparseable JSON becomes undefined, which the engine rejects with 400.
  const body: unknown = await req.json().catch(() => undefined);
  return runRoute((tx, playerId, now) => guess(tx, playerId, runId, body, now));
}
