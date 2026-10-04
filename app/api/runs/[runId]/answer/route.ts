import { runRoute } from "@/lib/runs/http";
import { answer } from "@/lib/runs/run-engine";

// Leap: { optionId: "A"|"B"|"C"|"D", position? } → LeapAnswerResponse
// Blitz: { value: boolean, position? } → BlitzAnswerResponse
// Other Modes get 409 (Dive and Apogee use /guess).
export async function POST(req: Request, ctx: RouteContext<"/api/runs/[runId]/answer">) {
  const { runId } = await ctx.params;
  // Read the body before the transaction opens; unparseable JSON becomes undefined → 400
  const body: unknown = await req.json().catch(() => undefined);
  return runRoute((tx, playerId, now) => answer(tx, playerId, runId, body, now));
}
