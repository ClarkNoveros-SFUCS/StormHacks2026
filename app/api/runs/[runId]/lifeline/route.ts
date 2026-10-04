import { runRoute } from "@/lib/runs/http";
import { applyLifeline } from "@/lib/runs/run-engine";

// Leap's one 50/50 per Run, on the current question. Optional body { position }.
// → LifelineResponse { hiddenOptionIds, state }. Other Modes get 409.
export async function POST(req: Request, ctx: RouteContext<"/api/runs/[runId]/lifeline">) {
  const { runId } = await ctx.params;
  const text = await req.text();
  let body: unknown;
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return Response.json({ error: "Send a JSON body" }, { status: 400 });
    }
  }
  return runRoute((tx, playerId, now) => applyLifeline(tx, playerId, runId, body, now));
}
